// setup-discord-channels (Sprint 19)
// Stateless helper para o onboarding. O bot token vem no body — nada é persistido.
//   action: "list"   → lista os canais de texto do servidor (guild)
//   action: "create" → cria #operações #relatórios #alertas no servidor
// Requer o bot já no servidor com permissão Manage Channels.
// O cliente persiste o channel_id principal em agent_config.discord_channel_id.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_CHANNELS = ["operações", "relatórios", "alertas"];
const GUILD_TEXT = 0; // Discord channel type 0 = GUILD_TEXT

function botHeaders(token: string) {
  return { "Authorization": `Bot ${token}`, "Content-Type": "application/json" };
}

async function listChannels(token: string, guildId: string) {
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: botHeaders(token),
  });
  if (res.status === 401) return { status: 401, body: { ok: false, error: "Bot token do Discord inválido" } };
  if (res.status === 403) return { status: 403, body: { ok: false, error: "Bot sem acesso ao servidor — convide-o no servidor" } };
  if (res.status === 404) return { status: 404, body: { ok: false, error: "Servidor (guild) não encontrado" } };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { status: 502, body: { ok: false, error: `Discord respondeu ${res.status}: ${text.slice(0, 200)}` } };
  }
  const data = await res.json();
  const channels = (Array.isArray(data) ? data : [])
    .filter((c: any) => c?.type === GUILD_TEXT)
    .map((c: any) => ({ id: c.id, name: c.name }));
  return { status: 200, body: { ok: true, channels } };
}

async function createChannels(token: string, guildId: string, names: string[]) {
  const created: Array<{ name: string; id: string | null; error?: string }> = [];
  // Sequencial para respeitar rate limit do Discord e dar erro claro por canal.
  for (const name of names) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: "POST",
      headers: botHeaders(token),
      body: JSON.stringify({ name, type: GUILD_TEXT }),
    });
    if (res.status === 401) return { status: 401, body: { ok: false, error: "Bot token do Discord inválido" } };
    if (res.status === 403) {
      return { status: 403, body: { ok: false, error: "Bot sem permissão 'Manage Channels' no servidor" } };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      created.push({ name, id: null, error: `Discord ${res.status}: ${text.slice(0, 150)}` });
      continue;
    }
    const data = await res.json();
    created.push({ name: data.name ?? name, id: data.id });
  }
  const anyOk = created.some((c) => c.id);
  return { status: anyOk ? 200 : 502, body: { ok: anyOk, channels: created } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as "list" | "create" | undefined;
    const token = (body?.bot_token ?? "") as string;
    const guildId = (body?.guild_id ?? "") as string;

    if (!token) return json(400, { ok: false, error: "Bot token do Discord ausente" });
    if (!guildId) return json(400, { ok: false, error: "Server (guild) ID ausente" });

    let result: { status: number; body: unknown };
    if (action === "list") {
      result = await listChannels(token, guildId);
    } else if (action === "create") {
      const names = Array.isArray(body?.channels) && body.channels.length ? body.channels : DEFAULT_CHANNELS;
      result = await createChannels(token, guildId, names);
    } else {
      result = { status: 400, body: { ok: false, error: "action inválida (use 'list' ou 'create')" } };
    }

    // Sempre 200 em desfechos de negócio: o cliente lê body.ok/body.error.
    // (supabase-js só expõe o corpo em respostas 2xx; non-2xx vira erro opaco.)
    return json(200, result.body);
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Erro no setup-discord-channels" });
  }
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
