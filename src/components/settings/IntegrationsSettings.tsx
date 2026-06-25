// v2 - auto-detect atlas_instances
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle2, ChevronDown, Copy, ExternalLink, HelpCircle, Loader2, Plug, Plus, Trash2, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = () => supabase as any;
const DISCORD_INTERACTIONS_URL = "https://pmrzuqocgefrlookjnxh.supabase.co/functions/v1/discord-webhook";

type Svc = "anthropic" | "notion" | "discord" | "github" | "openclaw";
type NotionType = "backlog" | "knowledge" | "ignore";
type NotionDb = { database_id: string; name: string; type: NotionType };
type Val = { ok: boolean; error?: string };

const TUTORIALS: Record<Svc, { steps: React.ReactNode[]; link?: { href: string; label: string } }> = {
  anthropic: {
    steps: [
      "Acesse console.anthropic.com e faça login (ou crie a conta).",
      "Menu lateral → API Keys → Create Key. Dê um nome (ex.: Atlas) e confirme.",
      "Garanta créditos/billing em Plans & Billing.",
      "Copie a chave (sk-ant-…), cole acima e salve. Aparece só uma vez.",
    ],
    link: { href: "https://console.anthropic.com/settings/keys", label: "Abrir Anthropic Console" },
  },
  notion: {
    steps: [
      "Abra notion.so/profile/integrations → New integration. Nomeie (ex.: Atlas) e salve.",
      "Copie o Internal Integration Secret (secret_… ou ntn_…) e cole acima.",
      "Em cada database: \"…\" → Connections → adicione a integração Atlas.",
      "Clique \"Conectar ao Notion\" para listar os databases e definir o tipo de cada um.",
    ],
    link: { href: "https://www.notion.so/profile/integrations", label: "Abrir integrações do Notion" },
  },
  discord: {
    steps: [
      "discord.com/developers/applications → New Application (ex.: Atlas).",
      "Aba Bot → Reset Token → copie o Bot Token (ative Message Content Intent).",
      "Aba General Information → copie a Public Key.",
      "OAuth2 → URL Generator → bot + Manage Channels/Send Messages → convide o bot no servidor.",
      "Ative o Modo Desenvolvedor no Discord → botão direito no servidor → Copiar ID (Server ID).",
    ],
    link: { href: "https://discord.com/developers/applications", label: "Abrir Discord Developer Portal" },
  },
  github: {
    steps: [
      "Crie um repositório PRIVADO em github.com/new (ex.: atlas-skills, inicialize com README).",
      "github.com/settings/tokens → Generate new token → Fine-grained token.",
      "Repository access: Only select repositories → selecione o repo. Permissions: Contents = Read and write.",
      "Generate token, copie (github_pat_…) e cole acima com a URL do repo.",
    ],
    link: { href: "https://github.com/settings/tokens", label: "Criar token no GitHub" },
  },
  openclaw: {
    steps: [
      "Acesse sua VPS via SSH: ssh root@IP-DA-VPS (terminal ou PuTTY).",
      "Execute o comando de instalação acima e aguarde concluir.",
      "O comando retorna a URL e o token da instância — copie os dois e cole acima.",
    ],
  },
};

