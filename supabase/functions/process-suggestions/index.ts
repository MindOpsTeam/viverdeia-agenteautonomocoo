// process-suggestions (Sprint 16): motor de sugestões de processos.
// Lê tasks concluídas + execution_logs das últimas 4 semanas, agrupa por semelhança
// com processos publicados; quando um padrão aparece em 3+ execuções e diverge do
// processo documentado, pede ao Claude um passo sugerido e salva em process_suggestions.
// Disparado pelo coo-tick 1x/dia (03:00 no fuso da empresa). Aproximação heurística.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-6";
const MIN_EXECUTIONS = 3;
const MAX_PROCESSES_PER_RUN = 8;

const SYSTEM = `
Você analisa execuções reais de um processo operacional e o processo DOCUMENTADO, e detecta
se há um passo recorrente sendo feito na prática que NÃO está documentado.
Responda SEMPRE em JSON estrito, sem markdown:
{ "has_suggestion": true|false, "step": { "description": "passo faltante", "responsible": "", "sla": "" } }
Só proponha (has_suggestion=true) se o passo aparecer de forma recorrente e claramente ausente do processo documentado.
`.trim();

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}
function tokens(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 3);
}

async function callClaude(anthropicKey: string, user: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text ?? "").trim();
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) return { has_suggestion: false };
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return { has_suggestion: false }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const calledByService = token === serviceKey;

    let client: ReturnType<typeof createClient>;
    if (calledByService) {
      client = createClient(supabaseUrl, serviceKey);
    } else {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData.user) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    }

    const { company_id } = await req.json().catch(() => ({}));
    if (!company_id) return new Response(JSON.stringify({ error: "company_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: processes }, { data: tasks }, { data: logs }, { data: anthropicKey }, { data: existing }] = await Promise.all([
      client.from("processes").select("id, name, area, steps").eq("company_id", company_id).eq("status", "published"),
      client.from("tasks").select("id, title, status, result, completed_at, updated_at").eq("company_id", company_id).eq("status", "done").gte("updated_at", since),
      client.from("execution_logs").select("task_id, content").eq("company_id", company_id).gte("created_at", since),
      client.rpc("read_credential" as any, { p_company_id: company_id, p_service: "anthropic" }),
      client.from("process_suggestions").select("process_id, suggested_step").eq("company_id", company_id),
    ]);

    if (!anthropicKey) return new Response(JSON.stringify({ error: "Credencial Anthropic ausente" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const procs = (processes ?? []) as any[];
    const doneTasks = (tasks ?? []) as any[];
    const execLogs = (logs ?? []) as any[];
    const existingByProcess = new Map<string, string[]>();
    for (const s of (existing ?? []) as any[]) {
      const list = existingByProcess.get(s.process_id) ?? [];
      list.push(norm(String(s.suggested_step?.description ?? "")));
      existingByProcess.set(s.process_id, list);
    }

    let created = 0;
    let analyzed = 0;

    for (const p of procs) {
      if (analyzed >= MAX_PROCESSES_PER_RUN) break;
      const procTokens = new Set([...tokens(p.name), ...tokens(p.area ?? "")]);
      if (procTokens.size === 0) continue;
      const matching = doneTasks.filter((t) => tokens(t.title).some((tk) => procTokens.has(tk)));
      if (matching.length < MIN_EXECUTIONS) continue;
      analyzed++;

      const observed = matching.slice(0, 12).map((t) => {
        const tl = execLogs.filter((l) => l.task_id === t.id).map((l) => l.content);
        return `- ${t.title}${t.result ? `: ${t.result}` : ""}${tl.length ? ` [passos: ${tl.join("; ").slice(0, 300)}]` : ""}`;
      }).join("\n");

      const documented = Array.isArray(p.steps) && p.steps.length
        ? p.steps.map((s: any, i: number) => `${i + 1}. ${s.description}`).join("\n")
        : "(processo sem passos documentados)";

      const userPrompt =
        `Processo documentado "${p.name}"${p.area ? ` (${p.area})` : ""}:\n${documented}\n\n` +
        `Execuções observadas (${matching.length}) nas últimas 4 semanas:\n${observed}\n\n` +
        `Há um passo recorrente ausente do processo documentado? Responda em JSON estrito.`;

      let parsed: any;
      try { parsed = await callClaude(anthropicKey, userPrompt); } catch { continue; }
      if (!parsed?.has_suggestion || !parsed?.step?.description) continue;

      const desc = String(parsed.step.description).trim();
      const descNorm = norm(desc);
      const seen = existingByProcess.get(p.id) ?? [];
      const dup = seen.some((e) => e === descNorm || e.includes(descNorm) || descNorm.includes(e));
      if (dup) continue;

      const dates = matching.map((t) => t.completed_at ?? t.updated_at).filter(Boolean).slice(0, 10);
      const { error: insErr } = await client.from("process_suggestions").insert({
        process_id: p.id,
        company_id,
        suggested_step: { description: desc, responsible: String(parsed.step.responsible ?? ""), sla: String(parsed.step.sla ?? "") },
        evidence: { count: matching.length, dates },
        status: "pending",
      });
      if (!insErr) { created++; seen.push(descNorm); existingByProcess.set(p.id, seen); }
    }

    return new Response(JSON.stringify({ success: true, analyzed, created }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
