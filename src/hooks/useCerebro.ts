import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Tone = "direct" | "formal" | "informal";

export interface CaseItem { title: string; result: string }
export interface ProductItem { name: string; description: string }

export interface CompanyContext {
  id?: string;
  company_id: string;
  agent_name: string;
  communication_tone: Tone;
  presentation: string;
  operational_context: string;
  mission: string;
  target_audience: string;
  cases: CaseItem[];
  system_prompt: string;
  products: ProductItem[];
  skills_enabled: string[];
  generated_by_ai: boolean;
  reviewed_at: string | null;
}

export interface Directive {
  id: string;
  content: string;
  source: "manual" | "ai_suggestion" | "wizard";
  status: "active" | "pending_approval" | "rejected";
  origin_event: string | null;
  created_at: string;
}

export interface KnowledgeItem {
  id: string;
  kind: "file" | "source";
  filename: string;
  file_type: string | null;
  source_type: string | null;
  storage_path: string | null;
  status: "indexing" | "available" | "error";
  active: boolean;
  uploaded_at: string;
}

export interface IdentityProposal {
  agent_name: string;
  communication_tone: Tone;
  presentation: string;
  mission: string;
  target_audience: string;
  cases: CaseItem[];
  directives: string[];
}

export const SKILLS_CATALOG: { key: string; label: string }[] = [
  { key: "ler-backlog", label: "Ler backlog do Notion" },
  { key: "atualizar-status", label: "Atualizar status com evidência" },
  { key: "executar-rotina-browser", label: "Executar rotinas no browser (OpenClaw)" },
  { key: "postar-relatorio", label: "Gerar e postar relatórios" },
  { key: "postar-discord", label: "Postar no Discord" },
  { key: "escalar-bloqueio", label: "Escalar bloqueios" },
];

const EMPTY_CONTEXT = (companyId: string): CompanyContext => ({
  company_id: companyId,
  agent_name: "Atlas",
  communication_tone: "direct",
  presentation: "",
  operational_context: "",
  mission: "",
  target_audience: "",
  cases: [],
  system_prompt: "",
  products: [],
  skills_enabled: [],
  generated_by_ai: false,
  reviewed_at: null,
});

// company_context/directives/knowledge_files não estão no types.ts gerado → cast (ver useOnboarding).
const sb = () => supabase as any;

