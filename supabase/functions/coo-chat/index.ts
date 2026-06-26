// v2 - detecção de intenção + coo-orchestrator
// coo-chat: chat direto do gestor com o Atlas no painel.
// Lê a chave Anthropic do cliente no Vault + o contexto (soul/agents/user md) e
// responde conversacionalmente. Não persiste (conversa de painel, não canal externo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createNotionTask } from "../_shared/notion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-6";

type ChatTurn = { role: "user" | "assistant"; content: string };

// ---- D2: detecção de intenção de ação na mensagem do usuário ----
type Intent = { type: "task" | "routine" | "brain_sync" | "create_task"; query?: string };

function cleanQuery(s: string): string {
  return s.replace(/^(a|o|as|os|tarefa|rotina|de|do|da)\s+/i, "").replace(/["'?!.]+$/, "").trim();
}

function parseIntent(message: string): Intent | null {
  const lower = message.toLowerCase();
  let m = lower.match(/(?:cria\w*|nova|adicion\w*|registr\w*|anot\w*)\s+(?:uma?\s+)?(?:tarefa|task|to-?do)\s+(.+)/);
  if (m && m[1]) return { type: "create_task", query: cleanQuery(m[1]) };
  if (/(sincroniz|\bsync\b|atualiza\w*\s+(o\s+)?(brain|c[ée]rebro))/.test(lower)) return { type: "brain_sync" };
  m = lower.match(/(?:execut\w*|roda\w*|processa\w*)\s+(.+)/);
  if (m && m[1]) return { type: "task", query: cleanQuery(m[1]) };
  m = lower.match(/(?:inicia\w*|come[çc]a\w*|dispara\w*)\s+(.+)/);
  if (m && m[1]) return { type: "routine", query: cleanQuery(m[1]) };
  return null;
}

async function callOrchestrator(
  url: string, serviceKey: string, body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; dispatched?: string }> {
  try {
    const res = await fetch(`${url}/functions/v1/coo-orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({} as any));
    return { ok: res.ok && j.ok !== false, error: j.error, dispatched: j.dispatched };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// Detecta intenção, despacha via coo-orchestrator e devolve a resposta+ação (ou null para fluxo normal).
async function dispatchIntent(
  admin: any, url: string, serviceKey: string, companyId: string, intent: Intent,
): Promise<{ reply: string; action: Record<string, unknown> | null } | null> {
  if (intent.type === "create_task") {
    const title = (intent.query ?? "").trim();
    if (!title) return null;
    const synthId = `chat-${crypto.randomUUID()}`;
    const { data: t } = await admin.from("tasks").insert({
      company_id: companyId, notion_task_id: synthId, title,
      status: "todo", priority: "medium", assigned_to: "coo", source: "chat", is_adhoc: true,
    }).select("id").maybeSingle();
    let extra = "";
    const page = await createNotionTask(companyId, { title });
    if (page && t?.id) {
      await admin.from("tasks").update({ notion_task_id: page.notion_page_id }).eq("id", t.id);
      extra = " e espelhei no Notion";
    }
    return { action: { type: "create_task", ok: !!t }, reply: `✅ Criei a tarefa **${title}**${extra}.` };
  }
  if (intent.type === "brain_sync") {
    const r = await callOrchestrator(url, serviceKey, { type: "brain_sync", company_id: companyId });
    return {
      action: { type: "brain_sync", ok: r.ok },
      reply: r.ok ? "⚡ Despachei a **sincronização do cérebro** para o Atlas na VPS." : `Não consegui despachar a sincronização: ${r.error ?? "erro"}.`,
    };
  }
  if (intent.type === "task") {
    const { data: tasks } = await admin.from("tasks").select("id, title")
      .eq("company_id", companyId).ilike("title", `%${intent.query}%`).limit(5);
    if (!tasks || tasks.length === 0) return null;
    if (tasks.length > 1) {
      return { action: null, reply: `Encontrei mais de uma tarefa parecida com "${intent.query}". Qual delas?\n` + tasks.map((t: any) => `• ${t.title}`).join("\n") };
    }
    const t = tasks[0];
    const r = await callOrchestrator(url, serviceKey, { type: "task", task_id: t.id, company_id: companyId });
    return {
      action: { type: "task", task_id: t.id, ok: r.ok, dispatched: r.dispatched },
      reply: r.ok
        ? `⚡ Despachei **${t.title}** para o Atlas${r.dispatched === "vps" ? " (instância OpenClaw)" : " (execução no painel)"}.`
        : `Não consegui despachar "${t.title}": ${r.error ?? "erro"}.`,
    };
  }
  // routine
  const { data: routines } = await admin.from("routines").select("id, name")
    .eq("company_id", companyId).ilike("name", `%${intent.query}%`).limit(5);
  if (!routines || routines.length === 0) return null;
  if (routines.length > 1) {
    return { action: null, reply: `Mais de uma rotina parecida com "${intent.query}":\n` + routines.map((r: any) => `• ${r.name}`).join("\n") };
  }
  const rt = routines[0];
  const r = await callOrchestrator(url, serviceKey, { type: "routine", routine_id: rt.id, company_id: companyId });
  return {
    action: { type: "routine", routine_id: rt.id, ok: r.ok },
    reply: r.ok ? `⚡ Despachei a rotina **${rt.name}** para o Atlas.` : `Não consegui despachar a rotina "${rt.name}": ${r.error ?? "ela está aprovada/ativa?"}.`,
  };
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

    const { company_id, message, history } = await req.json();
    if (!company_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: "company_id e message obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await userClient
      .from("agent_config")
      .select("soul_md, agents_md, user_md")
      .eq("company_id", company_id)
      .maybeSingle();

    const { data: anthropicKey } = await userClient.rpc("read_credential" as any, {
      p_company_id: company_id, p_service: "anthropic",
    });
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Credencial Anthropic ausente. Configure em Credenciais." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = [
      "Você é o Atlas, agente autônomo de operações, conversando diretamente com o gestor no painel.",
      "Responda de forma direta, objetiva e útil. Quando o pedido for uma ação operacional",
      "(executar tarefa, postar no Discord, extrair relatório), explique o que faria e o status atual —",
      "você não executa ações externas a partir deste chat, apenas orienta e responde.",
      "## SOUL.md", config?.soul_md ?? "(não definido)",
      "## AGENTS.md", config?.agents_md ?? "(não definido)",
      "## USER.md", config?.user_md ?? "(não definido)",
    ].join("\n\n");

    const priorTurns: ChatTurn[] = Array.isArray(history)
      ? history.slice(-10).map((h: any) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content ?? ""),
        }))
      : [];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [...priorTurns, { role: "user", content: message }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Claude ${res.status}: ${body.slice(0, 300)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const replyText = (data.content?.[0]?.text ?? "").trim() || "(sem resposta)";

    // D2: se a mensagem do usuário tem intenção de ação, despacha para o Atlas (coo-orchestrator).
    let finalReply = replyText;
    let action: Record<string, unknown> | null = null;
    const intent = parseIntent(message);
    if (intent) {
      const dispatch = await dispatchIntent(admin, supabaseUrl, serviceKey, company_id, intent);
      if (dispatch) { finalReply = dispatch.reply; action = dispatch.action; }
    }

    return new Response(JSON.stringify({ success: true, reply: finalReply, action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
