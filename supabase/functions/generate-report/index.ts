// Aggregates tasks for the period (daily/checkpoint/weekly), asks Claude to format the
// report, persists in reports table, and sends to Discord.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReportType = "daily" | "checkpoint" | "weekly";

function rangeForType(type: ReportType): { since: Date; label: string } {
  const now = new Date();
  if (type === "weekly") {
    const since = new Date(now); since.setDate(now.getDate() - 7);
    return { since, label: "últimos 7 dias" };
  }
  if (type === "checkpoint") {
    const since = new Date(now); since.setHours(0, 0, 0, 0);
    return { since, label: "hoje (checkpoint)" };
  }
  const since = new Date(now); since.setHours(0, 0, 0, 0);
  return { since, label: "hoje" };
}

async function callClaude(
  apiKey: string,
  system: string,
  prompt: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function sendDiscord(botToken: string, channelId: string, content: string) {
  // Discord message limit is 2000 chars; split if needed.
  const chunks: string[] = [];
  let rest = content;
  while (rest.length > 1900) {
    chunks.push(rest.slice(0, 1900));
    rest = rest.slice(1900);
  }
  chunks.push(rest);
  for (const c of chunks) {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: c }),
    });
  }
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
    const calledByCron = token === serviceKey;

    let userClient: ReturnType<typeof createClient>;
    if (calledByCron) {
      // Cron path: trust the service role key, bypass RLS.
      userClient = createClient(supabaseUrl, serviceKey);
    } else {
      // User path: verify token, scope writes via RLS using user JWT.
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

    const body = await req.json().catch(() => ({}));
    const type: ReportType = body?.type ?? "daily";
    let companyId: string | undefined = body?.company_id;
    if (!companyId) {
      if (calledByCron) {
        return new Response(JSON.stringify({ error: "company_id obrigatório quando chamado pelo cron" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: company } = await userClient
        .from("companies").select("id").maybeSingle();
      companyId = (company as any)?.id;
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { since, label } = rangeForType(type);
    const { data: tasks } = await userClient
      .from("tasks")
      .select("title, status, priority, result, updated_at")
      .eq("company_id", companyId)
      .gte("updated_at", since.toISOString())
      .order("updated_at", { ascending: false });

    const all = tasks ?? [];
    const done = all.filter((t: any) => t.status === "done");
    const doing = all.filter((t: any) => t.status === "doing");
    const blocked = all.filter((t: any) => t.status === "blocked");

    const [{ data: anthropicKey }, { data: discordToken }, { data: config }] = await Promise.all([
      userClient.rpc("read_credential" as any, { p_company_id: companyId, p_service: "anthropic" }),
      userClient.rpc("read_credential" as any, { p_company_id: companyId, p_service: "discord" }),
      userClient.from("agent_config")
        .select("soul_md, user_md, discord_channel_id")
        .eq("company_id", companyId).maybeSingle(),
    ]);

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Credencial Anthropic ausente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = [
      "Você é o Atlas, agente autônomo de operações, escrevendo um relatório em português do Brasil.",
      "Seja direto, objetivo e use bullets curtos. Inclua: resumo executivo, o que foi feito, o que está em curso, bloqueios e próximos passos.",
      "## SOUL.md", (config as any)?.soul_md ?? "(não definido)",
      "## USER.md", (config as any)?.user_md ?? "(não definido)",
    ].join("\n\n");

    const summary = [
      `Relatório: ${label}`,
      `Concluídas: ${done.length}`,
      `Em curso: ${doing.length}`,
      `Bloqueadas: ${blocked.length}`,
      "",
      "Tarefas concluídas:",
      ...done.map((t: any) => `- ${t.title}${t.result ? ` — ${String(t.result).slice(0, 200)}` : ""}`),
      "",
      "Em curso:",
      ...doing.map((t: any) => `- ${t.title}`),
      "",
      "Bloqueadas:",
      ...blocked.map((t: any) => `- ${t.title}${t.result ? ` — ${String(t.result).slice(0, 200)}` : ""}`),
    ].join("\n");

    let content: string;
    try {
      content = await callClaude(anthropicKey, system, summary);
    } catch (e: any) {
      content = `Falha ao gerar via Claude. Resumo bruto:\n\n${summary}\n\nErro: ${e?.message ?? e}`;
    }

    const { data: report } = await userClient.from("reports").insert({
      company_id: companyId,
      type,
      content,
      tasks_done: done.length,
      tasks_doing: doing.length,
      tasks_blocked: blocked.length,
      sent_to_discord: false,
    }).select("id").single();

    let sent = false;
    if (discordToken && (config as any)?.discord_channel_id) {
      try {
        await sendDiscord(
          discordToken,
          (config as any).discord_channel_id,
          `📊 **Relatório ${type === "weekly" ? "semanal" : type === "checkpoint" ? "checkpoint" : "diário"}**\n\n${content}`,
        );
        sent = true;
        await userClient.from("reports").update({ sent_to_discord: true }).eq("id", report?.id);
      } catch (_) { /* ignore */ }
    }

    await userClient.from("execution_logs").insert({
      company_id: companyId,
      type: "report",
      content: `Relatório ${type} gerado (${done.length} concluídas / ${doing.length} em curso / ${blocked.length} bloqueadas)${sent ? " e enviado ao Discord" : ""}.`,
    });

    return new Response(JSON.stringify({
      success: true,
      report_id: report?.id,
      sent_to_discord: sent,
      summary: { done: done.length, doing: doing.length, blocked: blocked.length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
