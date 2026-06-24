import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type Visibility = "admin" | "authorized_team" | "everyone";
export type ProcessStatus = "draft" | "published";

export interface ProcessStep {
  description: string;
  responsible: string;
  sla: string;
}

export interface Process {
  id: string;
  company_id: string;
  name: string;
  area: string | null;
  visibility: Visibility;
  status: ProcessStatus;
  steps: ProcessStep[];
  source: string;
  updated_at: string;
}

export interface ProcessSuggestion {
  id: string;
  process_id: string;
  suggested_step: ProcessStep;
  evidence: { count?: number; dates?: string[] };
  status: "pending" | "accepted" | "ignored";
}

export const VISIBILITY_META: Record<Visibility, { label: string; icon: string }> = {
  admin: { label: "Admin", icon: "lock" },
  authorized_team: { label: "Time autorizado", icon: "users" },
  everyone: { label: "Todo o time", icon: "globe" },
};

// processes/team_members não estão no types.ts gerado → cast (ver useOnboarding).
const sb = () => supabase as any;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function useProcessos() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [suggestions, setSuggestions] = useState<ProcessSuggestion[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: company } = await sb().from("companies").select("id").maybeSingle();
    if (!company) { setLoading(false); return; }
    setCompanyId(company.id);
    const [{ data: procs }, { data: mem }, { data: sugg }] = await Promise.all([
      sb().from("processes").select("*").eq("company_id", company.id).order("updated_at", { ascending: false }),
      sb().from("team_members").select("id, name").eq("company_id", company.id).order("name"),
      sb().from("process_suggestions").select("id, process_id, suggested_step, evidence, status").eq("company_id", company.id).eq("status", "pending"),
    ]);
    setProcesses((procs ?? []) as Process[]);
    setMembers((mem ?? []) as { id: string; name: string }[]);
    setSuggestions((sugg ?? []) as ProcessSuggestion[]);
    setLoading(false);
  }, []);

  const setSuggestionStatus = useCallback(async (id: string, status: "accepted" | "ignored") => {
    const { error } = await sb().from("process_suggestions").update({ status }).eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProcess = useCallback(
    async (p: Partial<Process> & { id?: string }): Promise<Process | null> => {
      if (!companyId) return null;
      const row = {
        name: p.name, area: p.area ?? null, visibility: p.visibility ?? "admin",
        status: p.status ?? "draft", steps: p.steps ?? [], source: p.source ?? "manual",
        updated_by: user?.id ?? null,
      };
      if (p.id) {
        const { data, error } = await sb().from("processes").update(row).eq("id", p.id).select("*").maybeSingle();
        if (error) { toast.error(`Falha: ${error.message}`); return null; }
        setProcesses((prev) => prev.map((x) => (x.id === p.id ? (data as Process) : x)));
        return data as Process;
      }
      const { data, error } = await sb().from("processes").insert({
        ...row, company_id: companyId, created_by: user?.id ?? null,
      }).select("*").maybeSingle();
      if (error) { toast.error(`Falha: ${error.message}`); return null; }
      setProcesses((prev) => [data as Process, ...prev]);
      return data as Process;
    },
    [companyId, user?.id],
  );

  const deleteProcess = useCallback(async (id: string) => {
    const { error } = await sb().from("processes").delete().eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setProcesses((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Importa PDF/DOCX → cerebro-ai estrutura em passos (não persiste; o líder revisa).
  const importFromFile = useCallback(
    async (file: File): Promise<{ name: string; area: string; steps: ProcessStep[] } | null> => {
      if (!companyId) return null;
      const data_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("cerebro-ai", {
        body: { company_id: companyId, mode: "process_import", payload: { filename: file.name, mime: file.type, data_base64 } },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? "Falha ao importar o documento");
        return null;
      }
      return (data as any).result as { name: string; area: string; steps: ProcessStep[] };
    },
    [companyId],
  );

  return { loading, companyId, processes, members, suggestions, saveProcess, deleteProcess, importFromFile, setSuggestionStatus, refresh: load };
}

export type ProcessosState = ReturnType<typeof useProcessos>;
