// coo-tools — API que o agente Atlas (VPS) usa para ler/escrever no painel.
// POST /coo-tools, auth: Authorization: Bearer {COO_TOOLS_SECRET}.
// Escopo por empresa via instance_id (do .env da VPS) → atlas_instances → companies.
//
// Ações (campo "action"):
//   get_task      { task_id }                      → tarefa + execution_logs
//   update_task   { task_id, status?, evidence_url?, result?, block_reason? }
//   get_routine   { routine_id }                   → rotina + approved
//   post_message  { content, channel_id? }         → posta no Discord da empresa
//   list_tasks    { status?, priority?, assignee? }
//   get_context   {}                               → agent_config + company_context + directives ativas
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/panel.ts";
import { getSecret } from "../_shared/secrets.ts";

const TASK_STATUSES = ["todo", "doing", "done", "blocked"];

async function validateCooToolsSecret(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const secret = await getSecret("COO_TOOLS_SECRET");
  if (!secret || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

async function postDiscord(botToken: string, channelId: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    });
    return res.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  if (!(await validateCooToolsSecret(req))) return errorResponse("COO_TOOLS_SECRET inválido", 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return errorResponse("JSON inválido", 400); }

  const action = body.action as string | undefined;
  if (!action) return errorResponse("action obrigatório", 400);

  const admin = adminClient();

  // ---- Escopo por empresa ----
  let companyId: string | null = (body.company_id as string) ?? null;
  if (!companyId && body.instance_id) {
    const { data: inst } = await admin.from("atlas_instances")
      .select("owner_user_id").eq("id", body.instance_id).maybeSingle();
    if (!inst) return errorResponse("instância não encontrada", 404);
    const { data: company } = await admin.from("companies")
      .select("id").eq("owner_id", inst.owner_user_id).maybeSingle();
    companyId = company?.id ?? null;
  }
  if (!companyId) return errorResponse("instance_id ou company_id obrigatório", 400);

  try {
    switch (action) {
      case "get_task": {
        if (!body.task_id) return errorResponse("task_id obrigatório", 400);
        const { data: task } = await admin.from("tasks").select("*")
          .eq("id", body.task_id).eq("company_id", companyId).maybeSingle();
        if (!task) return errorResponse("task não encontrada", 404);
        const { data: logs } = await admin.from("execution_logs")
          .select("id, type, content, created_at").eq("task_id", body.task_id)
          .order("created_at", { ascending: true });
        return jsonResponse({ ok: true, task, execution_logs: logs ?? [] });
      }

      case "update_task": {
        if (!body.task_id) return errorResponse("task_id obrigatório", 400);
        const patch: Record<string, unknown> = {};
        if (body.status !== undefined) {
          if (!TASK_STATUSES.includes(body.status)) return errorResponse("status inválido", 400);
          patch.status = body.status;
          if (body.status === "doing") patch.started_at = new Date().toISOString();
          if (body.status === "done") patch.completed_at = new Date().toISOString();
        }
        if (body.evidence_url !== undefined) patch.evidence_url = body.evidence_url;
        if (body.result !== undefined) patch.result = body.result;
        if (body.block_reason !== undefined) patch.block_reason = body.block_reason;
        if (Object.keys(patch).length === 0) return errorResponse("nada para atualizar", 400);

        const { data: task, error } = await admin.from("tasks").update(patch)
          .eq("id", body.task_id).eq("company_id", companyId).select("*").maybeSingle();
        if (error) return errorResponse(error.message, 500);
        if (!task) return errorResponse("task não encontrada", 404);

        await admin.from("execution_logs").insert({
          company_id: companyId, task_id: body.task_id,
          type: body.status === "blocked" ? "error" : "action",
          content: body.block_reason ?? body.result ?? `Tarefa atualizada${body.status ? ` → ${body.status}` : ""}.`,
        });
        return jsonResponse({ ok: true, task });
      }

      case "get_routine": {
        if (!body.routine_id) return errorResponse("routine_id obrigatório", 400);
        const { data: routine } = await admin.from("routines").select("*")
          .eq("id", body.routine_id).eq("company_id", companyId).maybeSingle();
        if (!routine) return errorResponse("rotina não encontrada", 404);
        return jsonResponse({ ok: true, routine, approved: routine.status === "active" });
      }

      case "post_message": {
        const content = (body.content as string | undefined)?.trim();
        if (!content) return errorResponse("content obrigatório", 400);
        const { data: cfg } = await admin.from("agent_config")
          .select("discord_channel_id").eq("company_id", companyId).maybeSingle();
        const channelId = (body.channel_id as string) ?? cfg?.discord_channel_id;
        if (!channelId) return errorResponse("Nenhum canal Discord configurado", 409);
        const { data: botToken } = await admin.rpc("read_credential_service", { p_company_id: companyId, p_service: "discord" });
        if (!botToken) return errorResponse("Discord não conectado (sem bot token)", 409);
        const sent = await postDiscord(botToken as string, channelId, content);
        if (!sent) return errorResponse("Falha ao postar no Discord", 502);
        await admin.from("execution_logs").insert({ company_id: companyId, type: "action", content: `Mensagem postada no Discord: ${content.slice(0, 120)}` });
        return jsonResponse({ ok: true });
      }

      case "list_tasks": {
        let q = admin.from("tasks")
          .select("id, title, status, priority, assigned_to, source, is_adhoc, created_at")
          .eq("company_id", companyId);
        if (body.status) q = q.eq("status", body.status);
        if (body.priority) q = q.eq("priority", body.priority);
        if (body.assignee) q = q.eq("assigned_to", body.assignee);
        const { data: tasks } = await q.order("created_at", { ascending: false }).limit(100);
        return jsonResponse({ ok: true, tasks: tasks ?? [] });
      }

      case "get_context": {
        const [{ data: agent_config }, { data: company_context }, { data: directives }] = await Promise.all([
          admin.from("agent_config").select("*").eq("company_id", companyId).maybeSingle(),
          admin.from("company_context").select("*").eq("company_id", companyId).maybeSingle(),
          admin.from("directives").select("id, content, source, created_at")
            .eq("company_id", companyId).eq("status", "active").order("created_at", { ascending: true }),
        ]);
        return jsonResponse({ ok: true, agent_config, company_context, directives: directives ?? [] });
      }

      default:
        return errorResponse(`action desconhecida: ${action}`, 400);
    }
  } catch (e: any) {
    return errorResponse(e?.message ?? "Erro no coo-tools", 500);
  }
});
