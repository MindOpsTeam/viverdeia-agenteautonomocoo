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

export interface DetectedProcess {
  name: string;
  area: string;
  steps: ProcessStep[];
  import_origin?: string;
}

export type ImportKind = "audio" | "video" | "transcript" | "document" | "url";
export type ImportStatus = "queued" | "transcribing" | "analyzing" | "structuring" | "ready" | "error";

export interface ProcessImport {
  id: string;
  kind: ImportKind;
  source_name: string | null;
  status: ImportStatus;
  progress_message: string | null;
  transcript: string | null;
  result: DetectedProcess[];
  error: string | null;
}

export interface ProcessSuggestion {
  id: string;
  process_id: string | null;
  suggested_step: ProcessStep | null;
  suggested_process: DetectedProcess | null;
  evidence: { count?: number; dates?: string[] };
  status: "pending" | "accepted" | "ignored";
}

export const VISIBILITY_META: Record<Visibility, { label: string; icon: string }> = {
  admin: { label: "Admin", icon: "lock" },
  authorized_team: { label: "Time autorizado", icon: "users" },
  everyone: { label: "Todo o time", icon: "globe" },
};

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024; // 25MB

// processes/team_members não estão no types.ts gerado → cast (ver useOnboarding).
const sb = () => supabase as any;

export function detectImportKind(file: File): ImportKind | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp3", "m4a", "wav"].includes(ext) || file.type.startsWith("audio/")) return "audio";
  if (["mp4", "mov"].includes(ext) || file.type.startsWith("video/")) return "video";
  if (["txt", "vtt", "srt"].includes(ext)) return "transcript";
  if (["pdf", "docx"].includes(ext)) return "document";
  return null;
}

