import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// onboarding_progress / companies / agent_config / credentials are created by
// migrations after the base types were generated; cast through `as any` to bypass
// the generated typed surface until regen.
const sb = () => supabase as any;
const onboardingTable = () => sb().from("onboarding_progress");

export interface OnboardingDraft {
  validations?: Record<string, boolean>;   // serviços já testados com sucesso
  skipped?: Record<string, boolean>;       // etapas puladas (github, vps)
  [key: string]: unknown;
}

// Snapshot dos dados já persistidos, usado para reidratar o formulário ao retomar.
export interface OnboardingSnapshot {
  companyName: string;
  config: Record<string, any> | null;       // linha de agent_config
  credsPresent: string[];                    // serviços já no Vault (mostra "salvo ✓")
}

export function useOnboarding() {
  const { user } = useAuth();
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot>({ companyName: "", config: null, credsPresent: [] });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setIsCompleted(null); setCompletedSteps([]); setCurrentStep(1);
      setCompanyId(null); setDraft({}); setSnapshot({ companyName: "", config: null, credsPresent: [] });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    let row = (await onboardingTable()
      .select("user_id, completed_steps, is_completed, current_step, draft, company_id")
      .eq("user_id", user.id)
      .maybeSingle()).data;

    if (!row) {
      row = (await onboardingTable()
        .insert({ user_id: user.id, completed_steps: [], is_completed: false, current_step: 1, draft: {} })
        .select("user_id, completed_steps, is_completed, current_step, draft, company_id")
        .maybeSingle()).data;
    }

    setIsCompleted(row?.is_completed ?? false);
    setCompletedSteps(row?.completed_steps ?? []);
    setCurrentStep(row?.current_step ?? 1);
    setDraft((row?.draft as OnboardingDraft) ?? {});

    // Empresa: a linkada no progresso, senão a do owner (compat com onboardings antigos).
    let cid: string | null = row?.company_id ?? null;
    if (!cid) {
      const { data: company } = await sb().from("companies").select("id").eq("owner_id", user.id).maybeSingle();
      cid = company?.id ?? null;
    }
    setCompanyId(cid);

    if (cid) {
      const [{ data: company }, { data: cfg }, { data: creds }] = await Promise.all([
        sb().from("companies").select("name").eq("id", cid).maybeSingle(),
        sb().from("agent_config").select("*").eq("company_id", cid).maybeSingle(),
        sb().from("credentials").select("service").eq("company_id", cid),
      ]);
      setSnapshot({
        companyName: company?.name ?? "",
        config: cfg ?? null,
        credsPresent: ((creds ?? []) as { service: string }[]).map((c) => c.service),
      });
    } else {
      setSnapshot({ companyName: "", config: null, credsPresent: [] });
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ---- Materialização (etapa 1) ----
  const ensureCompany = useCallback(async (name: string, timezone: string): Promise<string | null> => {
    if (!user) return null;
    let cid = companyId;

    if (!cid) {
      const { data: existing } = await sb().from("companies").select("id").eq("owner_id", user.id).maybeSingle();
      cid = existing?.id ?? null;
    }
    if (!cid) {
      const { data: ins, error } = await sb().from("companies")
        .insert({ name, owner_id: user.id }).select("id").single();
      if (error || !ins) return null;
      cid = ins.id;
    } else {
      await sb().from("companies").update({ name }).eq("id", cid);
    }

    // agent_config: cria se não existir; nunca sobrescreve is_active de uma config existente.
    const { data: existingCfg } = await sb().from("agent_config").select("company_id").eq("company_id", cid).maybeSingle();
    if (!existingCfg) {
      await sb().from("agent_config").insert({ company_id: cid, timezone, is_active: false });
    } else {
      await sb().from("agent_config").update({ timezone }).eq("company_id", cid);
    }

    await onboardingTable().upsert(
      { user_id: user.id, company_id: cid, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setCompanyId(cid);
    setSnapshot((s) => ({ ...s, companyName: name }));
    return cid;
  }, [user, companyId]);

  // ---- Persistência incremental ----
  const patchConfig = useCallback(async (patch: Record<string, unknown>) => {
    if (!companyId) return;
    await sb().from("agent_config").update(patch).eq("company_id", companyId);
    setSnapshot((s) => ({ ...s, config: { ...(s.config ?? {}), ...patch } }));
  }, [companyId]);

  const patchCompanyName = useCallback(async (name: string) => {
    if (!companyId) return;
    await sb().from("companies").update({ name }).eq("id", companyId);
    setSnapshot((s) => ({ ...s, companyName: name }));
  }, [companyId]);

  const storeSecret = useCallback(async (service: string, value: string): Promise<boolean> => {
    if (!companyId || !value) return false;
    const { error } = await sb().rpc("store_credential", {
      p_company_id: companyId, p_service: service, p_value: value,
    });
    if (error) return false;
    setSnapshot((s) => ({ ...s, credsPresent: Array.from(new Set([...s.credsPresent, service])) }));
    return true;
  }, [companyId]);

  // ---- Progresso ----
  const persistProgress = useCallback(async (patch: Record<string, unknown>) => {
    if (!user) return;
    await onboardingTable().upsert(
      { user_id: user.id, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "user_id" },
    );
  }, [user]);

  const setStep = useCallback(async (step: number) => {
    setCurrentStep(step);
    await persistProgress({ current_step: step });
  }, [persistProgress]);

  const mergeDraft = useCallback(async (patch: OnboardingDraft) => {
    const next = { ...draft, ...patch,
      validations: { ...(draft.validations ?? {}), ...(patch.validations ?? {}) },
      skipped: { ...(draft.skipped ?? {}), ...(patch.skipped ?? {}) },
    };
    setDraft(next);
    await persistProgress({ draft: next });
  }, [draft, persistProgress]);

  const markStepComplete = useCallback(async (stepId: string) => {
    if (!user) return;
    const next = Array.from(new Set([...completedSteps, stepId]));
    setCompletedSteps(next);
    await persistProgress({ completed_steps: next });
  }, [user, completedSteps, persistProgress]);

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    setIsCompleted(true);
    await persistProgress({ is_completed: true });
  }, [user, persistProgress]);

  const resetOnboarding = useCallback(async () => {
    if (!user) return;
    setIsCompleted(false); setCompletedSteps([]); setCurrentStep(1); setDraft({});
    await persistProgress({ is_completed: false, completed_steps: [], current_step: 1, draft: {} });
  }, [user, persistProgress]);

  return {
    // estado
    isCompleted: !!isCompleted,
    completedSteps,
    currentStep,
    companyId,
    draft,
    snapshot,
    isLoading,
    // ações
    ensureCompany,
    patchConfig,
    patchCompanyName,
    storeSecret,
    setStep,
    mergeDraft,
    markStepComplete,
    completeOnboarding,
    resetOnboarding,
    reload: load,
  };
}
