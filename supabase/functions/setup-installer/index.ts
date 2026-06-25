// Atlas COO - setup installer
// v2 - URL corrigida para viverdeia-agenteautonomocoo
/**
 * GET /setup-installer?token=xxx
 * Público (verify_jwt=false). Valida o installer_token (gerado em
 * onboarding-issue-token) e retorna um wrapper bash que:
 *   1. escreve ~/.atlas-coo/.install_env.sh com os env vars do instalador
 *      (PANEL_BASE_URL, PANEL_TOKEN, INSTALLER_TOKEN, ANTHROPIC_API_KEY,
 *       COO_TOOLS_URL, COO_TOOLS_SECRET);
 *   2. faz source desse arquivo;
 *   3. baixa e executa o install/setup-atlas.sh do repo.
 */
import { adminClient } from "../_shared/panel.ts";
import { getSecret } from "../_shared/secrets.ts";

const SETUP_ATLAS_URL = Deno.env.get("SETUP_ATLAS_URL") ??
  "https://raw.githubusercontent.com/MindOpsTeam/viverdeia-agenteautonomocoo/main/install/setup-atlas.sh";

function shEscape(v: string): string {
  return `'${String(v).replace(/'/g, "'\\''")}' `;
}

function errScript(comment: string, status: number): Response {
  return new Response(`#!/usr/bin/env bash\n# ${comment}\nexit 1\n`, {
    status,
    headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return errScript("erro: token ausente", 400);

  const admin = adminClient();
  const { data: row } = await admin
    .from("installer_tokens")
    .select("token, owner_user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!row) return errScript("erro: token invalido", 404);
  if (row.used_at) return errScript("erro: token ja utilizado", 410);
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return errScript("erro: token expirado", 410);
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const panelBaseUrl = `${baseUrl}/functions/v1`;
  const cooToolsUrl = `${panelBaseUrl}/coo-tools`;

  const panelToken = (await getSecret("PANEL_TOKEN")) ?? "";
  const cooToolsSecret = (await getSecret("COO_TOOLS_SECRET")) ?? "";
  const anthropicKey = (await getSecret("ANTHROPIC_API_KEY")) ?? "";
  const brainToken = (await getSecret("GITHUB_BRAIN_TOKEN")) ?? "";
  const cfTunnelToken = (await getSecret("CF_TUNNEL_TOKEN")) ?? "";
  const cfTunnelHostname = (await getSecret("CF_TUNNEL_HOSTNAME")) ?? "";

  let brainRepoUrl = "";
  {
    const byOwner = await admin.from("atlas_settings").select("brain_repo_url").eq("user_id", row.owner_user_id).maybeSingle();
    brainRepoUrl = (byOwner.data?.brain_repo_url ?? "").trim();
    if (!brainRepoUrl) {
      const global = await admin.from("atlas_settings").select("brain_repo_url").is("user_id", null).maybeSingle();
      brainRepoUrl = (global.data?.brain_repo_url ?? "").trim();
    }
    if (!brainRepoUrl) {
      const anyRow = await admin.from("atlas_settings").select("brain_repo_url").limit(1).maybeSingle();
      brainRepoUrl = (anyRow.data?.brain_repo_url ?? "").trim();
    }
  }

  const envLines = [
    `export PANEL_BASE_URL=${shEscape(panelBaseUrl)}`,
    `export PANEL_TOKEN=${shEscape(panelToken)}`,
    `export INSTALLER_TOKEN=${shEscape(token)}`,
    `export ANTHROPIC_API_KEY=${shEscape(anthropicKey)}`,
    `export COO_TOOLS_URL=${shEscape(cooToolsUrl)}`,
    `export COO_TOOLS_SECRET=${shEscape(cooToolsSecret)}`,
    `export GITHUB_BRAIN_TOKEN=${shEscape(brainToken)}`,
  ];

  if (brainRepoUrl) {
    envLines.push(`export SKILL_REPO=${shEscape(brainRepoUrl)}`);
  }

  if (cfTunnelToken && cfTunnelHostname) {
    envLines.push(`export CF_TUNNEL_TOKEN=${shEscape(cfTunnelToken)}`);
    envLines.push(`export CF_TUNNEL_HOSTNAME=${shEscape(cfTunnelHostname)}`);
  }

  const script = `#!/usr/bin/env bash
# Atlas COO — installer (gerado pelo painel)
set -euo pipefail

echo "==> Configurando variaveis de ambiente do agente Atlas..."
mkdir -p "$HOME/.atlas-coo"
cat > "$HOME/.atlas-coo/.install_env.sh" <<'ATLAS_ENV_EOF'
${envLines.join("\n")}
ATLAS_ENV_EOF
chmod 600 "$HOME/.atlas-coo/.install_env.sh"
source "$HOME/.atlas-coo/.install_env.sh"

echo "==> Baixando e executando setup-atlas.sh..."
curl -fsSL ${SETUP_ATLAS_URL} | bash
`;

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