function Tutorial({ label, svc }: { label: string; svc: Svc }) {
  const t = TUTORIALS[svc];
  return (
    <Collapsible className="rounded-md border border-border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium hover:bg-muted/50">
        <HelpCircle className="h-3.5 w-3.5" /> {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
        <ol className="list-decimal space-y-1 pl-5">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {t.link && (
          <a href={t.link.href} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> {t.link.label}
          </a>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusBadge({ status }: { status: "active" | "error" | "empty" }) {
  if (status === "active") return <Badge className="bg-success text-white hover:bg-success">✅ Ativo</Badge>;
  if (status === "error") return <Badge variant="destructive">⚠️ Erro</Badge>;
  return <Badge variant="secondary">⚪ Vazio</Badge>;
}

export default function IntegrationsSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<Set<Svc>>(new Set());
  const [validations, setValidations] = useState<Record<string, Val>>({});
  const [expanded, setExpanded] = useState<Set<Svc>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // tokens novos (a salvar) por serviço
  const [token, setToken] = useState<Record<Svc, string>>({ anthropic: "", notion: "", discord: "", github: "", openclaw: "" });
  // campos não-secretos (agent_config)
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [discordServerId, setDiscordServerId] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [discordPublicKey, setDiscordPublicKey] = useState("");
  const [notionDbs, setNotionDbs] = useState<NotionDb[]>([]);
  const [addDbId, setAddDbId] = useState("");
  const [installCmd, setInstallCmd] = useState<string | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [instance, setInstance] = useState<{ ingress_url: string | null; hooks_token: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: company } = await sb().from("companies").select("id").maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const [{ data: creds }, { data: cfg }, { data: inst }] = await Promise.all([
        sb().from("credentials").select("service").eq("company_id", company.id),
        sb().from("agent_config")
          .select("openclaw_workspace_url, github_repo_url, discord_server_id, discord_channel_id, discord_public_key, notion_database_ids")
          .eq("company_id", company.id).maybeSingle(),
        // Instância registrada pelo instance-register na VPS (RLS: owner lê só a própria).
        sb().from("atlas_instances").select("ingress_url, hooks_token").maybeSingle(),
      ]);
      setConfigured(new Set((creds ?? []).map((c: any) => c.service)));
      setInstance(inst ?? null);
      // Se a instância já foi registrada, preenche URL/token automaticamente e marca como Ativo.
      setOpenclawUrl(inst?.ingress_url || (cfg?.openclaw_workspace_url ?? ""));
      if (inst?.hooks_token) setToken((t) => ({ ...t, openclaw: inst.hooks_token as string }));
      setGithubRepoUrl(cfg?.github_repo_url ?? "");
      setDiscordServerId(cfg?.discord_server_id ?? "");
      setDiscordChannelId(cfg?.discord_channel_id ?? "");
      setDiscordPublicKey(cfg?.discord_public_key ?? "");
      setNotionDbs(Array.isArray(cfg?.notion_database_ids) ? cfg.notion_database_ids : []);
      setLoading(false);
    })();
  }, []);

  const toggle = (svc: Svc) => setExpanded((s) => { const n = new Set(s); n.has(svc) ? n.delete(svc) : n.add(svc); return n; });
  // Ao abrir o card VPS+OpenClaw, já gera o comando de instalação (token one-time).
  const onAction = (svc: Svc) => {
    const willOpen = !expanded.has(svc);
    toggle(svc);
    if (svc === "openclaw" && willOpen && !installCmd) void generateInstall();
  };
  const setTok = (svc: Svc, v: string) => setToken((t) => ({ ...t, [svc]: v }));
  const patchConfig = (patch: Record<string, unknown>) => companyId && sb().from("agent_config").update(patch).eq("company_id", companyId);

  const storeCred = async (svc: Svc, value: string): Promise<boolean> => {
    if (!companyId || !value.trim()) return false;
    const { error } = await sb().rpc("store_credential", { p_company_id: companyId, p_service: svc, p_value: value });
    if (error) { toast.error(`Falha ao salvar: ${error.message}`); return false; }
    setConfigured((s) => new Set([...s, svc]));
    setTok(svc, "");
    return true;
  };

  // Testa o serviço; usa o token redigitado ou lê o salvo no Vault.
  const test = async (svc: Svc) => {
    if (!companyId) return;
    setBusy(`test-${svc}`);
    try {
      let tk = token[svc].trim();
      if (!tk && configured.has(svc)) {
        const { data } = await sb().rpc("read_credential", { p_company_id: companyId, p_service: svc });
        tk = (data as string) ?? "";
      }
      const checks: any[] = [];
      if (svc === "anthropic") checks.push({ service: "anthropic", anthropic_key: tk });
      if (svc === "notion") checks.push({ service: "notion", notion_token: tk, notion_database_id: (notionDbs.find((d) => d.type === "backlog") ?? notionDbs[0])?.database_id ?? "" });
      if (svc === "discord") checks.push({ service: "discord", discord_bot_token: tk, discord_channel_id: discordChannelId });
      if (svc === "github") checks.push({ service: "github", github_pat: tk, github_repo_url: githubRepoUrl });
      if (svc === "openclaw") checks.push({ service: "openclaw", openclaw_workspace_url: openclawUrl, openclaw_token: tk });
      const { data, error } = await supabase.functions.invoke("validate-credentials", { body: { checks } });
      if (error) { toast.error("Falha na validação"); return; }
      const r = (data as any)?.results?.[svc] ?? { ok: false, error: "Sem resposta" };
      setValidations((v) => ({ ...v, [svc]: r }));
      toast[r.ok ? "success" : "error"](r.ok ? "Conexão OK" : (r.error ?? "Falha"));
    } catch (e: any) { toast.error(e?.message ?? "Erro ao testar"); }
    finally { setBusy(null); }
  };

  const connectNotion = async () => {
    if (!companyId) return;
    setBusy("connect-notion");
    try {
      let tk = token.notion.trim();
      if (!tk && configured.has("notion")) {
        const { data } = await sb().rpc("read_credential", { p_company_id: companyId, p_service: "notion" });
        tk = (data as string) ?? "";
      }
      if (!tk) { toast.error("Informe o token do Notion (ou salve-o primeiro)."); return; }
      const { data, error } = await supabase.functions.invoke("setup-notion-database", { body: { action: "list", notion_token: tk } });
      if (error || !(data as any)?.ok) { toast.error((data as any)?.error ?? "Falha ao conectar no Notion"); return; }
      const existing = new Map(notionDbs.map((d) => [d.database_id, d.type]));
      const fromApi: NotionDb[] = ((data as any).databases ?? []).map((d: any) => ({ database_id: d.database_id, name: d.name, type: (existing.get(d.database_id) as NotionType) ?? "ignore" }));
      const extra = notionDbs.filter((d) => !fromApi.some((x) => x.database_id === d.database_id));
      setNotionDbs([...fromApi, ...extra]);
      toast.success(`${fromApi.length} database(s) encontrados.`);
    } catch (e: any) { toast.error(e?.message ?? "Erro no Notion"); }
    finally { setBusy(null); }
  };

  const saveNotion = async () => {
    setBusy("save-notion");
    if (token.notion.trim()) await storeCred("notion", token.notion);
    const backlogFirst = notionDbs.find((d) => d.type === "backlog") ?? notionDbs.find((d) => d.type !== "ignore");
    await patchConfig({ notion_database_ids: notionDbs, notion_database_id: backlogFirst?.database_id ?? null });
    setBusy(null);
    toast.success("Notion salvo");
  };

  const saveDiscord = async () => {
    setBusy("save-discord");
    if (token.discord.trim()) await storeCred("discord", token.discord);
    await patchConfig({ discord_server_id: discordServerId, discord_channel_id: discordChannelId, discord_public_key: discordPublicKey || null });
    setBusy(null);
    toast.success("Discord salvo");
  };

  const saveGithub = async () => {
    setBusy("save-github");
    if (token.github.trim()) await storeCred("github", token.github);
    await patchConfig({ github_repo_url: githubRepoUrl });
    setBusy(null);
    toast.success("GitHub salvo");
  };

  const saveOpenclaw = async () => {
    setBusy("save-openclaw");
    if (token.openclaw.trim()) await storeCred("openclaw", token.openclaw);
    await patchConfig({ openclaw_workspace_url: openclawUrl, vps_url: openclawUrl });
    setBusy(null);
    toast.success("OpenClaw salvo");
  };

  const statusOf = (svc: Svc, ready: boolean): "active" | "error" | "empty" => {
    if (validations[svc]?.ok === false) return "error";
    if (svc === "openclaw" && instance) return "active";
    if (configured.has(svc) && ready) return "active";
    if (configured.has(svc)) return "active";
    return "empty";
  };

  // Gera um comando de instalação único via onboarding-issue-token (POST com o JWT do usuário).
  const generateInstall = async () => {
    setInstallBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-issue-token", { body: {} });
      if (error) { toast.error("Falha ao gerar o comando de instalação"); return; }
      const cmd = (data as any)?.install_command;
      if (!cmd) { toast.error((data as any)?.error ?? "Resposta inválida do servidor"); return; }
      setInstallCmd(cmd);
      toast.success("Comando gerado — copie e cole na sua VPS.");
    } catch (e: any) { toast.error(e?.message ?? "Erro ao gerar o comando"); }
    finally { setInstallBusy(false); }
  };
  const copyInstall = async () => {
    if (!installCmd) return;
    try { await navigator.clipboard.writeText(installCmd); toast.success("Comando copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!companyId) return <div className="text-sm text-muted-foreground">Conclua o onboarding primeiro.</div>;

  // Funções (não componentes) para não remontar os inputs a cada render (preserva o foco).
  const tokenField = (svc: Svc, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{configured.has(svc) ? "Trocar chave" : "Chave / token"}</Label>
      <Input type="password" value={token[svc]} onChange={(e) => setTok(svc, e.target.value)}
        placeholder={configured.has(svc) ? "•••••• (salvo) — cole para substituir" : placeholder} />
    </div>
  );
  const valLine = (svc: Svc) => {
    const s = validations[svc];
    return s ? (
      <div className={`flex items-center gap-2 text-xs ${s.ok ? "text-success" : "text-destructive"}`}>
        {s.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{s.ok ? "Conexão OK" : s.error}
      </div>
    ) : null;
  };

  const notionActive = configured.has("notion");
  const discordReady = configured.has("discord") && !!discordChannelId;
  const openclawReady = !!instance || (configured.has("openclaw") && !!openclawUrl.trim());

  const cards: { svc: Svc; icon: string; title: string; desc: string; summary: string; action: string; ready: boolean }[] = [
    { svc: "anthropic", icon: "🔮", title: "Anthropic", desc: "Motor de IA do Atlas", summary: configured.has("anthropic") ? "API Key configurada" : "Sem chave", action: configured.has("anthropic") ? "Trocar" : "Configurar", ready: true },
    { svc: "notion", icon: "📓", title: "Notion", desc: "Backlog e base de conhecimento", summary: notionDbs.length ? `${notionDbs.filter((d) => d.type !== "ignore").length} database(s) monitorado(s)` : "Sem databases", action: "Gerenciar", ready: notionActive },
    { svc: "discord", icon: "🎮", title: "Discord", desc: "Canal de comandos e relatórios", summary: discordServerId ? `Servidor: ${discordServerId}` : "Sem servidor", action: "Configurar", ready: discordReady },
    { svc: "github", icon: "🐙", title: "GitHub", desc: "Versionamento de skills", summary: githubRepoUrl || "Não configurado", action: "Configurar", ready: configured.has("github") },
    { svc: "openclaw", icon: "🖥️", title: "VPS + OpenClaw", desc: "Execução de rotinas no browser", summary: openclawUrl || "Não instalado", action: configured.has("openclaw") ? "Configurar" : "Instalar e configurar", ready: openclawReady },
  ];

  return (
    <div className="space-y-3">
      {cards.map((c) => {
        const open = expanded.has(c.svc);
        return (
          <Card key={c.svc}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{c.title}</span>
                    <StatusBadge status={statusOf(c.svc, c.ready)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{c.desc} · <span className="text-foreground/70">{c.summary}</span></p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onAction(c.svc)}>
                  {c.action} <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {open && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  {/* Anthropic */}
                  {c.svc === "anthropic" && (
                    <>
                      {tokenField("anthropic", "sk-ant-...")}
                      {valLine("anthropic")}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => test("anthropic")} disabled={busy === "test-anthropic"}>{busy === "test-anthropic" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar</Button>
                        <Button size="sm" onClick={() => storeCred("anthropic", token.anthropic).then((ok) => ok && toast.success("Anthropic salvo"))} disabled={!token.anthropic.trim()}>Salvar</Button>
                      </div>
                    </>
                  )}

                  {/* Notion */}
                  {c.svc === "notion" && (
                    <>
                      {tokenField("notion", "secret_... ou ntn_...")}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={connectNotion} disabled={busy === "connect-notion"}>{busy === "connect-notion" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plug className="h-3 w-3 mr-1" />}Conectar ao Notion</Button>
                        <Button variant="outline" size="sm" onClick={() => test("notion")} disabled={busy === "test-notion"}>{busy === "test-notion" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar</Button>
                      </div>
                      {notionDbs.length > 0 && (
                        <div className="rounded-lg border divide-y">
                          {notionDbs.map((db) => (
                            <div key={db.database_id} className="flex items-center justify-between gap-2 px-3 py-2">
                              <span className="text-sm truncate">{db.name}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Select value={db.type} onValueChange={(v) => setNotionDbs((arr) => arr.map((d) => d.database_id === db.database_id ? { ...d, type: v as NotionType } : d))}>
                                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="backlog">Backlog</SelectItem>
                                    <SelectItem value="knowledge">Conhecimento</SelectItem>
                                    <SelectItem value="ignore">Ignorar</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setNotionDbs((arr) => arr.filter((d) => d.database_id !== db.database_id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input value={addDbId} onChange={(e) => setAddDbId(e.target.value)} placeholder="Adicionar Database ID manualmente" className="h-8" />
                        <Button size="sm" variant="outline" onClick={() => { const id = addDbId.trim(); if (!id || notionDbs.some((d) => d.database_id === id)) return; setNotionDbs((a) => [...a, { database_id: id, name: id, type: "backlog" }]); setAddDbId(""); }}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                      {valLine("notion")}
                      <div className="flex justify-end"><Button size="sm" onClick={saveNotion} disabled={busy === "save-notion"}>{busy === "save-notion" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Salvar</Button></div>
                    </>
                  )}

                  {/* Discord */}
                  {c.svc === "discord" && (
                    <>
                      {tokenField("discord", "Bot token")}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label className="text-xs">Server (Guild) ID</Label><Input value={discordServerId} onChange={(e) => setDiscordServerId(e.target.value)} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Channel ID</Label><Input value={discordChannelId} onChange={(e) => setDiscordChannelId(e.target.value)} /></div>
                      </div>
                      <div className="space-y-1.5"><Label className="text-xs">Public Key</Label><Input value={discordPublicKey} onChange={(e) => setDiscordPublicKey(e.target.value)} placeholder="para o Interactions Endpoint" /></div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Interactions Endpoint URL</Label>
                        <div className="flex gap-2">
                          <Input readOnly value={DISCORD_INTERACTIONS_URL} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                          <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(DISCORD_INTERACTIONS_URL).then(() => toast.success("URL copiada"))}><Copy className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      {valLine("discord")}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => test("discord")} disabled={busy === "test-discord"}>{busy === "test-discord" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar</Button>
                        <Button size="sm" onClick={saveDiscord} disabled={busy === "save-discord"}>{busy === "save-discord" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Salvar</Button>
                      </div>
                    </>
                  )}

                  {/* GitHub */}
                  {c.svc === "github" && (
                    <>
                      <div className="space-y-1.5"><Label className="text-xs">URL do repositório</Label><Input value={githubRepoUrl} onChange={(e) => setGithubRepoUrl(e.target.value)} placeholder="https://github.com/empresa/atlas-skills" /></div>
                      {tokenField("github", "github_pat_...")}
                      {valLine("github")}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => test("github")} disabled={busy === "test-github"}>{busy === "test-github" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar</Button>
                        <Button size="sm" onClick={saveGithub} disabled={busy === "save-github"}>{busy === "save-github" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Salvar</Button>
                      </div>
                    </>
                  )}

                  {/* VPS + OpenClaw */}
                  {c.svc === "openclaw" && (
                    <>
                      {!openclawReady && (
                        <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-xs text-muted-foreground">
                          <p>Para usar o OpenClaw, instale na sua VPS. Gere um comando único e cole-o na VPS via SSH:</p>
                          {installCmd ? (
                            <>
                              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                                <code className="flex-1 font-mono text-foreground break-all">{installCmd}</code>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={copyInstall}><Copy className="h-3.5 w-3.5" /></Button>
                              </div>
                              <p>Token de uso único (expira em ~30 min). Após instalar, cole a URL e o token abaixo.</p>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={generateInstall} disabled={installBusy}>
                              {installBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                              Gerar comando de instalação
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="space-y-1.5"><Label className="text-xs">URL da instância</Label><Input value={openclawUrl} onChange={(e) => setOpenclawUrl(e.target.value)} placeholder="https://workspace.openclaw.com" /></div>
                      {tokenField("openclaw", "Token do OpenClaw")}
                      {valLine("openclaw")}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => test("openclaw")} disabled={busy === "test-openclaw"}>{busy === "test-openclaw" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar</Button>
                        <Button size="sm" onClick={saveOpenclaw} disabled={busy === "save-openclaw"}>{busy === "save-openclaw" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Salvar</Button>
                      </div>
                    </>
                  )}

                  <Tutorial svc={c.svc} label={c.svc === "openclaw" ? "Como instalar" : c.svc === "anthropic" ? "Como obter" : "Como configurar"} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
