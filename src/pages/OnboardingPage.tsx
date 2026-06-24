import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife",
  "America/Belem", "America/Cuiaba", "America/New_York", "Europe/Lisbon", "UTC",
];

const TONE_LABEL: Record<string, string> = {
  direct: "Direto e objetivo", formal: "Formal", informal: "Informal",
};

type StepId = "chaves" | "integracoes" | "identidade" | "instalar" | "ativar";
const STEPS: { id: StepId; label: string }[] = [
  { id: "chaves", label: "Chaves" },
  { id: "integracoes", label: "Integrações" },
  { id: "identidade", label: "Identidade" },
  { id: "instalar", label: "Instalar" },
  { id: "ativar", label: "Ativar" },
];

type FormState = {
  name: string; timezone: string;
  anthropic_key: string;
  notion_token: string; notion_database_id: string;
  discord_bot_token: string; discord_server_id: string; discord_channel_id: string;
  agent_name: string; tone: "direct" | "formal" | "informal"; presentation: string; user_md: string;
  openclaw_workspace_url: string; openclaw_token: string;
};

const initialForm: FormState = {
  name: "", timezone: "America/Sao_Paulo",
  anthropic_key: "",
  notion_token: "", notion_database_id: "",
  discord_bot_token: "", discord_server_id: "", discord_channel_id: "",
  agent_name: "Atlas", tone: "direct", presentation: "", user_md: "",
  openclaw_workspace_url: "", openclaw_token: "",
};

type Validations = Partial<Record<"anthropic" | "openclaw" | "notion" | "discord", { ok: boolean; error?: string }>>;

