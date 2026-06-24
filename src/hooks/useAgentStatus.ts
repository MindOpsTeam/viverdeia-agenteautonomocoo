import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";

export type AgentStatus = "online" | "offline" | "pending" | "loading";

export interface AgentStatusInfo {
  status: AgentStatus;
  label: string;
}

const LABELS: Record<Exclude<AgentStatus, "loading">, string> = {
  online: "Agente online · instância ativa",
  offline: "Agente offline",
  pending: "Configuração pendente",
};

/**
 * Fonte única do status do agente exibido na sidebar.
 * - pending: sem empresa OU onboarding incompleto (🟡 "Configuração pendente")
 * - online:  empresa + onboarding ok + agent_config.is_active (🟢)
 * - offline: empresa + onboarding ok mas is_active = false (🔴)
 */
export function useAgentStatus(): AgentStatusInfo {
  const { user } = useAuth();
  const { isCompleted, isLoading: onboardingLoading } = useOnboarding();
  const [hasCompany, setHasCompany] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setHasCompany(false);
      setIsActive(false);
      return;
    }
    (async () => {
      const sb: any = supabase;
      const { data: company } = await sb.from("companies").select("id").maybeSingle();
      if (cancelled) return;
      if (!company) {
        setHasCompany(false);
        setIsActive(false);
        return;
      }
      setHasCompany(true);
      const { data: cfg } = await sb
        .from("agent_config")
        .select("is_active")
        .eq("company_id", company.id)
        .maybeSingle();
      if (cancelled) return;
      setIsActive(!!cfg?.is_active);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (onboardingLoading || hasCompany === null || isActive === null) {
    return { status: "loading", label: "Verificando…" };
  }

  let status: Exclude<AgentStatus, "loading">;
  if (!hasCompany || !isCompleted) status = "pending";
  else if (isActive) status = "online";
  else status = "offline";

  return { status, label: LABELS[status] };
}