export function useCerebro() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [context, setContext] = useState<CompanyContext | null>(null);
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [brain, setBrain] = useState<{ version: string | null; syncedAt: string | null; commitHash: string | null }>({ version: null, syncedAt: null, commitHash: null });
  const [github, setGithub] = useState<{ repoUrl: string | null; vpsUrl: string | null }>({ repoUrl: null, vpsUrl: null });
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: company } = await sb().from("companies").select("id, name").maybeSingle();
    if (!company) { setLoading(false); return; }
    setCompanyId(company.id);
    const [{ data: ctx }, { data: dirs }, { data: kn }, { data: cfg }] = await Promise.all([
      sb().from("company_context").select("*").eq("company_id", company.id).maybeSingle(),
      sb().from("directives").select("*").eq("company_id", company.id).order("created_at", { ascending: true }),
      sb().from("knowledge_files").select("*").eq("company_id", company.id).order("uploaded_at", { ascending: true }),
      sb().from("agent_config")
        .select("brain_version, brain_synced_at, github_commit_hash, github_repo_url, vps_url, notion_database_id, discord_channel_id")
        .eq("company_id", company.id).maybeSingle(),
    ]);

    setContext(normalizeContext(ctx, company.id));
    setDirectives((dirs ?? []) as Directive[]);
    setBrain({ version: cfg?.brain_version ?? null, syncedAt: cfg?.brain_synced_at ?? null, commitHash: cfg?.github_commit_hash ?? null });
    setGithub({ repoUrl: cfg?.github_repo_url ?? null, vpsUrl: cfg?.vps_url ?? null });

    const items = (kn ?? []) as KnowledgeItem[];
    const haveSources = new Set(items.filter((i) => i.kind === "source").map((i) => i.source_type));
    const toCreate: Record<string, unknown>[] = [];
    if (cfg?.notion_database_id && !haveSources.has("notion")) toCreate.push({ company_id: company.id, kind: "source", source_type: "notion", filename: "Notion — Backlog Operacional", status: "available", active: false });
    if (cfg?.discord_channel_id && !haveSources.has("discord")) toCreate.push({ company_id: company.id, kind: "source", source_type: "discord", filename: "Discord — canal configurado", status: "available", active: false });
    if (toCreate.length > 0) {
      const { data: created } = await sb().from("knowledge_files").insert(toCreate).select("*");
      setKnowledge([...items, ...((created ?? []) as KnowledgeItem[])]);
    } else {
      setKnowledge(items);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const files = knowledge.filter((k) => k.kind === "file");
  const sources = knowledge.filter((k) => k.kind === "source");
  const activeDirectives = directives.filter((d) => d.status === "active");
  const suggestions = directives.filter((d) => d.status === "pending_approval");

  const saveContext = useCallback(
    async (patch: Partial<CompanyContext>): Promise<boolean> => {
      if (!companyId) return false;
      const base = context ?? EMPTY_CONTEXT(companyId);
      const next = { ...base, ...patch, company_id: companyId };
      const row = {
        company_id: companyId,
        agent_name: next.agent_name,
        communication_tone: next.communication_tone,
        presentation: next.presentation,
        operational_context: next.operational_context,
        mission: next.mission,
        target_audience: next.target_audience,
        cases: next.cases,
        system_prompt: next.system_prompt,
        products: next.products,
        skills_enabled: next.skills_enabled,
        generated_by_ai: next.generated_by_ai,
        reviewed_at: next.reviewed_at,
      };
      const { data, error } = await sb().from("company_context").upsert(row, { onConflict: "company_id" }).select("*").maybeSingle();
      if (error) { toast.error(`Falha ao salvar: ${error.message}`); return false; }
      setContext(normalizeContext(data, companyId));
      return true;
    },
    [companyId, context],
  );

  const addDirective = useCallback(
    async (content: string, opts?: { source?: Directive["source"]; status?: Directive["status"]; origin_event?: string }) => {
      if (!companyId || !content.trim()) return;
      const { data, error } = await sb().from("directives").insert({
        company_id: companyId, content: content.trim(),
        source: opts?.source ?? "manual", status: opts?.status ?? "active", origin_event: opts?.origin_event ?? null,
      }).select("*").maybeSingle();
      if (error) { toast.error(`Falha: ${error.message}`); return; }
      setDirectives((prev) => [...prev, data as Directive]);
    },
    [companyId],
  );

  const updateDirective = useCallback(async (id: string, patch: Partial<Directive>) => {
    const { data, error } = await sb().from("directives").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setDirectives((prev) => prev.map((d) => (d.id === id ? (data as Directive) : d)));
  }, []);

  const deleteDirective = useCallback(async (id: string) => {
    const { error } = await sb().from("directives").delete().eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setDirectives((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const generateIdentity = useCallback(
    async (aboutCompany: string, aboutAgent: string): Promise<IdentityProposal | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase.functions.invoke("cerebro-ai", {
        body: { company_id: companyId, mode: "identity", payload: { about_company: aboutCompany, about_agent: aboutAgent } },
      });
      if (error || (data as any)?.error) { toast.error((data as any)?.error ?? "Falha ao gerar identidade"); return null; }
      return (data as any).result as IdentityProposal;
    },
    [companyId],
  );

  const applyIdentity = useCallback(
    async (proposal: IdentityProposal): Promise<boolean> => {
      const ok = await saveContext({
        agent_name: proposal.agent_name,
        communication_tone: proposal.communication_tone,
        presentation: proposal.presentation,
        mission: proposal.mission,
        target_audience: proposal.target_audience,
        cases: proposal.cases ?? [],
        generated_by_ai: true,
        reviewed_at: new Date().toISOString(),
      });
      if (!ok) return false;
      for (const content of proposal.directives) await addDirective(content, { source: "wizard", status: "active" });
      toast.success("Identidade aplicada");
      return true;
    },
    [saveContext, addDirective],
  );

  const suggestDirective = useCallback(
    async (description: string): Promise<string | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase.functions.invoke("cerebro-ai", {
        body: { company_id: companyId, mode: "directive", payload: { description } },
      });
      if (error || (data as any)?.error) { toast.error((data as any)?.error ?? "Falha ao gerar sugestão"); return null; }
      return ((data as any).result?.content ?? "") as string;
    },
    [companyId],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!companyId) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const path = `${companyId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await sb().storage.from("knowledge").upload(path, file);
      if (upErr) { toast.error(`Falha no upload: ${upErr.message}`); return; }
      const { data, error } = await sb().from("knowledge_files").insert({
        company_id: companyId, kind: "file", filename: file.name, file_type: ext, storage_path: path, status: "available", active: false,
      }).select("*").maybeSingle();
      if (error) { toast.error(`Falha ao registrar: ${error.message}`); return; }
      setKnowledge((prev) => [...prev, data as KnowledgeItem]);
      toast.success(`${file.name} enviado`);
    },
    [companyId],
  );

  const toggleKnowledge = useCallback(async (id: string, active: boolean) => {
    const { data, error } = await sb().from("knowledge_files").update({ active }).eq("id", id).select("*").maybeSingle();
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setKnowledge((prev) => prev.map((k) => (k.id === id ? (data as KnowledgeItem) : k)));
  }, []);

  const deleteKnowledge = useCallback(async (item: KnowledgeItem) => {
    if (item.storage_path) await sb().storage.from("knowledge").remove([item.storage_path]);
    const { error } = await sb().from("knowledge_files").delete().eq("id", item.id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setKnowledge((prev) => prev.filter((k) => k.id !== item.id));
  }, []);

  const sync = useCallback(async () => {
    if (!companyId) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("brain-sync", { body: { company_id: companyId } });
    setSyncing(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error ?? "Falha ao sincronizar cérebro"); return; }
    setBrain({ version: (data as any).brain_version, syncedAt: (data as any).brain_synced_at, commitHash: (data as any).commit_hash ?? null });
    toast.success((data as any).commit_hash ? `Sincronizado · commit ${(data as any).commit_hash}` : "Cérebro sincronizado");
  }, [companyId]);

  return {
    loading, companyId, context, directives, activeDirectives, suggestions, files, sources, brain, github, syncing,
    refresh: load, saveContext, addDirective, updateDirective, deleteDirective,
    generateIdentity, applyIdentity, suggestDirective, uploadFile, toggleKnowledge, deleteKnowledge, sync,
  };
}

function normalizeContext(raw: any, companyId: string): CompanyContext | null {
  if (!raw) return null;
  return {
    ...EMPTY_CONTEXT(companyId),
    ...raw,
    cases: Array.isArray(raw.cases) ? raw.cases : [],
    products: Array.isArray(raw.products) ? raw.products : [],
    skills_enabled: Array.isArray(raw.skills_enabled) ? raw.skills_enabled : [],
    mission: raw.mission ?? "",
    target_audience: raw.target_audience ?? "",
    system_prompt: raw.system_prompt ?? "",
  };
}

export type CerebroState = ReturnType<typeof useCerebro>;
