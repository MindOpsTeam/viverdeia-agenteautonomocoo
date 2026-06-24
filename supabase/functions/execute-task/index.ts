// Executes a single task: pulls context (soul.md, agents.md, user.md) and credentials
// from Vault, asks Claude to decide and execute, records the decision in execution_logs,
// updates the task status in Supabase and (best effort) in Notion + Discord.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Decision = "execute" | "escalate" | "block";

const SYSTEM_DECISION_INSTRUCTIONS = `
Você é o Atlas, agente autônomo de operações. Para cada tarefa recebida, decida UMA destas três ações:
- "execute": a tarefa é clara, dentro do seu escopo, e você consegue produzir um resultado útil agora.
- "escalate": precisa de input humano (falta informação, decisão estratégica, autorização).
- "block": tarefa bloqueada por dependência externa, falta de credencial ou conflito com as diretrizes.

Responda SEMPRE em JSON estrito, sem markdown, com este formato:
{
  "decision": "execute" | "escalate" | "block",
  "result": "texto com o resultado da execução, OU a pergunta para o humano, OU a razão do bloqueio",
  "next_status": "doing" | "done" | "blocked"
}

Se decision=execute e a tarefa pode ser concluída agora, use next_status="done".
Se decision=execute mas é trabalho contínuo, use next_status="doing".
Se decision=escalate ou block, use next_status="blocked".
`.trim();

async function callClaude(
  anthropicKey: string,
  system: string,
  userPrompt: string,
): Promise<{ decision: Decision; result: string; next_status: "doing" | "done" | "blocked" }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
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
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`Claude não retornou JSON: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  if (!["execute", "escalate", "block"].includes(parsed.decision)) {
    throw new Error(`Decisão inválida: ${parsed.decision}`);
  }
  if (!["doing", "done", "blocked"].includes(parsed.next_status)) {
    parsed.next_status = parsed.decision === "execute" ? "done" : "blocked";
  }
  return parsed;
}

async function updateNotionStatus(
  notionToken: string,
  pageId: string,
  status: "doing" | "done" | "blocked",
): Promise<void> {
  const statusName = status === "done" ? "Done" : status === "doing" ? "Doing" : "Blocked";
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { Status: { status: { name: statusName } } },
    }),
  });
}

async function notifyDiscord(
  botToken: string,
  channelId: string,
  content: string,
): Promise<void> {
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
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
    const calledByService = token === serviceKey;

    let userClient: ReturnType<typeof createClient>;
    if (calledByService) {
      userClient = createClient(supabaseUrl, serviceKey);
    } else {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData.user) {
        return new Response(JSON.stringify({ error: "Token inválido" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
    }

    const { task_id } = await req.json();
    if (!task_id) {
      return new Response(JSON.stringify({ error: "task_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task, error: tErr } = await userClient
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .maybeSingle();
    if (tErr || !task) {
      return new Response(JSON.stringify({ error: "Tarefa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await userClient
      .from("agent_config")
      .select("soul_md, agents_md, user_md, is_active, discord_channel_id, notion_database_id")
      .eq("company_id", task.company_id)
      .maybeSingle();

    if (!config?.is_active) {
      return new Response(JSON.stringify({ error: "Agente está pausado" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: anthropicKey }, { data: notionToken }, { data: discordToken }] = await Promise.all([
      userClient.rpc("read_credential" as any, { p_company_id: task.company_id, p_service: "anthropic" }),
      userClient.rpc("read_credential" as any, { p_company_id: task.company_id, p_service: "notion" }),
      userClient.rpc("read_credential" as any, { p_company_id: task.company_id, p_service: "discord" }),
    ]);
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Credencial Anthropic ausente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await userClient
      .from("tasks")
      .update({ status: "doing", started_at: new Date().toISOString() })
      .eq("id", task.id);

    const system = [
      SYSTEM_DECISION_INSTRUCTIONS,
      "## SOUL.md", config.soul_md ?? "(não definido)",
      "## AGENTS.md", config.agents_md ?? "(não definido)",
      "## USER.md", config.user_md ?? "(não definido)",
    ].join("\n\n");

    const userPrompt =
      `Tarefa: ${task.title}\n` +
      `Descrição: ${task.description ?? "(sem descrição)"}\n` +
      `Prioridade: ${task.priority}\n\n` +
      `Decida e responda em JSON estrito conforme as instruções.`;

    let decision;
    try {
      decision = await callClaude(anthropicKey, system, userPrompt);
    } catch (e: any) {
      await userClient.from("tasks").update({
        status: "blocked",
        error_log: e?.message ?? String(e),
      }).eq("id", task.id);
      await userClient.from("execution_logs").insert({
        company_id: task.company_id,
        task_id: task.id,
        type: "error",
        content: `Falha ao consultar Claude: ${e?.message ?? e}`,
      });
      return new Response(JSON.stringify({ error: e?.message ?? "Erro Claude" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    await userClient.from("tasks").update({
      status: decision.next_status,
      result: decision.result,
      // Bloqueio nunca silencioso: registra o motivo visível no Backlog.
      block_reason: decision.next_status === "blocked" ? decision.result : null,
      completed_at: decision.next_status === "done" ? now : null,
    }).eq("id", task.id);

    await userClient.from("execution_logs").insert({
      company_id: task.company_id,
      task_id: task.id,
      type: decision.decision === "execute" ? "action" : "report",
      content: `[${decision.decision.toUpperCase()}] ${task.title}: ${decision.result.slice(0, 800)}`,
    });

    // Best-effort: sync Notion + notify Discord
    if (notionToken && task.notion_task_id) {
      try { await updateNotionStatus(notionToken, task.notion_task_id, decision.next_status); }
      catch (_) { /* ignore */ }
    }
    if (discordToken && config.discord_channel_id) {
      const emoji = decision.decision === "execute" ? "✅" : decision.decision === "escalate" ? "🙋" : "⛔";
      try {
        await notifyDiscord(
          discordToken,
          config.discord_channel_id,
          `${emoji} **${task.title}** — ${decision.decision}\n${decision.result.slice(0, 1500)}`,
        );
      } catch (_) { /* ignore */ }
    }

    return new Response(JSON.stringify({
      success: true,
      task_id: task.id,
      decision: decision.decision,
      next_status: decision.next_status,
      result: decision.result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
