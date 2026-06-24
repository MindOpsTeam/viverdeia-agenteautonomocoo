import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PermissionKey = "can_command" | "receives_notifications" | "authorizes_approvals" | "readonly";
export type PurposeKey = "receive_commands" | "send_reports" | "alerts" | "notifications";

export interface TeamMember {
  id: string;
  company_id: string;
  name: string;
  handle: string;
  channel: "discord" | "slack";
  role: string | null;
  permissions: PermissionKey[];
}

export interface Channel {
  id: string;
  company_id: string;
  name: string;
  platform: "discord" | "slack";
  purposes: PurposeKey[];
  mention_member_ids: string[];
}

export const PERMISSIONS: { key: PermissionKey; label: string; badge: string }[] = [
  { key: "can_command", label: "Pode dar ordens", badge: "bg-blue-600 hover:bg-blue-600" },
  { key: "receives_notifications", label: "Recebe notificações", badge: "bg-emerald-600 hover:bg-emerald-600" },
  { key: "authorizes_approvals", label: "Autoriza aprovações", badge: "bg-amber-500 hover:bg-amber-500" },
  { key: "readonly", label: "Somente leitura", badge: "bg-slate-400 hover:bg-slate-400" },
];

export const PURPOSES: { key: PurposeKey; label: string }[] = [
  { key: "receive_commands", label: "Receber comandos" },
  { key: "send_reports", label: "Enviar relatórios" },
  { key: "alerts", label: "Alertas de bloqueio" },
  { key: "notifications", label: "Notificações de conclusão" },
];

// team_members/channels não estão no types.ts gerado → cast (ver useOnboarding).
const sb = () => supabase as any;

export function useTimeCanais() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: company } = await sb().from("companies").select("id").maybeSingle();
    if (!company) {
      setLoading(false);
      return;
    }
    setCompanyId(company.id);
    const [{ data: m }, { data: c }] = await Promise.all([
      sb().from("team_members").select("*").eq("company_id", company.id).order("created_at", { ascending: true }),
      sb().from("channels").select("*").eq("company_id", company.id).order("created_at", { ascending: true }),
    ]);
    setMembers((m ?? []) as TeamMember[]);
    setChannels((c ?? []) as Channel[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveMember = useCallback(
    async (member: Partial<TeamMember> & { id?: string }) => {
      if (!companyId) return;
      if (member.id) {
        const { data, error } = await sb().from("team_members").update({
          name: member.name, handle: member.handle, channel: member.channel,
          role: member.role, permissions: member.permissions ?? [],
        }).eq("id", member.id).select("*").maybeSingle();
        if (error) { toast.error(`Falha: ${error.message}`); return; }
        setMembers((prev) => prev.map((x) => (x.id === member.id ? (data as TeamMember) : x)));
      } else {
        const { data, error } = await sb().from("team_members").insert({
          company_id: companyId,
          name: member.name, handle: member.handle, channel: member.channel ?? "discord",
          role: member.role, permissions: member.permissions ?? [],
        }).select("*").maybeSingle();
        if (error) { toast.error(`Falha: ${error.message}`); return; }
        setMembers((prev) => [...prev, data as TeamMember]);
      }
      toast.success("Membro salvo");
    },
    [companyId],
  );

  const deleteMember = useCallback(async (id: string) => {
    const { error } = await sb().from("team_members").delete().eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setMembers((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const saveChannel = useCallback(
    async (channel: Partial<Channel> & { id?: string }) => {
      if (!companyId) return;
      if (channel.id) {
        const { data, error } = await sb().from("channels").update({
          name: channel.name, platform: channel.platform,
          purposes: channel.purposes ?? [], mention_member_ids: channel.mention_member_ids ?? [],
        }).eq("id", channel.id).select("*").maybeSingle();
        if (error) { toast.error(`Falha: ${error.message}`); return; }
        setChannels((prev) => prev.map((x) => (x.id === channel.id ? (data as Channel) : x)));
      } else {
        const { data, error } = await sb().from("channels").insert({
          company_id: companyId,
          name: channel.name, platform: channel.platform ?? "discord",
          purposes: channel.purposes ?? [], mention_member_ids: channel.mention_member_ids ?? [],
        }).select("*").maybeSingle();
        if (error) { toast.error(`Falha: ${error.message}`); return; }
        setChannels((prev) => [...prev, data as Channel]);
      }
      toast.success("Canal salvo");
    },
    [companyId],
  );

  const deleteChannel = useCallback(async (id: string) => {
    const { error } = await sb().from("channels").delete().eq("id", id);
    if (error) { toast.error(`Falha: ${error.message}`); return; }
    setChannels((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return {
    loading, companyId, members, channels,
    saveMember, deleteMember, saveChannel, deleteChannel,
  };
}

export type TimeCanaisState = ReturnType<typeof useTimeCanais>;
