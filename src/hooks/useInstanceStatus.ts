import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const sb = () => supabase as any;
const ONLINE_WINDOW_MS = 10 * 60 * 1000; // online se last_seen < 10min

export interface InstanceStatus {
  loading: boolean;
  online: boolean;
  lastSeen: string | null;
}

// Liveness da instância OpenClaw (VPS) a partir de atlas_instances.last_seen.
// Diferente de useAgentStatus (sidebar, baseado em is_active/onboarding).
export function useInstanceStatus(): InstanceStatus {
  const [status, setStatus] = useState<InstanceStatus>({ loading: true, online: false, lastSeen: null });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await sb().from("atlas_instances").select("last_seen").maybeSingle();
      if (cancelled) return;
      const lastSeen = (data?.last_seen as string) ?? null;
      const online = !!lastSeen && (Date.now() - new Date(lastSeen).getTime()) < ONLINE_WINDOW_MS;
      setStatus({ loading: false, online, lastSeen });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return status;
}
