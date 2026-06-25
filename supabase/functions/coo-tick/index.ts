// Minute-resolution tick scheduler. Called by pg_cron (every minute) with the
// service role key. Resolves each active company's local time and:
//   1) dispatcha relatórios (morning briefing / checkpoint / daily report) — Mon-Fri
//   2) dispara as rotinas (tabela public.routines, status='active') cujo horário bate agora
//
// Sprint 10: rotinas passam a ser data-driven (tabela routines), não mais hardcoded.
// Os relatórios continuam sendo agendados via agent_config (feature separada).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nowInTimezone(tz: string): { hhmm: string; weekday: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit", minute: "2-digit", weekday: "short", day: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hhmm = `${get("hour")}:${get("minute")}`;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[get("weekday")] ?? 0;
  const day = parseInt(get("day"), 10) || 1;
  return { hhmm, weekday, day };
}

async function dispatchReport(
  projectUrl: string,
  serviceKey: string,
  companyId: string,
  type: "daily" | "checkpoint" | "briefing",
) {
  const body = type === "briefing"
    ? { type: "daily", company_id: companyId, briefing: true }
    : { type, company_id: companyId };
  await fetch(`${projectUrl}/functions/v1/generate-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify(body),
  });
}

// Decide se a rotina deve disparar neste minuto (no fuso da empresa).
function routineShouldFire(
  r: { frequency: string; schedule_time: string | null; schedule_day: number | null },
  hhmm: string,
  weekday: number,
  day: number,
): boolean {
  const t = (r.schedule_time ?? "").slice(0, 5);
  if (!t || t !== hhmm) return false;
  if (r.frequency === "daily") return true;
  if (r.frequency === "weekly") return Number(r.schedule_day) === weekday;
  if (r.frequency === "monthly") return day === (r.schedule_day && r.schedule_day >= 1 ? r.schedule_day : 1);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(projectUrl, serviceKey);

  const { data: configs, error } = await admin
    .from("agent_config")
    .select("company_id, timezone, morning_briefing_time, checkpoint_time, daily_report_time, is_active");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rotinas ativas de todas as empresas, agrupadas por company_id.
  const { data: allRoutines } = await admin
    .from("routines")
    .select("id, company_id, name, frequency, schedule_time, schedule_day, instruction")
    .eq("status", "active");
  const routinesByCompany = new Map<string, any[]>();
  for (const r of allRoutines ?? []) {
    const list = routinesByCompany.get(r.company_id) ?? [];
    list.push(r);
    routinesByCompany.set(r.company_id, list);
  }

  const dispatched: Array<{ company_id: string; kind: string }> = [];

  for (const cfg of configs ?? []) {
    if (!cfg.is_active) continue;
    const { hhmm, weekday, day } = nowInTimezone(cfg.timezone ?? "America/Sao_Paulo");

    // ---- Relatórios (Mon-Fri) ----
    if (weekday >= 1 && weekday <= 5) {
      if (hhmm === (cfg.morning_briefing_time ?? "08:00").slice(0, 5)) {
        await dispatchReport(projectUrl, serviceKey, cfg.company_id, "briefing");
        dispatched.push({ company_id: cfg.company_id, kind: "morning" });
      } else if (hhmm === (cfg.checkpoint_time ?? "12:00").slice(0, 5)) {
        await dispatchReport(projectUrl, serviceKey, cfg.company_id, "checkpoint");
        dispatched.push({ company_id: cfg.company_id, kind: "checkpoint" });
      } else if (hhmm === (cfg.daily_report_time ?? "18:00").slice(0, 5)) {
        await dispatchReport(projectUrl, serviceKey, cfg.company_id, "daily");
        dispatched.push({ company_id: cfg.company_id, kind: "daily" });
      }
    }

    // ---- Rotinas (qualquer dia, conforme o schedule de cada rotina) ----
    const routines = routinesByCompany.get(cfg.company_id) ?? [];
    for (const r of routines) {
      if (!routineShouldFire(r, hhmm, weekday, day)) continue;

      const syntheticId = `routine-${r.id}-${Date.now()}`;
      const { data: task } = await admin.from("tasks").insert({
        company_id: cfg.company_id,
        notion_task_id: syntheticId,
        title: r.name,
        description: r.instruction,
        status: "todo",
        source: "routine",
        assigned_to: "coo",
      }).select("id").maybeSingle();

      await admin.from("routines").update({
        last_run_at: new Date().toISOString(),
        last_run_status: "disparada",
      }).eq("id", r.id);

      await admin.from("execution_logs").insert({
        company_id: cfg.company_id,
        type: "action",
        content: `Rotina disparada: ${r.name}`,
      });

      // Despacha via coo-orchestrator (VPS OpenClaw; cai em execute-task se não houver instância).
      if (task?.id) {
        fetch(`${projectUrl}/functions/v1/coo-orchestrator`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ type: "task", task_id: (task as any).id }),
        }).catch(() => { /* ignore */ });
      }

      dispatched.push({ company_id: cfg.company_id, kind: `routine:${r.name}` });
    }

    // ---- Motor de sugestões de processos (1x/dia, 03:00 no fuso da empresa) ----
    if (hhmm === "03:00") {
      fetch(`${projectUrl}/functions/v1/process-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ company_id: cfg.company_id }),
      }).catch(() => { /* ignore */ });
      dispatched.push({ company_id: cfg.company_id, kind: "process-suggestions" });
    }
  }

  return new Response(JSON.stringify({ ok: true, dispatched }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
