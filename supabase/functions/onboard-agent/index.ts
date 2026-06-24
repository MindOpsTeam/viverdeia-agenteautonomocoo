// onboard-agent — FINALIZE (Sprint 19)
// O onboarding agora materializa companies + agent_config e grava segredos no Vault
// etapa a etapa. Esta função apenas FINALIZA: confere que o mínimo existe, ativa o
// agente (is_active=true), manda o welcome no Discord e dispara o brain-sync.
// Idempotente: pode ser chamada novamente sem efeitos colaterais danosos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendDiscordWelcome(botToken: string, channelId: string, companyName: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content:
        `👋 Olá, **${companyName}**! Atlas ativado.\n` +
        `Comandos disponíveis: \`status\`, \`backlog\`, \`executa\`, \`pausa\`, \`retoma\`, \`report\`, \`processo\`.`,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Não autorizado" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData.user) return json(401, { error: "Token inválido" });
    const userId = userData.user.id;

    // Cliente com JWT do usuário → respeita RLS nas leituras/escritas.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // 1) Empresa precisa existir (criada na etapa 1 do onboarding).
    const { data: company } = await userClient
      .from("companies").select("id, name").eq("owner_id", userId).maybeSingle();
    if (!company?.id) {
      return json(400, { error: "Empresa não encontrada. Conclua a etapa 1 do onboarding antes de finalizar." });
    }
    const companyId = company.id;

    // 2) agent_config precisa existir; lê providers para saber quais credenciais são exigidas.
    const { data: cfg } = await userClient
      .from("agent_config")
      .select("backlog_provider, comm_provider, discord_channel_id")
      .eq("company_id", companyId).maybeSingle();
    if (!cfg) {
      return json(400, { error: "Configuração do agente não encontrada. Conclua o onboarding antes de finalizar." });
    }

    // 3) Confere credenciais mínimas no Vault (anthropic + provider de backlog + provider de comunicação).
    const { data: creds } = await userClient
      .from("credentials").select("service").eq("company_id", companyId);
    const present = new Set((creds ?? []).map((c: { service: string }) => c.service));

    const required = ["anthropic"];
    if ((cfg.backlog_provider ?? "notion") === "notion") required.push("notion");
    if ((cfg.comm_provider ?? "discord") === "discord") required.push("discord");

    const missing = required.filter((s) => !present.has(s));
    if (missing.length) {
      return json(400, {
        error: `Faltam credenciais validadas: ${missing.join(", ")}. Volte à etapa correspondente.`,
        missing,
      });
    }

    // 4) Ativa o agente.
    const { error: actErr } = await userClient
      .from("agent_config").update({ is_active: true }).eq("company_id", companyId);
    if (actErr) return json(500, { error: "Falha ao ativar o agente", details: actErr.message });

    // 5) Welcome no Discord (best-effort: lê o bot token do Vault).
    if ((cfg.comm_provider ?? "discord") === "discord" && cfg.discord_channel_id) {
      try {
        const { data: botToken } = await userClient.rpc("read_credential" as any, {
          p_company_id: companyId, p_service: "discord",
        });
        if (botToken) await sendDiscordWelcome(botToken as string, cfg.discord_channel_id, company.name);
      } catch (_) { /* não bloqueia a finalização */ }
    }

    // 6) Compila o Cérebro nas skills (best-effort).
    try {
      await userClient.functions.invoke("brain-sync", { body: { company_id: companyId } });
    } catch (_) { /* não bloqueia a finalização */ }

    return json(200, { success: true, company_id: companyId });
  } catch (e: any) {
    return json(500, { error: e?.message ?? "Erro ao finalizar onboarding" });
  }
});
