// heartbeat — recebe o pulso da instância OpenClaw (cron */5 na VPS) e devolve a
// chave Anthropic atual do Vault (self-heal). Chamado por skills/atlas/scripts/heartbeat.sh:
// POST {PANEL_BASE_URL}/heartbeat (auth X-Panel-Token).
// Body: { instance_id, ingress_url?, system_prompt?, openclaw_version? }
// Atualiza atlas_instances (last_seen + ingress_url do quick-tunnel, etc.) e retorna
// { anthropic_api_key } para a VPS aplicar a chave mais recente.
import { adminClient, corsHeaders, errorResponse, jsonResponse, validatePanelToken } from "../_shared/panel.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  if (!(await validatePanelToken(req))) return errorResponse("X-Panel-Token inválido", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("JSON inválido", 400); }

  const instanceId = body.instance_id as string | undefined;
  if (!instanceId) return errorResponse("instance_id obrigatório", 400);

  const admin = adminClient();

  const { data: inst } = await admin
    .from("atlas_instances")
    .select("id, owner_user_id")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst) return errorResponse("instância não encontrada", 404);

  // Atualiza saúde + campos voláteis (a URL do quick-tunnel muda a cada restart).
  const patch: Record<string, unknown> = { last_seen: new Date().toISOString() };
  if (typeof body.ingress_url === "string" && body.ingress_url) patch.ingress_url = body.ingress_url;
  if (typeof body.openclaw_version === "string" && body.openclaw_version) patch.openclaw_version = body.openclaw_version;
  if (typeof body.system_prompt === "string" && body.system_prompt) patch.system_prompt = body.system_prompt;
  await admin.from("atlas_instances").update(patch).eq("id", instanceId);

  // Chave Anthropic atual (por empresa) para o self-heal na VPS.
  let anthropicKey = "";
  const { data: company } = await admin
    .from("companies").select("id").eq("owner_id", inst.owner_user_id).maybeSingle();
  if (company) {
    const { data: key } = await admin.rpc("read_credential_service", { p_company_id: company.id, p_service: "anthropic" });
    anthropicKey = (key as string) ?? "";
  }

  return jsonResponse({ ok: true, anthropic_api_key: anthropicKey });
});