export function useProcessos() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [suggestions, setSuggestions] = useState<ProcessSuggestion[]>([]);
  const [imports, setImports] = useState<ProcessImport[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: company } = await sb().from("companies").select("id").maybeSingle();
    if (!company) { setLoading(false); return; }
    setCompanyId(company.id);
    const [{ data: procs }, { data: mem }, { data: sugg }, { data: imps }] = await Promise.all([
      sb().from("processes").select("*").eq("company_id", company.id).order("updated_at", { ascending: false }),
      sb().from("team_members").select("id, name").eq("company_id", company.id).order("name"),
      sb().from("process_suggestions").select("id, process_id, suggested_step, suggested_process, evidence, status").eq("company_id", company.id).eq("status", "pending"),
      sb().from("process_imports").select("id, kind, source_name, status, progress_message, transcript, result, error").eq("company_id", company.id).neq("status", "ready").order("created_at", { ascending: false }),
    ]);
    setProcesses((procs ?? []) as Process[]);
    setMembers((mem ?? []) as { id: string; name: string }[]);
    setSuggestions((sugg ?? []) as ProcessSuggestion[]);
    setImports((imps ?? []) as ProcessImport[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: acompanha os jobs de importação em andamento.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`process-imports-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "process_imports", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setImports((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((i) => i.id !== (payload.old as any).id);
            const row = payload.new as ProcessImport;
            const idx = prev.findIndex((i) => i.id === row.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = row; return next; }
            return [row, ...prev];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const setSuggestionStatus = useCallback(async (id: string, status: "accepted" | "ignored") => {
    const { error } = await sb().from("process_suggestions").update({ status }).eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const saveProcess = useCallback(
    async (p: Partial<Process> & { id?: string; import_origin?: string; import_transcript?: string }): Promise<Process | null> => {
      if (!companyId) return null;
      const row: Record<string, unknown> = {
        name: p.name, area: p.area ?? null, visibility: p.visibility ?? "admin",
        status: p.status ?? "draft", steps: p.steps ?? [], source: p.source ?? "manual",
        updated_by: user?.id ?? null,
      };
      if (p.import_origin !== undefined) row.import_origin = p.import_origin;
      if (p.import_transcript !== undefined) row.import_transcript = p.import_transcript;
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

  // ---- Importação multi-formato (cria job + dispara orquestrador em background) ----
  const startFileImport = useCallback(async (file: File): Promise<boolean> => {
    if (!companyId) return false;
    const kind = detectImportKind(file);
    if (!kind) { toast.error("Formato não suportado. Use áudio, vídeo, PDF, DOCX, TXT, VTT ou SRT."); return false; }
    if (file.size > MAX_IMPORT_BYTES) { toast.error("Arquivo acima de 25MB. Envie um trecho menor."); return false; }

    try {
      if (kind === "transcript") {
        const text = await file.text();
        const { data, error } = await sb().from("process_imports").insert({
          company_id: companyId, created_by: user?.id ?? null, kind, source_name: file.name,
          transcript: text, status: "queued",
        }).select("id").maybeSingle();
        if (error || !data) { toast.error(`Falha ao criar import: ${error?.message}`); return false; }
        await supabase.functions.invoke("process-import", { body: { import_id: data.id } });
      } else {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("process-imports").upload(path, file);
        if (upErr) { toast.error(`Falha no upload: ${upErr.message}`); return false; }
        const { data, error } = await sb().from("process_imports").insert({
          company_id: companyId, created_by: user?.id ?? null, kind, source_name: file.name,
          storage_path: path, status: "queued",
        }).select("id").maybeSingle();
        if (error || !data) { toast.error(`Falha ao criar import: ${error?.message}`); return false; }
        await supabase.functions.invoke("process-import", { body: { import_id: data.id } });
      }
      toast.success("Importação iniciada — o Atlas vai processar em segundo plano.");
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar a importação");
      return false;
    }
  }, [companyId, user?.id]);

  const startUrlImport = useCallback(async (url: string): Promise<boolean> => {
    if (!companyId) return false;
    if (!/youtu\.?be|loom\.com/.test(url)) { toast.error("Suportamos YouTube e Loom. Para outras fontes, baixe o arquivo e faça upload."); return false; }
    try {
      const { data, error } = await sb().from("process_imports").insert({
        company_id: companyId, created_by: user?.id ?? null, kind: "url", source_name: url, url, status: "queued",
      }).select("id").maybeSingle();
      if (error || !data) { toast.error(`Falha ao criar import: ${error?.message}`); return false; }
      await supabase.functions.invoke("process-import", { body: { import_id: data.id } });
      toast.success("Importação da URL iniciada.");
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar a URL");
      return false;
    }
  }, [companyId, user?.id]);

  const dismissImport = useCallback(async (id: string) => {
    await sb().from("process_imports").delete().eq("id", id);
    setImports((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Cria processos-rascunho a partir do resultado de um job (detecção múltipla).
  const createProcessesFromImport = useCallback(async (job: ProcessImport, picks: DetectedProcess[]): Promise<Process[]> => {
    const created: Process[] = [];
    for (const d of picks) {
      const p = await saveProcess({
        name: d.name, area: d.area, steps: d.steps, status: "draft", source: "imported",
        import_origin: d.import_origin ?? job.source_name ?? undefined,
        import_transcript: job.transcript ?? undefined,
      });
      if (p) created.push(p);
    }
    await dismissImport(job.id);
    return created;
  }, [saveProcess, dismissImport]);

  // ---- Card "O que o Atlas observou" (sugestões de processo não documentado) ----
  const createProcessFromSuggestion = useCallback(async (s: ProcessSuggestion): Promise<Process | null> => {
    const sp = s.suggested_process;
    if (!sp) return null;
    const p = await saveProcess({ name: sp.name, area: sp.area, steps: sp.steps, status: "draft", source: "ai" });
    if (p) await setSuggestionStatus(s.id, "accepted");
    return p;
  }, [saveProcess, setSuggestionStatus]);

  const addSuggestionToProcess = useCallback(async (s: ProcessSuggestion, processId: string): Promise<boolean> => {
    const target = processes.find((p) => p.id === processId);
    if (!target) return false;
    const newSteps = s.suggested_process?.steps ?? (s.suggested_step ? [s.suggested_step] : []);
    if (!newSteps.length) return false;
    const p = await saveProcess({ id: processId, name: target.name, area: target.area, visibility: target.visibility, status: target.status, source: target.source, steps: [...target.steps, ...newSteps] });
    if (p) await setSuggestionStatus(s.id, "accepted");
    return !!p;
  }, [processes, saveProcess, setSuggestionStatus]);

  return {
    loading, companyId, processes, members, suggestions, imports,
    saveProcess, deleteProcess, setSuggestionStatus,
    startFileImport, startUrlImport, dismissImport, createProcessesFromImport,
    createProcessFromSuggestion, addSuggestionToProcess,
    refresh: load,
  };
}

export type ProcessosState = ReturnType<typeof useProcessos>;
