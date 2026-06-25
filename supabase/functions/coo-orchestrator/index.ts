// coo-orchestrator — despacha tarefas/rotinas do painel para a instância OpenClaw na VPS.
// POST {ingress_url}/hooks/agent (Bearer hooks_token) com { type, run_id, user_id, task_id|routine_id, approved }.
// Resolve a instância em atlas_instances; cria um agent_run; se não houver instância (ou o POST
// falhar), cai em fallback execute-task para tarefas. O resultado final chega depois via coo-reply.
//
// Chamado por: coo-tick (service role) e pelo botão "Executar agora" do Backlog (JWT do usuário).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { ok: false, error: "Não autorizado" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const calledByService = token === serviceKey;
    const admin = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;
    if (!calledByService) {
      const { data: u } = await admin.auth.getUser(token);
      if (!u.user) return json(401, { ok: false, error: "Token inválido" });
      userId = u.user.id;
    }

    const { type, task_id, routine_id, company_id: bodyCompanyId } = await req.json().catch(() => ({}));
    if (!["task", "routine", "brain_sync"].includes(type)) return json(400, { ok: false, error: "type inválido" });

    // ---- Resolve company + entidade ----
    let companyId: string | null = bodyCompanyId ?? null;
    let approved = true;
    if (type === "task") {
      if (!task_id) return json(400, { ok: false, error: "task_id obrigatório" });
      const { data: t } = await admin.from("tasks").select("company_id").eq("id", task_id).maybeSingle();
      if (!t) return json(404, { ok: false, error: "task não encontrada" });
      companyId = t.company_id;
    } else if (type === "routine") {
      if (!routine_id) return json(400, { ok: false, error: "routine_id obrigatório" });
      const { data: r } = await admin.from("routines").select("company_id, status").eq("id", routine_id).maybeSingle();
      if (!r) return json(404, { ok: false, error: "rotina não encontrada" });
      companyId = r.company_id;
      approved = r.status === "active";
      if (!approved) return json(400, { ok: false, error: "rotina não aprovada — não pode ser executada" });
    }
    if (!companyId) return json(400, { ok: false, error: "company_id não resolvido" });

    const { data: company } = await admin.from("companies").select("id, owner_id").eq("id", companyId).maybeSingle();
    if (!company) return json(404, { ok: false, error: "empresa não encontrada" });
    if (!calledByService && company.owner_id !== userId) return json(403, { ok: false, error: "sem permissão" });
    const ownerId = company.owner_id;

    // ---- Instância registrada (atlas_instances) ----
    const { data: inst } = await admin.from("atlas_instances")
      .select("id, ingress_url, hooks_token").eq("owner_user_id", ownerId).maybeSingle();

    // ---- Cria o run ----
    const { data: run, error: runErr } = await admin.from("agent_runs").insert({
      company_id: companyId, user_id: ownerId, type,
      task_id: type === "task" ? task_id : null,
      routine_id: type === "routine" ? routine_id : null,
      instance_id: inst?.id ?? null,
      status: "pending",
    }).select("id").single();
    if (runErr || !run) return json(500, { ok: false, error: runErr?.message ?? "Falha ao criar run" });
    const runId = run.id;

    const fallbackExecute = async (note: string) => {
      if (type === "task" && task_id) {
        fetch(`${supabaseUrl}/functions/v1/execute-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ task_id }),
        }).catch(() => { /* best-effort */ });
        await admin.from("agent_runs").update({ status: "dispatched", error: note }).eq("id", runId);
        return json(200, { ok: true, run_id: runId, dispatched: "fallback", note });
      }
      await admin.from("agent_runs").update({ status: "error", error: note }).eq("id", runId);
      return json(409, { ok: false, run_id: runId, error: note });
    };

    // ---- Sem instância → fallback ----
    if (!inst?.ingress_url || !inst?.hooks_token) {
      return await fallbackExecute("Nenhuma instância OpenClaw registrada — usando execute-task.");
    }

    // ---- Despacha para a VPS ----
    try {
      const res = await fetch(`${String(inst.ingress_url).replace(/\/$/, "")}/hooks/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${inst.hooks_token}` },
        body: JSON.stringify({
          type, run_id: runId, user_id: ownerId,
          task_id: task_id ?? undefined, routine_id: routine_id ?? undefined, approved,
        }),
      });
      if (!res.ok) throw new Error(`hooks/agent respondeu ${res.status}`);
      await admin.from("agent_runs").update({ status: "dispatched" }).eq("id", runId);
      if (type === "task" && task_id) await admin.from("tasks").update({ status: "doing" }).eq("id", task_id);
      return json(200, { ok: true, run_id: runId, dispatched: "vps" });
    } catch (e: any) {
      return await fallbackExecute(`Falha ao despachar à VPS (${e?.message ?? e}) — usando execute-task.`);
    }
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Erro no orchestrator" });
  }
});
