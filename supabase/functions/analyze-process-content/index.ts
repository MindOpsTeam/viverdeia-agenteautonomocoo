// analyze-process-content (Sprint 20)
// Recebe texto (transcrição/documento) OU um documento (pdf/docx base64) + company_id,
// e usa o Claude (chave Anthropic do Vault) para identificar os PROCESSOS mencionados e
// estruturar cada um em passos. Retorna um array — 1 ou N processos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `
Você analisa um conteúdo (transcrição de reunião/áudio/vídeo, documento ou texto) e identifica os
PROCESSOS operacionais mencionados, estruturando cada um em passos claros e acionáveis.
Responda SEMPRE em JSON estrito, sem markdown, neste formato:
{ "processes": [ { "name": "nome curto do processo", "area": "área responsável ou string vazia", "steps": [ { "description": "o que fazer", "responsible": "cargo/pessoa ou vazio", "sla": "prazo ou vazio" } ] } ] }
Identifique MÚLTIPLOS processos se o conteúdo cobrir mais de um (ex.: uma reunião que fala de "fechamento de contrato" e "onboarding de cliente").
Se não houver processo operacional claro, retorne { "processes": [] }.
`.trim();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function parseJsonBlock(text: string): any {
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

function normProcesses(parsed: any): any[] {
  const arr = Array.isArray(parsed?.processes) ? parsed.processes : [];
  return arr.map((p: any) => ({
    name: String(p?.name ?? "").trim().slice(0, 120) || "Processo sem nome",
    area: String(p?.area ?? "").trim().slice(0, 80),
    steps: (Array.isArray(p?.steps) ? p.steps : []).map((s: any) => ({
      description: String(s?.description ?? "").trim(),
      responsible: String(s?.responsible ?? "").trim(),
      sla: String(s?.sla ?? "").trim(),
    })).filter((s: any) => s.description),
  })).filter((p: any) => p.steps.length);
}

async function callClaude(anthropicKey: string, content: any, maxTokens = 2500): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Claude ${res.status}: ${b.slice(0, 300)}`);
  }
  const data = await res.json();
  return parseJsonBlock((data.content?.[0]?.text ?? "").trim());
}

// DOCX best-effort: descompacta e extrai o texto de word/document.xml.
async function extractDocxText(base64: string): Promise<string> {
  const mod: any = await import("https://esm.sh/jszip@3.10.1");
  const JSZip = mod.default ?? mod;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { ok: false, error: "Não autorizado" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json(401, { ok: false, error: "Token inválido" });
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { company_id, text, document } = await req.json().catch(() => ({}));
    if (!company_id) return json(400, { ok: false, error: "company_id obrigatório" });
    if (!text && !document) return json(400, { ok: false, error: "Forneça 'text' ou 'document'" });

    const { data: anthropicKey } = await userClient.rpc("read_credential" as any, { p_company_id: company_id, p_service: "anthropic" });
    if (!anthropicKey) return json(400, { ok: false, error: "Credencial Anthropic ausente." });

    let content: any;
    if (document?.data_base64) {
      if (/pdf/i.test(document.mime ?? "")) {
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: document.data_base64 } },
          { type: "text", text: "Identifique os processos deste documento e estruture em JSON estrito." },
        ];
      } else {
        let docText = "";
        try { docText = await extractDocxText(document.data_base64); } catch (_) { docText = ""; }
        if (docText.length < 40) return json(422, { ok: false, error: "Não consegui ler este arquivo. Converta para PDF e tente novamente." });
        content = `Documento:\n${docText.slice(0, 30000)}\n\nIdentifique os processos e estruture em JSON estrito.`;
      }
    } else {
      const t = String(text ?? "").trim();
      if (t.length < 20) return json(422, { ok: false, error: "Conteúdo muito curto para identificar processos." });
      content = `Conteúdo:\n${t.slice(0, 40000)}\n\nIdentifique os processos e estruture em JSON estrito.`;
    }

    const parsed = await callClaude(anthropicKey as string, content);
    const processes = normProcesses(parsed);
    return json(200, { ok: true, processes });
  } catch (e: any) {
    return json(502, { ok: false, error: e?.message ?? "Erro ao analisar conteúdo" });
  }
});
