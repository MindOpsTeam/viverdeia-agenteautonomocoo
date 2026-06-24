// Stateless credential validator. Calls each provider's API and reports ok/error.
// Used during the onboarding wizard to validate per-step before final commit.
// Never persists anything.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ValidationResult = { ok: boolean; error?: string };

async function validateAnthropic(apiKey: string): Promise<ValidationResult> {
  if (!apiKey || apiKey.length < 10) return { ok: false, error: "Chave vazia ou muito curta" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Chave da Anthropic inválida ou sem permissão" };
    if (!res.ok && res.status !== 200) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Anthropic respondeu ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Falha ao conectar na Anthropic: ${e?.message ?? e}` };
  }
}

async function validateNotion(token: string, databaseId: string): Promise<ValidationResult> {
  if (!token) return { ok: false, error: "Token do Notion vazio" };
  if (!databaseId) return { ok: false, error: "Database ID do Notion vazio" };
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
    });
    if (res.status === 401) return { ok: false, error: "Token do Notion inválido" };
    if (res.status === 404) return { ok: false, error: "Database não encontrado ou integração sem acesso a ele" };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Notion respondeu ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Falha ao conectar no Notion: ${e?.message ?? e}` };
  }
}

async function validateDiscord(
  botToken: string,
  channelId: string,
): Promise<ValidationResult> {
  if (!botToken) return { ok: false, error: "Bot token do Discord vazio" };
  if (!channelId) return { ok: false, error: "Channel ID do Discord vazio" };
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      method: "GET",
      headers: { "Authorization": `Bot ${botToken}` },
    });
    if (res.status === 401) return { ok: false, error: "Bot token do Discord inválido" };
    if (res.status === 403) return { ok: false, error: "Bot sem acesso ao canal — convide-o no servidor" };
    if (res.status === 404) return { ok: false, error: "Canal não encontrado" };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Discord respondeu ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Falha ao conectar no Discord: ${e?.message ?? e}` };
  }
}

async function validateOpenclaw(
  workspaceUrl: string,
  token: string,
): Promise<ValidationResult> {
  if (!workspaceUrl) return { ok: false, error: "URL do workspace OpenClaw vazia" };
  if (!token) return { ok: false, error: "Token do OpenClaw vazio" };
  let url: URL;
  try {
    url = new URL(workspaceUrl);
  } catch {
    return { ok: false, error: "URL do workspace inválida" };
  }
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (res.status === 401) return { ok: false, error: "Token do OpenClaw inválido" };
    if (res.status === 403) return { ok: false, error: "Token sem permissão para o workspace" };
    if (res.status >= 500) return { ok: false, error: `OpenClaw indisponível (${res.status})` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Falha ao conectar no OpenClaw: ${e?.message ?? e}` };
  }
}

function parseRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.\s]+)(?:\.git)?/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function validateGithub(pat: string, repoUrl: string): Promise<ValidationResult> {
  if (!pat) return { ok: false, error: "PAT do GitHub vazio" };
  try {
    const headers = { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github+json", "User-Agent": "atlas" };
    const me = await fetch("https://api.github.com/user", { headers });
    if (me.status === 401) return { ok: false, error: "PAT do GitHub inválido" };
    if (!me.ok) return { ok: false, error: `GitHub respondeu ${me.status}` };
    if (repoUrl) {
      const r = parseRepo(repoUrl);
      if (!r) return { ok: false, error: "URL do repositório inválida" };
      const repo = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}`, { headers });
      if (repo.status === 404) return { ok: false, error: "Repositório não encontrado ou PAT sem acesso a ele" };
      if (!repo.ok) return { ok: false, error: `GitHub respondeu ${repo.status} ao acessar o repo` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Falha ao conectar no GitHub: ${e?.message ?? e}` };
  }
}

async function validateVps(url: string, token: string): Promise<ValidationResult> {
  if (!url) return { ok: false, error: "URL da VPS vazia" };
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, error: "URL da VPS inválida" }; }
  try {
    const res = await fetch(u.toString(), { method: "GET", headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (res.status === 401) return { ok: false, error: "Token da VPS inválido" };
    if (res.status >= 500) return { ok: false, error: `VPS indisponível (${res.status})` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Falha ao conectar na VPS: ${e?.message ?? e}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const checks = (body?.checks ?? []) as Array<{
      service: "anthropic" | "notion" | "discord" | "openclaw" | "github" | "vps";
      anthropic_key?: string;
      notion_token?: string;
      notion_database_id?: string;
      discord_bot_token?: string;
      discord_channel_id?: string;
      openclaw_workspace_url?: string;
      openclaw_token?: string;
      github_pat?: string;
      github_repo_url?: string;
      vps_url?: string;
      vps_token?: string;
    }>;

    const results: Record<string, ValidationResult> = {};

    await Promise.all(checks.map(async (c) => {
      switch (c.service) {
        case "anthropic":
          results.anthropic = await validateAnthropic(c.anthropic_key ?? "");
          break;
        case "notion":
          results.notion = await validateNotion(c.notion_token ?? "", c.notion_database_id ?? "");
          break;
        case "discord":
          results.discord = await validateDiscord(c.discord_bot_token ?? "", c.discord_channel_id ?? "");
          break;
        case "openclaw":
          results.openclaw = await validateOpenclaw(c.openclaw_workspace_url ?? "", c.openclaw_token ?? "");
          break;
        case "github":
          results.github = await validateGithub(c.github_pat ?? "", c.github_repo_url ?? "");
          break;
        case "vps":
          results.vps = await validateVps(c.vps_url ?? "", c.vps_token ?? "");
          break;
        default:
          results[c.service] = { ok: false, error: `Serviço desconhecido: ${c.service}` };
      }
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao validar" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
