// cerebro-ai: assistente de IA do Cérebro. Lê a chave Anthropic do cliente no Vault.
// mode="identity":  recebe respostas do wizard e propõe identidade + diretrizes iniciais
//                   (NÃO persiste — o usuário revisa e confirma no frontend).
// mode="directive": reformula uma ocorrência em linguagem natural numa diretriz estruturada
//                   (NÃO persiste — o frontend insere após confirmação).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-6";

const IDENTITY_SYSTEM = `
Você ajuda a configurar a identidade do Atlas, um agente autônomo que atua como COO (Chief Operations Officer) de uma empresa.
A partir das informações sobre a empresa e sobre como o agente deve agir, proponha uma identidade.
Responda SEMPRE em JSON estrito, sem markdown, neste formato:
{
  "agent_name": "nome curto do agente (ex.: Atlas)",
  "communication_tone": "direct" | "formal" | "informal",
  "presentation": "1-2 frases de como o agente se apresenta ao time",
  "mission": "o que o agente faz por esta empresa, em 1-2 frases",
  "target_audience": "com quem a empresa trabalha (público-alvo)",
  "cases": [{ "title": "título curto", "result": "resultado concreto já entregue" }],
  "directives": ["3 a 5 guardrails iniciais claros e acionáveis"]
}
`.trim();

const DIRECTIVE_SYSTEM = `
Você transforma o relato de uma ocorrência operacional (em linguagem natural) numa ÚNICA diretriz
clara, objetiva e acionável para o Atlas (agente autônomo de operações) seguir no futuro.
Responda SEMPRE em JSON estrito, sem markdown, neste formato:
{ "content": "a diretriz em uma frase imperativa" }
`.trim();

async function callClaude(anthropicKey: string, system: string, userPrompt: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data.content?.[0]?.text ?? "").trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error(`Claude não retornou JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

const PROCESS_IMPORT_SYSTEM = `
Você extrai um processo operacional de um documento e o estrutura em passos numerados.
Responda SEMPRE em JSON estrito, sem markdown, neste formato:
{
  "name": "nome curto do processo",
  "area": "área responsável (ex.: Financeiro, Marketing) ou string vazia",
  "steps": [ { "description": "o que fazer neste passo", "responsible": "cargo/pessoa ou vazio", "sla": "prazo ou vazio" } ]
}
`.trim();

// Variante que aceita content blocks (ex.: document PDF) além de texto.
async function callClaudeMessages(anthropicKey: string, system: string, content: any): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Claude ${res.status}: ${b.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data.content?.[0]?.text ?? "").trim();
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error(`Claude não retornou JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(s, e + 1));
}

// DOCX best-effort: descompacta o .docx e extrai o texto de word/document.xml.
async function extractDocxText(base64: string): Promise<string> {
  const mod: any = await import("https://esm.sh/jszip@3.10.1");
  const JSZip = mod.default ?? mod;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeSteps(raw: any): { description: string; responsible: string; sla: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    description: String(s?.description ?? "").trim(),
    responsible: String(s?.responsible ?? "").trim(),
    sla: String(s?.sla ?? "").trim(),
  })).filter((s) => s.description);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { company_id, mode, payload } = await req.json();
    if (!company_id || !mode) {
      return new Response(JSON.stringify({ error: "company_id e mode obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: anthropicKey } = await userClient.rpc("read_credential" as any, {
      p_company_id: company_id,
      p_service: "anthropic",
    });
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Credencial Anthropic ausente. Configure em Credenciais." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any;
    if (mode === "identity") {
      const userPrompt =
        `Sobre a empresa (o que faz, missão, público-alvo, cases/resultados):\n${payload?.about_company ?? "(não informado)"}\n\n` +
        `Sobre o agente (como deve agir):\n${payload?.about_agent ?? "(não informado)"}\n\n` +
        `Proponha a identidade em JSON estrito.`;
      const parsed = await callClaude(anthropicKey, IDENTITY_SYSTEM, userPrompt);
      const tone = ["direct", "formal", "informal"].includes(parsed.communication_tone)
        ? parsed.communication_tone : "direct";
      result = {
        agent_name: String(parsed.agent_name ?? "Atlas").slice(0, 60),
        communication_tone: tone,
        presentation: String(parsed.presentation ?? ""),
        mission: String(parsed.mission ?? ""),
        target_audience: String(parsed.target_audience ?? ""),
        cases: Array.isArray(parsed.cases) ? parsed.cases.map((c: any) => ({ title: String(c?.title ?? ""), result: String(c?.result ?? "") })).filter((c: any) => c.title).slice(0, 6) : [],
        directives: Array.isArray(parsed.directives) ? parsed.directives.map((d: any) => String(d)).slice(0, 6) : [],
      };
    } else if (mode === "directive") {
      const description = payload?.description ?? "";
      if (!description.trim()) {
        return new Response(JSON.stringify({ error: "payload.description obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = await callClaude(anthropicKey, DIRECTIVE_SYSTEM, `Ocorrência: ${description}`);
      result = { content: String(parsed.content ?? "").trim() };
    } else if (mode === "process_import") {
      const mime: string = payload?.mime ?? "";
      const dataB64: string = payload?.data_base64 ?? "";
      if (!dataB64) {
        return new Response(JSON.stringify({ error: "payload.data_base64 obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let parsed: any;
      if (/pdf/i.test(mime)) {
        parsed = await callClaudeMessages(anthropicKey, PROCESS_IMPORT_SYSTEM, [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: dataB64 } },
          { type: "text", text: "Extraia o processo deste documento em JSON estrito." },
        ]);
      } else {
        let textContent = "";
        try { textContent = await extractDocxText(dataB64); } catch (_) { textContent = ""; }
        if (textContent.length < 40) {
          return new Response(JSON.stringify({ error: "Não consegui extrair texto deste arquivo. Converta para PDF e tente novamente." }), {
            status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        parsed = await callClaudeMessages(anthropicKey, PROCESS_IMPORT_SYSTEM,
          `Documento:\n${textContent.slice(0, 20000)}\n\nExtraia o processo em JSON estrito.`);
      }
      result = {
        name: String(parsed?.name ?? "Processo importado").slice(0, 120),
        area: String(parsed?.area ?? "").slice(0, 80),
        steps: normalizeSteps(parsed?.steps),
      };
    } else {
      return new Response(JSON.stringify({ error: `mode inválido: ${mode}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, mode, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
