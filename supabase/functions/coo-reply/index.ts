// coo-reply — recebe o resultado/ação do agente Atlas (VPS) e fecha o run.
// Chamado por skills/atlas/scripts/coo_reply.sh: POST {PANEL_BASE_URL}/coo-reply
// Auth: header X-Panel-Token (validado contra o secret PANEL_TOKEN).
// Body: { run_id, status: "sent"|"blocked"|"done"|"error", content?, result? }
// Atualiza agent_runs (status/content/result), reflete na tasks (done/blocked + evidência)
// e registra em execution_logs.
import { adminClient, corsHeaders, errorResponse, jsonResponse, validatePanelToken } from "../_shared/panel.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  if (!(await validatePanelToken(req))) return errorResponse("X-Panel-Token inválido", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("JSON inválido", 400); }

  const runId = body.run_id as string | undefined;
  const status = body.status as string | undefined;
  const content = (body.content as string | undefined) ?? null;
  const result = (body.result as unknown) ?? null;

  if (!runId) return errorResponse("run_id obrigatório", 400);
  if (!status || !["sent", "blocked", "done", "error"].includes(status)) return errorResponse("status inválido", 400);

  const admin = adminClient();

  const { data: run } = await admin
    .from("agent_runs")
    .select("id, company_id, task_id, type")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return errorResponse("run não encontrado", 404);

  // agent_runs.status aceita pending|dispatched|done|blocked|error → 'sent' vira 'dispatched' (interino).
  const runStatus = status === "sent" ? "dispatched" : status;
  const { error: runErr } = await admin.from("agent_runs")
    .update({ status: runStatus, content, result })
    .eq("id", runId);
  if (runErr) return errorResponse(runErr.message, 500);

  // Reflete na tarefa (tasks.status ∈ todo|doing|done|blocked) quando terminal.
  if (run.task_id && (status === "done" || status === "blocked" || status === "error")) {
    const patch: Record<string, unknown> = { status: status === "done" ? "done" : "blocked" };
    if (status === "done") {
      if (content) patch.result = content;
      const ev = (result as any)?.evidence?.[0];
      if (typeof ev === "string") patch.evidence_url = ev;
    } else {
      patch.block_reason = content ?? "Bloqueado pelo agente.";
    }
    await admin.from("tasks").update(patch).eq("id", run.task_id);
  }

  // Feed em tempo real.
  await admin.from("execution_logs").insert({
    company_id: run.company_id,
    task_id: run.task_id ?? null,
    type: status === "blocked" || status === "error" ? "error" : "action",
    content: content ?? `Run ${runId} → ${status}`,
  });

  return jsonResponse({ ok: true, run_id: runId, status: runStatus });
});
