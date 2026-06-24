import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type IntegrationsForm = {
  openclaw_workspace_url: string;
  notion_database_id: string;
  discord_server_id: string;
  discord_channel_id: string;
  discord_public_key: string;
};

const empty: IntegrationsForm = {
  openclaw_workspace_url: "",
  notion_database_id: "",
  discord_server_id: "",
  discord_channel_id: "",
  discord_public_key: "",
};

export default function IntegrationsSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState<IntegrationsForm>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const { data: company } = await sb.from("companies").select("id").maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const { data: cfg } = await sb.from("agent_config")
        .select("openclaw_workspace_url, notion_database_id, discord_server_id, discord_channel_id, discord_public_key")
        .eq("company_id", company.id).maybeSingle();
      if (cfg) setForm({
        openclaw_workspace_url: cfg.openclaw_workspace_url ?? "",
        notion_database_id: cfg.notion_database_id ?? "",
        discord_server_id: cfg.discord_server_id ?? "",
        discord_channel_id: cfg.discord_channel_id ?? "",
        discord_public_key: cfg.discord_public_key ?? "",
      });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("agent_config")
      .update(form)
      .eq("company_id", companyId);
    setSaving(false);
    if (error) { toast.error(`Falha ao salvar: ${error.message}`); return; }
    toast.success("Integrações atualizadas");
  };

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!companyId) return <div className="text-sm text-muted-foreground">Conclua o onboarding primeiro.</div>;

  const update = <K extends keyof IntegrationsForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">OpenClaw</CardTitle>
          <CardDescription>Workspace onde o agente executa.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Workspace URL</Label>
          <Input value={form.openclaw_workspace_url} onChange={update("openclaw_workspace_url")} placeholder="https://workspace.openclaw.com" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notion</CardTitle>
          <CardDescription>Database de tarefas. Apenas IDs — token fica em Credenciais.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Database ID</Label>
          <Input value={form.notion_database_id} onChange={update("notion_database_id")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discord</CardTitle>
          <CardDescription>
            Server, canal e a chave pública usada para verificar interações dos slash commands.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Server ID</Label>
            <Input value={form.discord_server_id} onChange={update("discord_server_id")} />
          </div>
          <div className="space-y-2">
            <Label>Channel ID</Label>
            <Input value={form.discord_channel_id} onChange={update("discord_channel_id")} />
          </div>
          <div className="space-y-2">
            <Label>Public Key (verificação de interações)</Label>
            <Input value={form.discord_public_key} onChange={update("discord_public_key")} placeholder="hex da public key do app Discord" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar integrações
        </Button>
      </div>
    </div>
  );
}
