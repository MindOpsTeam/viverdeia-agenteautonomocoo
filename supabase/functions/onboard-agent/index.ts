// Final onboarding step. Validates all 4 services, stores credentials in Vault,
// creates company + agent_config, activates the agent, and sends Discord welcome.
// Refuses partial state — if any validation fails, nothing is persisted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ValidationResult = { ok: boolean; error?: string };

async function validateAnthropic(apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Chave da Anthropic inválida" };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Anthropic respondeu ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Anthropic: ${e?.message ?? e}` };
  }
}

async function validateNotion(token: string, databaseId: string): Promise<ValidationResult> {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: { "Authorization": `Bearer ${token}`, "Notion-Version": "2022-06-28" },
    });
    if (res.status === 401) return { ok: false, error: "Token Notion inválido" };
    if (res.status === 404) return { ok: false, error: "Database Notion não encontrado/sem acesso" };
    if (!res.ok) return { ok: false, error: `Notion respondeu ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Notion: ${e?.message ?? e}` };
  }
}

async function validateDiscord(botToken: string, channelId: string): Promise<ValidationResult> {
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { "Authorization": `Bot ${botToken}` },
    });
    if (res.status === 401) return { ok: false, error: "Discord bot token inválido" };
    if (res.status === 403) return { ok: false, error: "Discord sem acesso ao canal" };
    if (res.status === 404) return { ok: false, error: "Canal Discord não encontrado" };
    if (!res.ok) return { ok: false, error: `Discord respondeu ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Discord: ${e?.message ?? e}` };
  }
}

async function validateOpenclaw(workspaceUrl: string, token: string): Promise<ValidationResult> {
  let url: URL;
  try { url = new URL(workspaceUrl); }
  catch { return { ok: false, error: "URL OpenClaw inválida" }; }
  try {
    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (res.status === 401) return { ok: false, error: "Token OpenClaw inválido" };
    if (res.status === 403) return { ok: false, error: "Token OpenClaw sem permissão" };
    if (res.status >= 500) return { ok: false, error: `OpenClaw indisponível (${res.status})` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `OpenClaw: ${e?.message ?? e}` };
  }
}

async function sendDiscordWelcome(
  botToken: string,
  channelId: string,
  companyName: string,
): Promise<void> {
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content:
        `👋 Olá, **${companyName}**! Atlas ativado.\n` +
        `Comandos disponíveis em breve: \`status\`, \`backlog\`, \`executa\`, \`pausa\`, \`retoma\`, \`report\`.`,
    }),
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const payload = await req.json();
    const company = payload?.company ?? {};
    const credentials = payload?.credentials ?? {};
    const config = payload?.config ?? {};

    if (!company.name || !company.timezone) {
      return new Response(JSON.stringify({ error: "Empresa: nome e timezone são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ------------- Validate all 4 services in parallel -------------
    const [vAnthropic, vNotion, vDiscord, vOpenclaw] = await Promise.all([
      validateAnthropic(credentials.anthropic_key ?? ""),
      validateNotion(credentials.notion_token ?? "", credentials.notion_database_id ?? ""),
      validateDiscord(credentials.discord_bot_token ?? "", credentials.discord_channel_id ?? ""),
      validateOpenclaw(credentials.openclaw_workspace_url ?? "", credentials.openclaw_token ?? ""),
    ]);

    const validations = {
      anthropic: vAnthropic,
      notion: vNotion,
      discord: vDiscord,
      openclaw: vOpenclaw,
    };

    const allOk = vAnthropic.ok && vNotion.ok && vDiscord.ok && vOpenclaw.ok;
    if (!allOk) {
      return new Response(
        JSON.stringify({ error: "Uma ou mais credenciais falharam na validação", validations }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------- Persist company (idempotent for same user) -------------
    // Use the user's JWT to enforce RLS during writes; admin is only for auth.getUser above.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    let companyId: string;
    {
      const { data: existing } = await userClient
        .from("companies")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();

      if (existing?.id) {
        companyId = existing.id;
        await userClient.from("companies").update({ name: company.name }).eq("id", companyId);
      } else {
        const { data: inserted, error: insErr } = await userClient
          .from("companies")
          .insert({ name: company.name, owner_id: userId })
          .select("id")
          .single();
        if (insErr || !inserted) {
          return new Response(
            JSON.stringify({ error: "Falha ao criar empresa", details: insErr?.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        companyId = inserted.id;
      }
    }

    // ------------- Store credentials in Vault -------------
    const storeOps: Array<Promise<{ error: any }>> = [
      userClient.rpc("store_credential" as any, {
        p_company_id: companyId,
        p_service: "anthropic",
        p_value: credentials.anthropic_key,
      }) as any,
      userClient.rpc("store_credential" as any, {
        p_company_id: companyId,
        p_service: "notion",
        p_value: credentials.notion_token,
      }) as any,
      userClient.rpc("store_credential" as any, {
        p_company_id: companyId,
        p_service: "discord",
        p_value: credentials.discord_bot_token,
      }) as any,
      userClient.rpc("store_credential" as any, {
        p_company_id: companyId,
        p_service: "openclaw",
        p_value: credentials.openclaw_token,
      }) as any,
    ];
    const storeResults = await Promise.all(storeOps);
    const storeErr = storeResults.find((r) => r.error);
    if (storeErr) {
      return new Response(
        JSON.stringify({ error: "Falha ao salvar credenciais no Vault", details: storeErr.error?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------- Upsert agent_config & activate -------------
    const { error: cfgErr } = await userClient
      .from("agent_config")
      .upsert({
        company_id: companyId,
        notion_database_id: credentials.notion_database_id,
        discord_channel_id: credentials.discord_channel_id,
        discord_server_id: credentials.discord_server_id ?? null,
        openclaw_workspace_url: credentials.openclaw_workspace_url,
        soul_md: config.soul_md ?? null,
        agents_md: config.agents_md ?? null,
        user_md: config.user_md ?? null,
        morning_briefing_time: config.morning_briefing_time ?? "08:00",
        checkpoint_time: config.checkpoint_time ?? "12:00",
        daily_report_time: config.daily_report_time ?? "18:00",
        timezone: company.timezone,
        is_active: true,
      }, { onConflict: "company_id" });

    if (cfgErr) {
      return new Response(
        JSON.stringify({ error: "Falha ao salvar agent_config", details: cfgErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------- Welcome message (best-effort) -------------
    try {
      await sendDiscordWelcome(
        credentials.discord_bot_token,
        credentials.discord_channel_id,
        company.name,
      );
    } catch (_) { /* não bloqueia ativação */ }

    return new Response(JSON.stringify({
      success: true,
      company_id: companyId,
      validations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro no onboarding" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
