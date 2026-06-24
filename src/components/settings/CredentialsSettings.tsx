import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Service = "anthropic" | "openclaw" | "notion" | "discord";

type ServiceMeta = {
  key: Service;
  label: string;
  placeholder: string;
  extraField?: { key: string; label: string; placeholder: string };
};

const SERVICES: ServiceMeta[] = [
  { key: "anthropic", label: "Anthropic (Claude API)", placeholder: "sk-ant-..." },
  { key: "openclaw", label: "OpenClaw Token", placeholder: "Token do workspace" },
  { key: "notion", label: "Notion (Integração)", placeholder: "secret_..." },
  { key: "discord", label: "Discord Bot Token", placeholder: "Bot token" },
];

export default function CredentialsSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [configured, setConfigured] = useState<Set<Service>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Service | null>(null);
  const [validating, setValidating] = useState<Service | null>(null);
  const [validations, setValidations] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [notionDbId, setNotionDbId] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const { data: company } = await sb.from("companies").select("id").maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const [{ data: creds }, { data: cfg }] = await Promise.all([
        sb.from("credentials").select("service").eq("company_id", company.id),
        sb.from("agent_config")
          .select("openclaw_workspace_url, notion_database_id, discord_channel_id")
          .eq("company_id", company.id).maybeSingle(),
      ]);
      setConfigured(new Set((creds ?? []).map((c: any) => c.service)));
      setOpenclawUrl(cfg?.openclaw_workspace_url ?? "");
      setNotionDbId(cfg?.notion_database_id ?? "");
      setDiscordChannelId(cfg?.discord_channel_id ?? "");
      setLoading(false);
    })();
  }, []);

  const saveCredential = async (svc: Service) => {
    if (!companyId) return;
    const value = values[svc] ?? "";
    if (!value.trim()) { toast.error("Informe um valor"); return; }
    setSaving(svc);
    const { error } = await (supabase as any).rpc("store_credential", {
      p_company_id: companyId,
      p_service: svc,
      p_value: value,
    });
    setSaving(null);
    if (error) { toast.error(`Falha ao salvar: ${error.message}`); return; }
    setConfigured((s) => new Set([...s, svc]));
    setValues((v) => ({ ...v, [svc]: "" }));
    toast.success(`${svc} atualizado`);
  };

  const validateCredential = async (svc: Service) => {
    if (!companyId) return;
    const value = values[svc] ?? "";
    if (!value.trim()) { toast.error("Cole o valor antes de validar"); return; }
    setValidating(svc);
    const checks: any[] = [];
    if (svc === "anthropic") checks.push({ service: "anthropic", anthropic_key: value });
    if (svc === "notion") checks.push({ service: "notion", notion_token: value, notion_database_id: notionDbId });
    if (svc === "discord") checks.push({ service: "discord", discord_bot_token: value, discord_channel_id: discordChannelId });
    if (svc === "openclaw") checks.push({ service: "openclaw", openclaw_workspace_url: openclawUrl, openclaw_token: value });
    const { data, error } = await supabase.functions.invoke("validate-credentials", { body: { checks } });
    setValidating(null);
    if (error) { toast.error("Falha na validação"); return; }
    const results = (data as any)?.results ?? {};
    setValidations((v) => ({ ...v, [svc]: results[svc] ?? { ok: false, error: "Sem resposta" } }));
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando credenciais…</div>;
  }

  if (!companyId) {
    return <div className="text-sm text-muted-foreground">Conclua o onboarding antes de gerenciar credenciais.</div>;
  }

  return (
    <div className="space-y-4">
      {SERVICES.map((svc) => {
        const status = validations[svc.key];
        return (
          <Card key={svc.key}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{svc.label}</CardTitle>
                <CardDescription className="text-xs">
                  Armazenado criptografado no Supabase Vault.
                </CardDescription>
              </div>
              <Badge variant={configured.has(svc.key) ? "default" : "secondary"}>
                {configured.has(svc.key) ? "Configurado" : "Vazio"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Nova chave</Label>
                <Input
                  type="password"
                  placeholder={configured.has(svc.key) ? "Substituir chave atual..." : svc.placeholder}
                  value={values[svc.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [svc.key]: e.target.value }))}
                />
              </div>
              {status && (
                <div className={`flex items-center gap-2 text-xs ${status.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {status.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {status.ok ? "Válida" : status.error}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => validateCredential(svc.key)}
                  disabled={validating === svc.key}
                >
                  {validating === svc.key && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Validar
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveCredential(svc.key)}
                  disabled={saving === svc.key}
                >
                  {saving === svc.key && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <GithubVpsSection companyId={companyId} />
    </div>
  );
}

function GithubVpsSection({ companyId }: { companyId: string }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [vpsUrl, setVpsUrl] = useState("");
  const [pat, setPat] = useState("");
  const [vpsToken, setVpsToken] = useState("");
  const [hasGithub, setHasGithub] = useState(false);
  const [hasVps, setHasVps] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [val, setVal] = useState<Record<string, { ok: boolean; error?: string }>>({});

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const [{ data: cfg }, { data: creds }] = await Promise.all([
        sb.from("agent_config").select("github_repo_url, vps_url").eq("company_id", companyId).maybeSingle(),
        sb.from("credentials").select("service").eq("company_id", companyId),
      ]);
      setRepoUrl(cfg?.github_repo_url ?? "");
      setVpsUrl(cfg?.vps_url ?? "");
      const set = new Set((creds ?? []).map((c: any) => c.service));
      setHasGithub(set.has("github"));
      setHasVps(set.has("vps"));
    })();
  }, [companyId]);

  const saveGithub = async () => {
    setBusy("save-github");
    await (supabase as any).from("agent_config").update({ github_repo_url: repoUrl }).eq("company_id", companyId);
    if (pat.trim()) {
      const { error } = await (supabase as any).rpc("store_credential", { p_company_id: companyId, p_service: "github", p_value: pat });
      if (error) { toast.error(`Falha: ${error.message}`); setBusy(null); return; }
      setHasGithub(true); setPat("");
    }
    setBusy(null);
    toast.success("GitHub salvo");
  };
  const testGithub = async () => {
    setBusy("test-github");
    const { data } = await supabase.functions.invoke("validate-credentials", { body: { checks: [{ service: "github", github_pat: pat, github_repo_url: repoUrl }] } });
    setBusy(null);
    setVal((v) => ({ ...v, github: (data as any)?.results?.github ?? { ok: false, error: "Sem resposta" } }));
  };

  const saveVps = async () => {
    setBusy("save-vps");
    await (supabase as any).from("agent_config").update({ vps_url: vpsUrl }).eq("company_id", companyId);
    if (vpsToken.trim()) {
      const { error } = await (supabase as any).rpc("store_credential", { p_company_id: companyId, p_service: "vps", p_value: vpsToken });
      if (error) { toast.error(`Falha: ${error.message}`); setBusy(null); return; }
      setHasVps(true); setVpsToken("");
    }
    setBusy(null);
    toast.success("VPS salva");
  };
  const testVps = async () => {
    setBusy("test-vps");
    const { data } = await supabase.functions.invoke("validate-credentials", { body: { checks: [{ service: "vps", vps_url: vpsUrl, vps_token: vpsToken }] } });
    setBusy(null);
    setVal((v) => ({ ...v, vps: (data as any)?.results?.vps ?? { ok: false, error: "Sem resposta" } }));
  };

  const StatusLine = ({ s }: { s?: { ok: boolean; error?: string } }) => s ? (
    <div className={`flex items-center gap-2 text-xs ${s.ok ? "text-emerald-600" : "text-destructive"}`}>
      {s.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{s.ok ? "Conexão OK" : s.error}
    </div>
  ) : null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">GitHub (repositório de skills)</CardTitle>
            <CardDescription className="text-xs">Repo privado do cliente onde o Atlas commita os arquivos de skill. PAT no Vault.</CardDescription>
          </div>
          <Badge variant={hasGithub ? "default" : "secondary"}>{hasGithub ? "Configurado" : "Vazio"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label className="text-xs">URL do repositório</Label>
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/cliente/atlas-skills" /></div>
          <div className="space-y-2"><Label className="text-xs">Personal Access Token (PAT)</Label>
            <Input type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder={hasGithub ? "Substituir PAT atual..." : "ghp_..."} /></div>
          <StatusLine s={val.github} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={testGithub} disabled={busy === "test-github"}>{busy === "test-github" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar conexão</Button>
            <Button size="sm" onClick={saveGithub} disabled={busy === "save-github"}>{busy === "save-github" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Salvar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">VPS Hostinger (instância OpenClaw)</CardTitle>
            <CardDescription className="text-xs">URL da instância que puxa o repo e executa. Token no Vault.</CardDescription>
          </div>
          <Badge variant={hasVps ? "default" : "secondary"}>{hasVps ? "Configurado" : "Vazio"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label className="text-xs">URL da instância</Label>
            <Input value={vpsUrl} onChange={(e) => setVpsUrl(e.target.value)} placeholder="https://atlas.cliente.com" /></div>
          <div className="space-y-2"><Label className="text-xs">Token OpenClaw</Label>
            <Input type="password" value={vpsToken} onChange={(e) => setVpsToken(e.target.value)} placeholder={hasVps ? "Substituir token atual..." : "Token"} /></div>
          <StatusLine s={val.vps} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={testVps} disabled={busy === "test-vps"}>{busy === "test-vps" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Testar conexão</Button>
            <Button size="sm" onClick={saveVps} disabled={busy === "save-vps"}>{busy === "save-vps" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Salvar</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
