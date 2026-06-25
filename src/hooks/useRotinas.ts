import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Frequency = "daily" | "weekly" | "monthly";
export type RoutineStatus = "active" | "paused" | "pending_approval" | "rejected";

export interface Routine {
  id: string;
  company_id: string;
  name: string;
  frequency: Frequency;
  schedule_time: string | null;
  schedule_day: number | null;
  instruction: string;
  target_system: string | null;
  status: RoutineStatus;
  approved?: boolean | null;
  requested_by: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diária", weekly: "Semanal", monthly: "Mensal",
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// routines não está no types.ts gerado → cast (ver useOnboarding).
const sb = () => supabase as any;

export function useRotinas() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: company } = await sb().from("companies").select("id").maybeSingle();
    if (!company) { setLoading(false); return; }
    setCompanyId(company.id);
    const { data } = await sb().from("routines").select("*").eq("company_id", company.id)
      .order("created_at", { ascending: true });
    setRoutines((data ?? []) as Routine[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createRoutine = useCallback(
    async (fields: Partial<Routine>) => {
      if (!companyId) return;
      const { data, error } = await sb().from("routines").insert({
        company_id: companyId,
        name: fields.name,
        frequency: fields.frequency ?? "daily",
        schedule_time: fields.schedule_time || null,
        schedule_day: fields.schedule_day ?? null,
        instruction: fields.instruction,
        target_system: fields.target_system || null,
        status: "active", // criada pelo admin no painel já entra ativa
      }).select("*").maybeSingle();
      if (error) { toast.error(`Falha: ${error.message}`); return; }
      setRoutines((prev) => [...prev, data as Routine]);
      toast.success("Rotina criada");
    },
    [companyId],
  );

  const setStatus = useCallback(async (id: string, status: RoutineStatus) => {
    const { data, error } = await sb().from("routines").update({ status }).eq("id", id).select("*").maybeSingle();
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setRoutines((prev) => prev.map((r) => (r.id === id ? (data as Routine) : r)));
  }, []);

  // D3: aprova a rotina (status active + approved) e despacha imediatamente via coo-orchestrator.
  const approveAndRun = useCallback(async (id: string) => {
    const { data, error } = await sb().from("routines").update({ status: "active", approved: true }).eq("id", id).select("*").maybeSingle();
    if (error) { toast.error(`Falha ao aprovar: ${error.message}`); return; }
    setRoutines((prev) => prev.map((r) => (r.id === id ? (data as Routine) : r)));
    const { data: res, error: e2 } = await supabase.functions.invoke("coo-orchestrator", { body: { type: "routine", routine_id: id } });
    if (e2 || (res as any)?.ok === false) toast.error((res as any)?.error ?? "Rotina aprovada, mas falhou ao despachar.");
    else toast.success("Rotina aprovada e despachada para o Atlas.");
  }, []);

  const deleteRoutine = useCallback(async (id: string) => {
    const { error } = await sb().from("routines").delete().eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setRoutines((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const pending = routines.filter((r) => r.status === "pending_approval");
  const managed = routines.filter((r) => r.status === "active" || r.status === "paused");

  return { loading, companyId, routines, pending, managed, createRoutine, setStatus, approveAndRun, deleteRoutine };
}

export type RotinasState = ReturnType<typeof useRotinas>;
