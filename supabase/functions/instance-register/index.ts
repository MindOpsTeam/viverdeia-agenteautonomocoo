/**
 * POST /instance-register
 * Público (verify_jwt=false). Chamado pelo setup-atlas.sh na VPS após instalar o OpenClaw,
 * para registrar a instância no painel. Autenticado pelo installer_token (uso único).
 * Body: { installer_token, hostname, openclaw_version, ingress_url,
 *         hooks_token, openclaw_dashboard_token, agent_type }
 * Fluxo: valida o token → cria/atualiza a instância → marca o token como usado → { instance_id }.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/panel.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("JSON inválido", 400); }

  const {
    installer_token, hostname, openclaw_version, ingress_url,
    hooks_token, openclaw_dashboard_token, agent_type,
  } = (body ?? {}) as Record<string, string>;

  if (!installer_token) return errorResponse("installer_token obrigatório", 400);

  const admin = adminClient();

  // 1. Valida o installer_token
  const { data: tok } = await admin
    .from("installer_tokens")
    .select("token, owner_user_id, expires_at, used_at")
    .eq("token", installer_token)
    .maybeSingle();

  if (!tok) return errorResponse("installer_token inválido", 404);
  if (tok.used_at) return errorResponse("installer_token já utilizado", 410);
  if (tok.expires_at && new Date(tok.expires_at) < new Date()) {
    return errorResponse("installer_token expirado", 410);
  }

  // 3. Cria/atualiza o registro da instância (uma por owner)
  const { data: inst, error: upErr } = await admin
    .from("atlas_instances")
    .upsert({
      owner_user_id: tok.owner_user_id,
      hostname: hostname ?? null,
      openclaw_version: openclaw_version ?? null,
      ingress_url: ingress_url ?? null,
      hooks_token: hooks_token ?? null,
      openclaw_dashboard_token: openclaw_dashboard_token ?? null,
      agent_type: agent_type ?? "atlas_coo",
      registered_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id" })
    .select("id")
    .maybeSingle();

  if (upErr || !inst) {
    console.error("[instance-register] upsert error:", upErr);
    return errorResponse(upErr?.message ?? "Falha ao registrar a instância", 500);
  }

  // 2. Marca o token como usado (após registrar com sucesso — não queima o token se falhar antes)
  await admin.from("installer_tokens").update({ used_at: new Date().toISOString() }).eq("token", installer_token);

  // 4. Retorna o id da instância
  return jsonResponse({ instance_id: inst.id });
});
