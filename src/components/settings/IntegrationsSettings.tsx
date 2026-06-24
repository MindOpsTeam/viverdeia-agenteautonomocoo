import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Loader2, Plug, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = () => supabase as any;

const DISCORD_INTERACTIONS_URL = "https://pmrzuqocgefrlookjnxh.supabase.co/functions/v1/discord-webhook";

type NotionType = "backlog" | "knowledge" | "ignore";
type NotionDb = { database_id: string; name: string; type: NotionType };

type IntegrationsForm = {
  openclaw_workspace_url: string;
  discord_server_id: string;
  discord_channel_id: string;
  discord_public_key: string;
};

const empty: IntegrationsForm = {
  openclaw_workspace_url: "",
  discord_server_id: "",
  discord_channel_id: "",
  discord_public_key: "",
};

export default function IntegrationsSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState<IntegrationsForm>(empty);
  const [notionDbs, setNotionDbs] = useState<NotionDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<NotionDb>({ database_id: "", name: "", type: "backlog" });

  useEffect(() => {
    (async () => {
      const { data: company } = await sb().from("companies").select("id").maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const { data: cfg } = await sb().from("agent_config")
        .select("openclaw_workspace_url, notion_database_id, notion_database_ids, discord_server_id, discord_channel_id, discord_public_key")
        .eq("company_id", company.id).maybeSingle();
      if (cfg) {
        setForm({
          openclaw_workspace_url: cfg.openclaw_workspace_url ?? "",
          discord_server_id: cfg.discord_server_id ?? "",
          discord_channel_id: cfg.discord_channel_id ?? "",
          discord_public_key: cfg.discord_public_key ?? "",
        });
        const list = Array.isArray(cfg.notion_database_ids) ? (cfg.notion_database_ids as NotionDb[]) : [];
        if (list.length) setNotionDbs(list);
        else if (cfg.notion_database_id) setNotionDbs([{ database_id: cfg.notion_database_id, name: "(database atual)", type: "backlog" }]);
      }
      setLoading(false);
    })();
  }, []);

  const update = <K extends keyof IntegrationsForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const setType = (id: string, type: NotionType) =>
    setNotionDbs((prev) => prev.map((d) => (d.database_id === id ? { ...d, type } : d)));
  const removeDb = (id: string) => setNotionDbs((prev) => prev.filter((d) => d.database_id !== id));

  const addDatabase = () => {
    const id = addForm.database_id.trim();
    if (!id) { toast.error("Informe o Database ID."); return; }
    if (notionDbs.some((d) => d.database_id === id)) { toast.error("Esse database já está na lista."); return; }
    setNotionDbs((prev) => [...prev, { database_id: id, name: addForm.name.trim() || id, type: addForm.type }]);
    setAddForm({ database_id: "", name: "", type: "backlog" });
    setAddOpen(false);
  };

  const connectNotion = async () => {
    if (!companyId) return;
    setConnecting(true);
    try {
      const { data: token } = await sb().rpc("read_credential", { p_company_id: companyId, p_service: "notion" });
      if (!token) { toast.error("Token do Notion não encontrado. Configure-o em Credenciais primeiro."); return; }
      const { data, error } = await supabase.functions.invoke("setup-notion-database", { body: { action: "list", notion_token: token } });
      if (error) { toast.error("Falha ao conectar no Notion (rede)"); return; }
      const res = data as any;
      if (!res?.ok) { toast.error(res?.error ?? "Falha no Notion"); return; }
      const existing = new Map(notionDbs.map((d) => [d.database_id, d]));
      const fromApi: NotionDb[] = (res.databases ?? []).map((d: any) => ({
        database_id: d.database_id, name: d.name,
        type: (existing.get(d.database_id)?.type as NotionType) ?? "ignore",
      }));
      const extra = notionDbs.filter((d) => !fromApi.some((x) => x.database_id === d.database_id));
      setNotionDbs([...fromApi, ...extra]);
      toast.success(`${fromApi.length} database(s) encontrados no Notion.`);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao conectar"); }
    finally { setConnecting(false); }
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    const backlogFirst = notionDbs.find((d) => d.type === "backlog") ?? notionDbs.find((d) => d.type !== "ignore");
    const { error } = await sb().from("agent_config").update({
      ...form,
      notion_database_ids: notionDbs,
      notion_database_id: backlogFirst?.database_id ?? null,
    }).eq("company_id", companyId);
    setSaving(false);
    if (error) { toast.error(`Falha ao salvar: ${error.message}`); return; }
    toast.success("Integrações atualizadas");
  };

  const copyInteractionsUrl = async () => {
    try { await navigator.clipboard.writeText(DISCORD_INTERACTIONS_URL); toast.success("URL copiada"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!companyId) return <div className="text-sm text-muted-foreground">Conclua o onboarding primeiro.</div>;

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
          <CardDescription>Databases que o Atlas monitora. Apenas IDs — o token fica em Credenciais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notionDbs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum database conectado. Conecte ao Notion ou adicione manualmente.</p>
          ) : (
            <div className="rounded-lg border divide-y">
              {notionDbs.map((db) => (
                <div key={db.database_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{db.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{db.database_id}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={db.type} onValueChange={(v) => setType(db.database_id, v as NotionType)}>
                      <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">Backlog</SelectItem>
                        <SelectItem value="knowledge">Conhecimento</SelectItem>
                        <SelectItem value="ignore">Ignorar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeDb(db.database_id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={connectNotion} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plug className="h-4 w-4 mr-1" />}
              Conectar ao Notion
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar database
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discord</CardTitle>
          <CardDescription>Server, canal, chave pública e o endpoint de interações dos slash commands.</CardDescription>
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
          <div className="space-y-2">
            <Label>Interactions Endpoint URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={DISCORD_INTERACTIONS_URL} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" onClick={copyInteractionsUrl}><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure este URL no Discord Developer Portal → seu app → <strong>Interactions Endpoint URL</strong>.
              Salve a Public Key acima antes de configurar (o Discord faz um PING de verificação ao salvar).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar integrações
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar database do Notion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Database ID</Label>
              <Input value={addForm.database_id} onChange={(e) => setAddForm((p) => ({ ...p, database_id: e.target.value }))} placeholder="hash de 32 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome (opcional)</Label>
              <Input value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex.: Backlog de Marketing" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={addForm.type} onValueChange={(v) => setAddForm((p) => ({ ...p, type: v as NotionType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="knowledge">Conhecimento</SelectItem>
                  <SelectItem value="ignore">Ignorar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={addDatabase}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