const sb = () => supabase as any;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isCompleted, isLoading, completeOnboarding, markStepComplete } = useOnboarding();

  const [phase, setPhase] = useState<"intro" | StepId>("intro");
  const [form, setForm] = useState<FormState>(initialForm);
  const [validations, setValidations] = useState<Validations>({});
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isCompleted) navigate("/", { replace: true });
  }, [isLoading, isCompleted, navigate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const onInput = <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as FormState[K]);

  const minFilled = (step: StepId): boolean => {
    switch (step) {
      case "chaves": return !!form.name.trim() && !!form.timezone && form.anthropic_key.trim().length >= 10;
      case "integracoes": return [form.notion_token, form.notion_database_id, form.discord_bot_token, form.discord_server_id, form.discord_channel_id].every((v) => v.trim());
      case "identidade": return !!form.agent_name.trim() && !!form.presentation.trim();
      case "instalar": return /^https?:\/\//.test(form.openclaw_workspace_url.trim()) && !!form.openclaw_token.trim();
      case "ativar": return true;
    }
  };

  const stepIndex = phase === "intro" ? -1 : STEPS.findIndex((s) => s.id === phase);

  const goNext = async () => {
    if (phase === "intro") { setPhase("chaves"); return; }

    if (phase === "chaves") {
      setValidating(true);
      const { data, error } = await supabase.functions.invoke("validate-credentials", {
        body: { checks: [{ service: "anthropic", anthropic_key: form.anthropic_key }] },
      });
      setValidating(false);
      if (error) { toast.error("Falha ao validar"); return; }
      const r = (data as { results: Validations })?.results ?? {};
      setValidations((p) => ({ ...p, ...r }));
      if (!r.anthropic?.ok) { toast.error("Chave da Anthropic inválida"); return; }
      markStepComplete("chaves"); setPhase("integracoes"); return;
    }

    if (phase === "integracoes") {
      setValidating(true);
      const { data, error } = await supabase.functions.invoke("validate-credentials", {
        body: { checks: [
          { service: "notion", notion_token: form.notion_token, notion_database_id: form.notion_database_id },
          { service: "discord", discord_bot_token: form.discord_bot_token, discord_channel_id: form.discord_channel_id },
        ] },
      });
      setValidating(false);
      if (error) { toast.error("Falha ao validar"); return; }
      const r = (data as { results: Validations })?.results ?? {};
      setValidations((p) => ({ ...p, ...r }));
      if (!r.notion?.ok || !r.discord?.ok) { toast.error("Notion ou Discord não validaram"); return; }
      markStepComplete("integracoes"); setPhase("identidade"); return;
    }

    if (phase === "identidade") { markStepComplete("identidade"); setPhase("instalar"); return; }

    if (phase === "instalar") {
      setValidating(true);
      const { data, error } = await supabase.functions.invoke("validate-credentials", {
        body: { checks: [{ service: "openclaw", openclaw_workspace_url: form.openclaw_workspace_url, openclaw_token: form.openclaw_token }] },
      });
      setValidating(false);
      if (error) { toast.error("Falha ao validar"); return; }
      const r = (data as { results: Validations })?.results ?? {};
      setValidations((p) => ({ ...p, ...r }));
      if (!r.openclaw?.ok) { toast.error("OpenClaw não validou"); return; }
      markStepComplete("instalar"); setPhase("ativar"); return;
    }
  };

  const goBack = () => {
    if (phase === "intro") return;
    if (stepIndex === 0) { setPhase("intro"); return; }
    setPhase(STEPS[stepIndex - 1].id);
  };

  const activate = async () => {
    if (!user) return;
    setSubmitting(true);
    const soul_md = `# Identidade do ${form.agent_name}\nTom: ${TONE_LABEL[form.tone]}\n${form.presentation}`;
    const { data, error } = await supabase.functions.invoke("onboard-agent", {
      body: {
        company: { name: form.name, timezone: form.timezone },
        credentials: {
          anthropic_key: form.anthropic_key,
          openclaw_workspace_url: form.openclaw_workspace_url,
          openclaw_token: form.openclaw_token,
          notion_token: form.notion_token,
          notion_database_id: form.notion_database_id,
          discord_bot_token: form.discord_bot_token,
          discord_server_id: form.discord_server_id,
          discord_channel_id: form.discord_channel_id,
        },
        config: {
          soul_md,
          user_md: form.user_md,
          morning_briefing_time: "08:00",
          checkpoint_time: "12:00",
          daily_report_time: "18:00",
        },
      },
    });
    if (error || !(data as any)?.success) {
      setSubmitting(false);
      if ((data as any)?.validations) setValidations((data as any).validations);
      toast.error((data as any)?.error ?? `Falha ao ativar: ${error?.message ?? "erro"}`);
      return;
    }

    // Best-effort: popula o Cérebro (company_context) e sincroniza.
    const companyId = (data as any).company_id;
    if (companyId) {
      try {
        await sb().from("company_context").upsert({
          company_id: companyId,
          agent_name: form.agent_name,
          communication_tone: form.tone,
          presentation: form.presentation,
          operational_context: form.user_md,
          generated_by_ai: false,
          reviewed_at: new Date().toISOString(),
        }, { onConflict: "company_id" });
        await supabase.functions.invoke("brain-sync", { body: { company_id: companyId } });
      } catch (_) { /* não bloqueia ativação */ }
    }

    setSubmitting(false);
    markStepComplete("activated");
    await completeOnboarding();
    toast.success("Atlas ativado! Bem-vindo.");
    navigate("/", { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando onboarding...
      </div>
    );
  }

  // ---------- Etapa 0: apresentação ----------
  if (phase === "intro") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 bg-[hsl(var(--background))]">
        <div className="max-w-lg text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">A</div>
          <h1 className="text-3xl font-bold">Oi, eu sou o Atlas.</h1>
          <p className="text-muted-foreground">
            Vou ser o seu braço operacional: leio o backlog, executo rotinas e mantenho o time informado.
            Antes de começar a operar, preciso de algumas configurações — leva poucos minutos.
          </p>
          <p className="text-sm text-muted-foreground">São 5 etapas: Chaves → Integrações → Identidade → Instalar → Ativar.</p>
          <Button size="lg" onClick={() => setPhase("chaves")}>
            <Sparkles className="h-4 w-4 mr-1" /> Começar
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Etapas 1–5 ----------
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--background))]">
      <header className="border-b bg-card px-6 py-4">
        <p className="text-sm font-medium">Vamos deixar seu Atlas pronto para operar</p>
        <p className="text-xs text-muted-foreground">Conclua as 5 etapas para ativar a operação.</p>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                i < stepIndex ? "bg-emerald-600 text-white" : i === stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-xs ${i === stepIndex ? "font-medium" : "text-muted-foreground"}`}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-10">
        <Card className="w-full max-w-2xl">
          <CardContent className="space-y-4 pt-6">
            {phase === "chaves" && (
              <>
                <StepTitle title="Chaves" desc="Identifique sua empresa e a chave técnica do Atlas." />
                <Field label="Nome da empresa"><Input value={form.name} onChange={onInput("name")} maxLength={120} /></Field>
                <Field label="Fuso horário">
                  <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Anthropic API Key" status={validations.anthropic}>
                  <Input type="password" value={form.anthropic_key} onChange={onInput("anthropic_key")} placeholder="sk-ant-..." />
                </Field>
              </>
            )}

            {phase === "integracoes" && (
              <>
                <StepTitle title="Integrações" desc="Conecte o backlog (Notion) e o canal de comunicação (Discord)." />
                <Field label="Notion Token" status={validations.notion}><Input type="password" value={form.notion_token} onChange={onInput("notion_token")} placeholder="secret_..." /></Field>
                <Field label="Notion Database ID"><Input value={form.notion_database_id} onChange={onInput("notion_database_id")} /></Field>
                <Field label="Discord Bot Token" status={validations.discord}><Input type="password" value={form.discord_bot_token} onChange={onInput("discord_bot_token")} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Discord Server ID"><Input value={form.discord_server_id} onChange={onInput("discord_server_id")} /></Field>
                  <Field label="Discord Channel ID"><Input value={form.discord_channel_id} onChange={onInput("discord_channel_id")} /></Field>
                </div>
              </>
            )}

            {phase === "identidade" && (
              <>
                <StepTitle title="Identidade" desc="Como o Atlas se chama e fala com o time. Você pode refinar depois no Cérebro." />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome do agente"><Input value={form.agent_name} onChange={onInput("agent_name")} maxLength={60} /></Field>
                  <Field label="Tom">
                    <Select value={form.tone} onValueChange={(v) => set("tone", v as FormState["tone"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">Direto</SelectItem>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="informal">Informal</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Como se apresenta">
                  <Textarea value={form.presentation} onChange={onInput("presentation")} rows={3} placeholder="Ex.: Sou o Atlas da ACME. Cuido da execução operacional e aviso sobre bloqueios." />
                </Field>
                <Field label="Contexto da empresa (opcional)">
                  <Textarea value={form.user_md} onChange={onInput("user_md")} rows={5} maxLength={20000} placeholder="Prioridades, restrições, regras (ex.: pagamentos acima de R$5.000 exigem aprovação)." />
                </Field>
              </>
            )}

            {phase === "instalar" && (
              <>
                <StepTitle title="Instalar" desc="Aponte para a sua instância OpenClaw. Esta etapa configura — não instala nada automaticamente." />
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Como preparar sua VPS:</p>
                  <p>1. Provisione o OpenClaw na sua VPS e crie um workspace.</p>
                  <p>2. Copie a URL do workspace e gere um token de acesso.</p>
                  <p>3. Cole abaixo — o Atlas usará isso para executar as tarefas.</p>
                  <code className="block mt-1 rounded bg-background px-2 py-1">curl -fsSL https://get.openclaw.dev | sh   # exemplo ilustrativo</code>
                </div>
                <Field label="OpenClaw Workspace URL" status={validations.openclaw}><Input value={form.openclaw_workspace_url} onChange={onInput("openclaw_workspace_url")} placeholder="https://workspace.openclaw.com" /></Field>
                <Field label="OpenClaw Token"><Input type="password" value={form.openclaw_token} onChange={onInput("openclaw_token")} /></Field>
              </>
            )}

            {phase === "ativar" && (
              <>
                <StepTitle title="Ativar" desc="Tudo pronto. Revise e ative o Atlas." />
                <ul className="text-sm space-y-1.5">
                  <ReviewRow label="Empresa" value={`${form.name} · ${form.timezone}`} />
                  <ReviewRow label="Agente" value={`${form.agent_name} · ${TONE_LABEL[form.tone]}`} />
                  <ReviewRow label="Anthropic" value={validations.anthropic?.ok ? "validada" : "informada"} ok={validations.anthropic?.ok} />
                  <ReviewRow label="Notion + Discord" value={validations.notion?.ok && validations.discord?.ok ? "validados" : "informados"} ok={validations.notion?.ok && validations.discord?.ok} />
                  <ReviewRow label="OpenClaw" value={validations.openclaw?.ok ? "validado" : "informado"} ok={validations.openclaw?.ok} />
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t bg-card px-6 py-4 flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={validating || submitting}>Voltar</Button>
        <span className="text-xs text-muted-foreground hidden sm:block">
          {phase === "ativar" ? "Revise os dados e conclua." : "Preencha o mínimo para continuar."}
        </span>
        {phase === "ativar" ? (
          <Button onClick={activate} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Concluir e começar a operar
          </Button>
        ) : (
          <Button onClick={goNext} disabled={validating || !minFilled(phase)}>
            {validating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continuar
          </Button>
        )}
      </footer>
    </div>
  );
}

function StepTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Field({ label, status, children }: { label: string; status?: { ok: boolean; error?: string }; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {status?.ok && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        {status && !status.ok && <XCircle className="h-4 w-4 text-destructive" />}
      </div>
      {children}
      {status && !status.ok && status.error && <p className="text-sm text-destructive">{status.error}</p>}
    </div>
  );
}

function ReviewRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 font-medium">
        {ok && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}{value}
      </span>
    </li>
  );
}
