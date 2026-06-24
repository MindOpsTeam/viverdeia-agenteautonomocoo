import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Check, CheckCircle2, Loader2, XCircle, SkipForward, Plug, Wand2, HelpCircle, ExternalLink, MessageSquarePlus, Copy, ArrowLeft,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = () => supabase as any;

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife",
  "America/Belem", "America/Cuiaba", "America/New_York", "Europe/Lisbon", "UTC",
];

const TONE_LABEL: Record<string, string> = {
  direct: "Direto e objetivo", formal: "Formal", informal: "Informal",
};

const OPENCLAW_INSTALL_CMD = "curl -fsSL https://viverdeia.ai/install/atlas | sh";

const SEGMENTS = ["SaaS", "E-commerce", "Serviços", "Consultoria", "Educação", "Saúde", "Varejo", "Indústria", "Agronegócio", "Outro"];
const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C", "Marketplace"];
const TEAM_SIZES = ["1-5 pessoas", "6-15 pessoas", "16-50 pessoas", "51-200 pessoas", "200+"];
const CHALLENGES = [
  "Execução de tarefas (as coisas não saem do papel)",
  "Comunicação entre áreas (time não se fala bem)",
  "Processos não documentados (depende do conhecimento de pessoas)",
  "Gestão de tempo (muita reunião, pouca entrega)",
  "Métricas (não sei o que está funcionando)",
  "Crescimento acelerado (estrutura não acompanha)",
  "Outro",
];

type NotionDb = { database_id: string; name: string; type: "backlog" | "knowledge" | "ignore" };
type DiscordChannel = { id: string; name: string };
type Guardrail = { content: string; reason: string };

const STEPS = [
  { id: "empresa", label: "Empresa" },
  { id: "anthropic", label: "Anthropic" },
  { id: "github", label: "GitHub", optional: true },
  { id: "vps", label: "VPS", optional: true },
  { id: "backlog", label: "Backlog" },
  { id: "comunicacao", label: "Comunicação" },
  { id: "identidade", label: "Identidade" },
  { id: "guardrails", label: "Guardrails" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const DEFAULT_GUARDRAILS: Guardrail[] = [
  { content: "Nunca enviar comunicação externa (cliente/fornecedor) sem aprovação humana explícita.", reason: "Guardrail universal de segurança." },
  { content: "Nunca executar pagamento ou transferência financeira de qualquer valor.", reason: "Guardrail universal de segurança." },
  { content: "Sempre registrar evidência antes de marcar uma tarefa como concluída.", reason: "Garante rastreabilidade do trabalho." },
];

function normalizeGuardrails(si: any): Guardrail[] | null {
  if (Array.isArray(si?.guardrails) && si.guardrails.length) {
    return si.guardrails
      .map((g: any) => ({ content: String(g?.content ?? "").trim(), reason: String(g?.reason ?? "").trim() }))
      .filter((g: Guardrail) => g.content).slice(0, 5);
  }
  if (Array.isArray(si?.directives) && si.directives.length) {
    return si.directives.slice(0, 5).map((c: any) => ({ content: String(c).trim(), reason: "" })).filter((g: Guardrail) => g.content);
  }
  return null;
}

type Form = {
  name: string; timezone: string; company_website: string;
  segment: string; business_model: string; team_size: string; main_challenges: string[];
  anthropic_key: string;
  github_repo_url: string; github_pat: string;
  openclaw_workspace_url: string; openclaw_token: string;
  backlog_provider: "notion" | "asana";
  notion_mode: "have" | "create";
  notion_token: string;
  notion_databases: NotionDb[];
  comm_provider: "discord" | "slack";
  discord_mode: "have" | "setup";
  discord_bot_token: string; discord_server_id: string; discord_public_key: string;
  discord_channels: DiscordChannel[];
  discord_channel_id: string;
  agent_name: string; tone: "direct" | "formal" | "informal";
  mission: string; presentation: string; operational_context: string;
  guardrails: Guardrail[];
};

const initialForm: Form = {
  name: "", timezone: "America/Sao_Paulo", company_website: "",
  segment: "", business_model: "", team_size: "", main_challenges: [],
  anthropic_key: "",
  github_repo_url: "", github_pat: "",
  openclaw_workspace_url: "", openclaw_token: "",
  backlog_provider: "notion", notion_mode: "have", notion_token: "", notion_databases: [],
  comm_provider: "discord", discord_mode: "have",
  discord_bot_token: "", discord_server_id: "", discord_public_key: "",
  discord_channels: [], discord_channel_id: "",
  agent_name: "Atlas", tone: "direct", mission: "", presentation: "", operational_context: "",
  guardrails: [...DEFAULT_GUARDRAILS],
};

type Tested = Partial<Record<"anthropic" | "github" | "vps" | "notion" | "discord", boolean>>;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const ob = useOnboarding();

  const [form, setForm] = useState<Form>(initialForm);
  const [tested, setTested] = useState<Tested>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [siteFilled, setSiteFilled] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardQuestions, setWizardQuestions] = useState<string[]>([]);
  const [wizardAnswers, setWizardAnswers] = useState<Record<number, string>>({});
  const [wizardBusy, setWizardBusy] = useState(false);
  const [vpsSub, setVpsSub] = useState<"install" | "creds">("install");
  const [vpsChecks, setVpsChecks] = useState({ ran: false, ok: false, have: false });
  const hydrated = useRef(false);
  const ctxAppliedRef = useRef(false);

  const copyInstallCmd = async () => {
    try { await navigator.clipboard.writeText(OPENCLAW_INSTALL_CMD); toast.success("Comando copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  // Aplica a identidade gerada pela IA. force=true sobrescreve campos já preenchidos.
  const applyIdentity = (si: any, force = false) => {
    if (!si) return;
    if (!force && ctxAppliedRef.current) return;
    ctxAppliedRef.current = true;
    const guardrails = normalizeGuardrails(si);
    setForm((f) => ({
      ...f,
      agent_name: force || !f.agent_name || f.agent_name === "Atlas" ? (si.agent_name || f.agent_name) : f.agent_name,
      tone: ["direct", "formal", "informal"].includes(si.communication_tone) ? si.communication_tone : f.tone,
      mission: force ? (si.mission || f.mission) : (f.mission || si.mission || ""),
      presentation: force ? (si.presentation || f.presentation) : (f.presentation || si.presentation || ""),
      guardrails: guardrails ?? f.guardrails,
    }));
    if (Array.isArray(si.questions) && si.questions.length) setWizardQuestions(si.questions);
    setSiteFilled(true);
  };

  // Análise de negócio em background (site + segmento + modelo + tamanho + desafios).
  const analyzeBusiness = async () => {
    const cid = ob.companyId;
    if (!cid) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("cerebro-ai", {
        body: {
          company_id: cid, mode: "identity",
          payload: {
            website_url: form.company_website.trim() || undefined,
            segment: form.segment || undefined,
            business_model: form.business_model || undefined,
            team_size: form.team_size || undefined,
            main_challenges: form.main_challenges,
            about_company: `Empresa: ${form.name}.`,
            about_agent: `Nome do agente: ${form.agent_name}.`,
          },
        },
      });
      if (error) return;
      const r = (data as any)?.result;
      if (!r) return;
      await ob.mergeDraft({ site_identity: r });
      applyIdentity(r);
      toast.success("Atlas configurado para o seu negócio — revise na etapa de Identidade.");
    } catch (_) { /* silencioso: roda em background */ }
    finally { setAnalyzing(false); }
  };

  // ---------- Reidratação ao retomar ----------
  useEffect(() => {
    if (ob.isLoading || hydrated.current) return;
    hydrated.current = true;

    if (ob.isCompleted) { navigate("/", { replace: true }); return; }

    const cfg = ob.snapshot.config ?? {};
    const creds = ob.snapshot.credsPresent ?? [];
    const draftVal = (ob.draft?.validations ?? {}) as Record<string, boolean>;

    setForm((f) => ({
      ...f,
      name: ob.snapshot.companyName || f.name,
      timezone: cfg.timezone || f.timezone,
      company_website: (ob.draft as any)?.company_website || f.company_website,
      segment: cfg.segment || f.segment,
      business_model: cfg.business_model || f.business_model,
      team_size: cfg.team_size || f.team_size,
      main_challenges: Array.isArray(cfg.main_challenges) ? cfg.main_challenges : f.main_challenges,
      github_repo_url: cfg.github_repo_url || "",
      openclaw_workspace_url: cfg.openclaw_workspace_url || "",
      backlog_provider: cfg.backlog_provider || "notion",
      notion_databases: Array.isArray(cfg.notion_database_ids) ? cfg.notion_database_ids : [],
      comm_provider: cfg.comm_provider || "discord",
      discord_server_id: cfg.discord_server_id || "",
      discord_channel_id: cfg.discord_channel_id || "",
      discord_public_key: cfg.discord_public_key || "",
    }));

    setTested({
      anthropic: !!draftVal.anthropic || creds.includes("anthropic"),
      github: !!draftVal.github || creds.includes("github"),
      vps: !!draftVal.vps || creds.includes("openclaw"),
      notion: !!draftVal.notion || (creds.includes("notion") && Array.isArray(cfg.notion_database_ids) && cfg.notion_database_ids.length > 0),
      discord: !!draftVal.discord || (creds.includes("discord") && !!cfg.discord_channel_id),
    });
    if (creds.includes("openclaw") || (ob.draft?.validations as any)?.vps) setVpsSub("creds");

    const si = (ob.draft as any)?.site_identity;
    if (si) applyIdentity(si);

    const resume = Math.min(Math.max((ob.currentStep ?? 1) - 1, 0), STEPS.length - 1);
    setStepIdx(resume);
  }, [ob.isLoading, ob.isCompleted, ob.snapshot, ob.draft, ob.currentStep, navigate]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const onInput = <K extends keyof Form>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as Form[K]);

  const toggleChallenge = (c: string) => {
    const has = form.main_challenges.includes(c);
    if (!has && form.main_challenges.length >= 3) { toast.error("Escolha no máximo 3 desafios."); return; }
    set("main_challenges", has ? form.main_challenges.filter((x) => x !== c) : [...form.main_challenges, c]);
  };

  const credsPresent = ob.snapshot.credsPresent ?? [];
  const step = STEPS[stepIdx];

  // ---------- Gates do botão "Continuar" ----------
  const canContinue = useMemo((): boolean => {
    switch (step.id) {
      case "empresa": return !!form.name.trim() && !!form.timezone;
      case "anthropic": return !!tested.anthropic;
      case "github": return true; // opcional
      case "vps": return true;    // opcional
      case "backlog": return form.backlog_provider === "notion" && !!tested.notion;
      case "comunicacao": return form.comm_provider === "discord" && !!tested.discord;
      case "identidade": return !!form.agent_name.trim() && !!form.presentation.trim();
      case "guardrails": return true;
      default: return false;
    }
  }, [step.id, form, tested]);

  // ---------- Testes / conexões ----------
  const callValidate = async (checks: any[]) => {
    const { data, error } = await supabase.functions.invoke("validate-credentials", { body: { checks } });
    if (error) throw new Error("Falha ao validar (rede)");
    return (data as { results: Record<string, { ok: boolean; error?: string }> })?.results ?? {};
  };

  const testAnthropic = async () => {
    setBusy("anthropic");
    try {
      const r = await callValidate([{ service: "anthropic", anthropic_key: form.anthropic_key }]);
      if (!r.anthropic?.ok) { toast.error(r.anthropic?.error ?? "Chave Anthropic inválida"); setTested((t) => ({ ...t, anthropic: false })); return; }
      const cid = ob.companyId ?? (await ob.ensureCompany(form.name, form.timezone));
      if (!cid) { toast.error("Conclua a etapa Empresa primeiro."); return; }
      const ok = await ob.storeSecret("anthropic", form.anthropic_key);
      if (!ok) { toast.error("Falha ao salvar a chave no Vault"); return; }
      await ob.mergeDraft({ validations: { anthropic: true } });
      setTested((t) => ({ ...t, anthropic: true }));
      toast.success("Chave Anthropic validada e salva.");
      // Dispara a análise de negócio em background (agora que a chave existe no Vault).
      const hasContext = !!form.company_website.trim() || !!form.segment || form.main_challenges.length > 0;
      if (hasContext && !(ob.draft as any)?.site_identity && !ctxAppliedRef.current) {
        void analyzeBusiness();
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao validar"); }
    finally { setBusy(null); }
  };

  const testGithub = async () => {
    setBusy("github");
    try {
      const r = await callValidate([{ service: "github", github_pat: form.github_pat, github_repo_url: form.github_repo_url }]);
      if (!r.github?.ok) { toast.error(r.github?.error ?? "GitHub inválido"); setTested((t) => ({ ...t, github: false })); return; }
      await ob.storeSecret("github", form.github_pat);
      await ob.patchConfig({ github_repo_url: form.github_repo_url });
      await ob.mergeDraft({ validations: { github: true } });
      setTested((t) => ({ ...t, github: true }));
      toast.success("GitHub validado e salvo.");
    } catch (e: any) { toast.error(e?.message ?? "Erro ao validar"); }
    finally { setBusy(null); }
  };

  const testVps = async () => {
    setBusy("vps");
    try {
      const r = await callValidate([{ service: "openclaw", openclaw_workspace_url: form.openclaw_workspace_url, openclaw_token: form.openclaw_token }]);
      if (!r.openclaw?.ok) { toast.error(r.openclaw?.error ?? "OpenClaw inválido"); setTested((t) => ({ ...t, vps: false })); return; }
      await ob.storeSecret("openclaw", form.openclaw_token);
      await ob.patchConfig({ openclaw_workspace_url: form.openclaw_workspace_url, vps_url: form.openclaw_workspace_url });
      await ob.mergeDraft({ validations: { vps: true } });
      setTested((t) => ({ ...t, vps: true }));
      toast.success("OpenClaw validado e salvo.");
    } catch (e: any) { toast.error(e?.message ?? "Erro ao validar"); }
    finally { setBusy(null); }
  };

  const connectNotion = async (mode: "have" | "create") => {
    if (!form.notion_token.trim()) { toast.error("Informe o token do Notion."); return; }
    setBusy("notion");
    try {
      const cid = ob.companyId ?? (await ob.ensureCompany(form.name, form.timezone));
      if (!cid) { toast.error("Conclua a etapa Empresa primeiro."); return; }
      const action = mode === "have" ? "list" : "create";
      const { data, error } = await supabase.functions.invoke("setup-notion-database", {
        body: { action, notion_token: form.notion_token },
      });
      if (error) { toast.error("Falha ao conectar no Notion (rede)"); return; }
      const res = data as any;
      if (!res?.ok) { toast.error(res?.error ?? "Falha no Notion"); setTested((t) => ({ ...t, notion: false })); return; }

      let dbs: NotionDb[];
      if (mode === "have") {
        const existingTypes = new Map(form.notion_databases.map((d) => [d.database_id, d.type]));
        dbs = (res.databases ?? []).map((d: any) => ({
          database_id: d.database_id, name: d.name,
          type: (existingTypes.get(d.database_id) as NotionDb["type"]) ?? "ignore",
        }));
        if (!dbs.length) { toast.error("Nenhum database visível. Compartilhe os bancos com a integração."); return; }
      } else {
        dbs = [...form.notion_databases.filter((d) => d.database_id !== res.database_id),
               { database_id: res.database_id, name: res.name, type: "backlog" }];
      }

      await ob.storeSecret("notion", form.notion_token);
      set("notion_databases", dbs);
      await ob.mergeDraft({ validations: { notion: true } });
      setTested((t) => ({ ...t, notion: true }));
      toast.success(mode === "have" ? `${dbs.length} database(s) encontrados.` : "Database criado no Notion.");
    } catch (e: any) { toast.error(e?.message ?? "Erro no Notion"); }
    finally { setBusy(null); }
  };

  const connectDiscord = async (mode: "have" | "setup") => {
    if (!form.discord_bot_token.trim() || !form.discord_server_id.trim()) {
      toast.error("Informe Bot Token e Server ID."); return;
    }
    setBusy("discord");
    try {
      const cid = ob.companyId ?? (await ob.ensureCompany(form.name, form.timezone));
      if (!cid) { toast.error("Conclua a etapa Empresa primeiro."); return; }
      const action = mode === "have" ? "list" : "create";
      const { data, error } = await supabase.functions.invoke("setup-discord-channels", {
        body: { action, bot_token: form.discord_bot_token, guild_id: form.discord_server_id },
      });
      if (error) { toast.error("Falha ao conectar no Discord (rede)"); return; }
      const res = data as any;
      if (!res?.ok) { toast.error(res?.error ?? "Falha no Discord"); setTested((t) => ({ ...t, discord: false })); return; }

      const channels: DiscordChannel[] = (res.channels ?? [])
        .filter((c: any) => c.id).map((c: any) => ({ id: c.id, name: c.name }));
      if (!channels.length) { toast.error("Nenhum canal disponível."); return; }

      await ob.storeSecret("discord", form.discord_bot_token);
      set("discord_channels", channels);
      const chosen = mode === "setup" ? channels[0].id : (form.discord_channel_id || channels[0].id);
      set("discord_channel_id", chosen);
      await ob.mergeDraft({ validations: { discord: true } });
      setTested((t) => ({ ...t, discord: true }));
      toast.success(mode === "have" ? `${channels.length} canal(is) encontrados.` : "Canais criados no Discord.");
    } catch (e: any) { toast.error(e?.message ?? "Erro no Discord"); }
    finally { setBusy(null); }
  };

  // Preencher com IA (rápido) — usa o contexto coletado e sobrescreve os campos.
  const fillIdentityWithAI = async () => {
    const cid = ob.companyId ?? (await ob.ensureCompany(form.name, form.timezone));
    if (!cid) { toast.error("Conclua a etapa Empresa primeiro."); return; }
    if (!tested.anthropic && !credsPresent.includes("anthropic")) {
      toast.error("Valide a chave Anthropic (etapa 2) antes de usar a IA."); return;
    }
    setBusy("ai");
    try {
      const { data, error } = await supabase.functions.invoke("cerebro-ai", {
        body: {
          company_id: cid, mode: "identity",
          payload: {
            website_url: form.company_website.trim() || undefined,
            segment: form.segment || undefined, business_model: form.business_model || undefined,
            team_size: form.team_size || undefined, main_challenges: form.main_challenges,
            about_company: `Empresa: ${form.name}. Missão: ${form.mission}. Contexto: ${form.operational_context}`,
            about_agent: `Nome do agente: ${form.agent_name}. Tom desejado: ${TONE_LABEL[form.tone]}.`,
          },
        },
      });
      if (error) { toast.error("Falha ao gerar com IA"); return; }
      const r = (data as any)?.result;
      if (!r) { toast.error((data as any)?.error ?? "IA não retornou conteúdo"); return; }
      applyIdentity(r, true);
      toast.success("Identidade preenchida pela IA — revise antes de continuar.");
    } catch (e: any) { toast.error(e?.message ?? "Erro na IA"); }
    finally { setBusy(null); }
  };

  // Refinar com mais perguntas (dialog) — respostas re-alimentam a IA.
  const runRefine = async () => {
    const cid = ob.companyId;
    if (!cid) { toast.error("Empresa não encontrada."); return; }
    setWizardBusy(true);
    try {
      const wizard_answers = wizardQuestions
        .map((q, i) => ({ question: q, answer: (wizardAnswers[i] ?? "").trim() }))
        .filter((a) => a.answer);
      if (!wizard_answers.length) { toast.error("Responda ao menos uma pergunta."); return; }
      const { data, error } = await supabase.functions.invoke("cerebro-ai", {
        body: {
          company_id: cid, mode: "identity",
          payload: {
            website_url: form.company_website.trim() || undefined,
            segment: form.segment || undefined, business_model: form.business_model || undefined,
            team_size: form.team_size || undefined, main_challenges: form.main_challenges,
            about_company: `Empresa: ${form.name}. Missão atual: ${form.mission}.`,
            about_agent: `Nome: ${form.agent_name}. Tom: ${TONE_LABEL[form.tone]}.`,
            wizard_answers,
          },
        },
      });
      if (error) { toast.error("Falha ao refinar"); return; }
      const r = (data as any)?.result;
      if (!r) { toast.error((data as any)?.error ?? "IA não retornou conteúdo"); return; }
      await ob.mergeDraft({ site_identity: r });
      applyIdentity(r, true);
      setWizardOpen(false);
      toast.success("Identidade refinada com base nas suas respostas.");
    } catch (e: any) { toast.error(e?.message ?? "Erro ao refinar"); }
    finally { setWizardBusy(false); }
  };

  // ---------- Navegação ----------
  const goTo = (idx: number) => { setStepIdx(idx); ob.setStep(idx + 1); };

  const persistStep = async (id: StepId) => {
    switch (id) {
      case "empresa": {
        const cid = await ob.ensureCompany(form.name, form.timezone);
        if (!cid) throw new Error("Falha ao salvar a empresa");
        await ob.patchConfig({
          timezone: form.timezone,
          segment: form.segment || null,
          business_model: form.business_model || null,
          team_size: form.team_size || null,
          main_challenges: form.main_challenges,
        });
        await ob.mergeDraft({ company_website: form.company_website.trim() });
        break;
      }
      case "github": {
        if (!tested.github && (!form.github_repo_url.trim() || !form.github_pat.trim())) {
          await ob.mergeDraft({ skipped: { github: true } });
        }
        break;
      }
      case "vps": {
        if (!tested.vps && (!form.openclaw_workspace_url.trim() || !form.openclaw_token.trim())) {
          await ob.mergeDraft({ skipped: { vps: true } });
        }
        break;
      }
      case "backlog": {
        const backlogFirst = form.notion_databases.find((d) => d.type === "backlog")
          ?? form.notion_databases.find((d) => d.type !== "ignore");
        await ob.patchConfig({
          backlog_provider: "notion",
          notion_database_ids: form.notion_databases,
          notion_database_id: backlogFirst?.database_id ?? null,
        });
        break;
      }
      case "comunicacao": {
        await ob.patchConfig({
          comm_provider: "discord",
          discord_server_id: form.discord_server_id,
          discord_channel_id: form.discord_channel_id,
          discord_public_key: form.discord_public_key || null,
        });
        break;
      }
      case "identidade": {
        const cid = ob.companyId;
        if (cid) {
          await sb().from("company_context").upsert({
            company_id: cid,
            agent_name: form.agent_name,
            communication_tone: form.tone,
            presentation: form.presentation,
            mission: form.mission,
            operational_context: form.operational_context,
            generated_by_ai: siteFilled,
            reviewed_at: new Date().toISOString(),
          }, { onConflict: "company_id" });
          await ob.patchConfig({
            soul_md: `# Identidade do ${form.agent_name}\nTom: ${TONE_LABEL[form.tone]}\nMissão: ${form.mission}\n\n${form.presentation}`,
            user_md: form.operational_context,
          });
        }
        break;
      }
    }
  };

  const goNext = async () => {
    if (!canContinue) return;
    setBusy("next");
    try {
      await persistStep(step.id);
      await ob.markStepComplete(step.id);
      goTo(Math.min(stepIdx + 1, STEPS.length - 1));
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar a etapa");
    } finally { setBusy(null); }
  };

  const skipStep = async () => {
    setBusy("next");
    try {
      await ob.mergeDraft({ skipped: { [step.id]: true } });
      await ob.markStepComplete(step.id);
      goTo(Math.min(stepIdx + 1, STEPS.length - 1));
    } finally { setBusy(null); }
  };

  const goBack = () => { if (stepIdx > 0) goTo(stepIdx - 1); };

  const finish = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await persistStep("identidade"); // garante identidade salva
      const cid = ob.companyId;
      if (cid) {
        const rows = form.guardrails.map((g) => g.content.trim()).filter(Boolean).map((content) => ({
          company_id: cid, content, source: "wizard", status: "active",
        }));
        if (rows.length) await sb().from("directives").insert(rows);
      }
      const { data, error } = await supabase.functions.invoke("onboard-agent", { body: {} });
      if (error || !(data as any)?.success) {
        toast.error((data as any)?.error ?? `Falha ao finalizar: ${error?.message ?? "erro"}`);
        setSubmitting(false);
        return;
      }
      await ob.markStepComplete("guardrails");
      await ob.completeOnboarding();
      setFinished(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao finalizar");
      setSubmitting(false);
    }
  };

  if (ob.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando onboarding...
      </div>
    );
  }

  // Tela final de encerramento.
  if (finished) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 bg-[hsl(var(--background))]">
        <div className="max-w-lg text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-info text-white flex items-center justify-center text-2xl font-bold">A</div>
          <h1 className="text-2xl font-bold">Atlas está pronto para operar a {form.name || "sua empresa"}.</h1>
          <p className="text-muted-foreground">
            Ele já conhece seu negócio, seus desafios e suas regras. A partir de agora, ele trabalha. Você decide.
          </p>
          <Button size="lg" onClick={() => navigate("/?welcome=1", { replace: true })}>Começar a operar →</Button>
        </div>
      </div>
    );
  }

  const isLast = stepIdx === STEPS.length - 1;
  const savedSecret = (svc: string) => credsPresent.includes(svc);
  const contextBadge = [form.segment, form.business_model, form.team_size].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--background))]">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-info text-white flex items-center justify-center text-sm font-bold">A</div>
          <div>
            <p className="text-sm font-medium">Vamos deixar seu Atlas pronto para operar</p>
            <p className="text-xs text-muted-foreground">8 etapas · seu progresso é salvo automaticamente.</p>
          </div>
          {analyzing && (
            <Badge className="ml-auto bg-info hover:bg-info text-white animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Analisando seu negócio…
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-4 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                i < stepIdx ? "bg-success text-white" : i === stepIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-xs ${i === stepIdx ? "font-medium" : "text-muted-foreground"} hidden md:inline`}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-10">
        <Card className="w-full max-w-2xl">
          <CardContent className="space-y-4 pt-6">
            {/* 1 — Empresa */}
            {step.id === "empresa" && (
              <>
                <StepTitle title="Empresa" desc="Conte sobre o seu negócio — usamos para pré-configurar o Atlas." />
                <Field label="Nome da empresa"><Input value={form.name} onChange={onInput("name")} maxLength={120} /></Field>
                <Field label="Fuso horário">
                  <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <div className="space-y-1.5">
                  <Field label="Site da empresa">
                    <Input value={form.company_website} onChange={onInput("company_website")} placeholder="https://suaempresa.com.br" />
                  </Field>
                  <p className="text-xs text-muted-foreground">Usamos para entender seu negócio e pré-configurar o Atlas.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Segmento">
                    <Select value={form.segment} onValueChange={(v) => set("segment", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Tamanho do time">
                    <Select value={form.team_size} onValueChange={(v) => set("team_size", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{TEAM_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Modelo de negócio">
                  <Chips options={BUSINESS_MODELS} selected={form.business_model ? [form.business_model] : []} onToggle={(v) => set("business_model", v)} />
                </Field>
                <div className="space-y-1.5">
                  <Field label="Maior desafio operacional hoje (até 3)">
                    <Chips options={CHALLENGES} selected={form.main_challenges} onToggle={toggleChallenge} multi />
                  </Field>
                </div>
              </>
            )}

            {/* 2 — Anthropic */}
            {step.id === "anthropic" && (
              <>
                <StepTitle title="Anthropic API Key" desc="A chave técnica que o Atlas usa para raciocinar (modelo Claude)." />
                <Tutorial
                  title="Como obter sua Anthropic API Key"
                  steps={[
                    "Acesse console.anthropic.com e faça login (ou crie sua conta).",
                    "No menu lateral, clique em \"API Keys\".",
                    "Clique em \"Create Key\", dê um nome (ex.: Atlas) e confirme.",
                    "Copie a chave que começa com sk-ant- e cole abaixo. Ela só aparece uma vez.",
                  ]}
                  link={{ href: "https://console.anthropic.com/settings/keys", label: "Abrir Anthropic Console" }}
                />
                <Field label="Anthropic API Key" ok={tested.anthropic}>
                  <div className="flex gap-2">
                    <Input type="password" value={form.anthropic_key} onChange={onInput("anthropic_key")}
                      placeholder={savedSecret("anthropic") ? "•••••• (salvo) — cole para substituir" : "sk-ant-..."} />
                    <Button variant="outline" onClick={testAnthropic} disabled={busy === "anthropic" || form.anthropic_key.trim().length < 10}>
                      {busy === "anthropic" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                      <span className="ml-1">Testar</span>
                    </Button>
                  </div>
                </Field>
                {tested.anthropic && <SavedHint>Chave validada e guardada no Vault.</SavedHint>}
              </>
            )}

            {/* 3 — GitHub (opcional) */}
            {step.id === "github" && (
              <>
                <StepTitle title="GitHub (opcional)" desc="Repositório privado onde o Atlas versiona as skills compiladas. Pode pular e configurar depois." />
                <Tutorial
                  title="Como obter Repo URL e Personal Access Token"
                  sections={[
                    {
                      heading: "Como obter o PAT (Fine-grained token)",
                      steps: [
                        "Acesse github.com/settings/tokens.",
                        "Clique em \"Generate new token\" → \"Fine-grained token\".",
                        "Configure: Token name = atlas-[nome-da-empresa]; Expiration = 1 year; Repository access = Only select repositories → selecione o repo que vai usar.",
                        "Em Permissions → Repository permissions, ative: Contents = Read and write; Metadata = Read only (já vem automático).",
                        "Clique \"Generate token\" e copie imediatamente — aparece apenas uma vez (começa com github_pat_).",
                      ],
                      link: { href: "https://github.com/settings/tokens", label: "Abrir tokens do GitHub" },
                    },
                    {
                      heading: "Como obter a Repo URL",
                      steps: [
                        "Crie um repositório PRIVADO em github.com/new — nome sugerido: atlas-skills, marque \"Private\" e inicialize com um README.",
                        "Copie a URL no formato https://github.com/seu-usuario/nome-do-repo.",
                      ],
                      link: { href: "https://github.com/new", label: "Criar repositório" },
                    },
                  ]}
                />
                <Field label="Repo URL"><Input value={form.github_repo_url} onChange={onInput("github_repo_url")} placeholder="https://github.com/empresa/atlas-skills" /></Field>
                <Field label="PAT (fine-grained)" ok={tested.github}>
                  <div className="flex gap-2">
                    <Input type="password" value={form.github_pat} onChange={onInput("github_pat")}
                      placeholder={savedSecret("github") ? "•••••• (salvo)" : "github_pat_..."} />
                    <Button variant="outline" onClick={testGithub} disabled={busy === "github" || !form.github_pat.trim()}>
                      {busy === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                      <span className="ml-1">Testar</span>
                    </Button>
                  </div>
                </Field>
                <p className="text-xs text-muted-foreground">Pode pular esta etapa — sem GitHub, o Cérebro não versiona skills no repositório, mas o Atlas opera normalmente.</p>
              </>
            )}

            {/* 4 — VPS (opcional) */}
            {step.id === "vps" && (
              <>
                <StepTitle title="VPS + OpenClaw (opcional)" desc="O executor que roda ações de browser. Pode pular e configurar depois." />

                {vpsSub === "install" ? (
                  <>
                    {/* Passo 1 — instalar o OpenClaw */}
                    <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
                      <p className="text-sm font-medium text-foreground">1. Instale o OpenClaw na sua VPS</p>
                      <p className="text-sm text-muted-foreground">Acesse sua VPS via SSH e execute:</p>
                      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                        <code className="flex-1 font-mono text-xs text-foreground break-all">{OPENCLAW_INSTALL_CMD}</code>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={copyInstallCmd}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Após a instalação, o comando retorna a URL e o token da sua instância. Copie os dois.</p>
                    </div>

                    <Tutorial
                      title="Como acessar minha VPS via SSH →"
                      steps={[
                        "No terminal (macOS/Linux) ou no PuTTY (Windows), conecte com: ssh root@IP-DA-VPS",
                        "Use o IP e a senha/chave que o provedor da VPS (ex.: Hostinger) enviou ao criar o servidor.",
                        "Já conectado, cole o comando de instalação acima e aguarde concluir.",
                      ]}
                    />

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Confirme antes de continuar:</p>
                      {([["ran", "Executei o comando na VPS"], ["ok", "A instalação completou sem erros"], ["have", "Tenho a URL e o token em mãos"]] as const).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={vpsChecks[k]} onCheckedChange={(v) => setVpsChecks((c) => ({ ...c, [k]: !!v }))} />
                          {label}
                        </label>
                      ))}
                    </div>

                    <Button onClick={() => setVpsSub("creds")} disabled={!vpsChecks.ran || !vpsChecks.ok || !vpsChecks.have}>
                      Continuar para o próximo passo →
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Passo 2 — colar credenciais */}
                    <button type="button" onClick={() => setVpsSub("install")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                      <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao passo de instalação
                    </button>
                    <p className="text-sm font-medium text-foreground">2. Cole as credenciais</p>
                    <Field label="OpenClaw Workspace URL"><Input value={form.openclaw_workspace_url} onChange={onInput("openclaw_workspace_url")} placeholder="https://workspace.openclaw.com" /></Field>
                    <Field label="OpenClaw Token" ok={tested.vps}>
                      <div className="flex gap-2">
                        <Input type="password" value={form.openclaw_token} onChange={onInput("openclaw_token")}
                          placeholder={savedSecret("openclaw") ? "•••••• (salvo)" : "token"} />
                        <Button variant="outline" onClick={testVps} disabled={busy === "vps" || !form.openclaw_token.trim() || !form.openclaw_workspace_url.trim()}>
                          {busy === "vps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                          <span className="ml-1">Testar</span>
                        </Button>
                      </div>
                    </Field>
                    <p className="text-xs text-muted-foreground">Sem VPS, o Atlas planeja e comunica, mas não executa ações de browser até você conectar um executor.</p>
                  </>
                )}
              </>
            )}

            {/* 5 — Backlog */}
            {step.id === "backlog" && (
              <>
                <StepTitle title="Backlog" desc="De onde o Atlas lê as tarefas que deve executar." />
                <ProviderToggle
                  value={form.backlog_provider}
                  onChange={(v) => set("backlog_provider", v as Form["backlog_provider"])}
                  options={[{ value: "notion", label: "Notion" }, { value: "asana", label: "Asana", soon: true }]}
                />
                {form.backlog_provider === "notion" && (
                  <>
                    <ModeToggle value={form.notion_mode} onChange={(v) => set("notion_mode", v as Form["notion_mode"])}
                      options={[{ value: "have", label: "Já tenho" }, { value: "create", label: "Criar pra mim" }]} />
                    <Tutorial
                      title="Como obter o Notion Token (Internal Integration Secret)"
                      steps={[
                        "Abra notion.so/profile/integrations e clique em \"New integration\".",
                        "Dê um nome (ex.: Atlas), associe ao workspace certo e salve.",
                        "Em \"Configuration\", copie o Internal Integration Secret (começa com secret_ ou ntn_).",
                        form.notion_mode === "have"
                          ? "Abra cada database que o Atlas vai usar, clique em \"...\" → \"Connections\" → adicione a integração Atlas."
                          : "Você não precisa criar database — o Atlas vai criar um automaticamente. Só garanta que a integração tenha acesso ao workspace.",
                      ]}
                      link={{ href: "https://www.notion.so/profile/integrations", label: "Abrir integrações do Notion" }}
                    />
                    {form.notion_mode === "create" ? (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                        <p><strong className="text-foreground">Como funciona o "Criar pra mim":</strong></p>
                        <ol className="list-decimal pl-4 space-y-1">
                          <li>Crie a integração no Notion (veja o passo a passo acima) e cole o token abaixo.</li>
                          <li>No Notion, abra a <strong>página</strong> onde o Atlas deve criar o database (ex.: workspace raiz) → clique em "..." → <strong>Connections</strong> → adicione a integração Atlas.</li>
                          <li>Clique em <strong>"Criar database de backlog"</strong>. O Atlas cria automaticamente um database com as colunas certas (Status, Prioridade, Responsável, etc).</li>
                        </ol>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                        <p><strong className="text-foreground">Como funciona o "Já tenho":</strong></p>
                        <ol className="list-decimal pl-4 space-y-1">
                          <li>Compartilhe seus databases com a integração Atlas no Notion (em cada database: "..." → Connections → Atlas).</li>
                          <li>Cole o token abaixo e clique em <strong>"Conectar e listar databases"</strong>.</li>
                          <li>Marque cada database como <em>Backlog</em>, <em>Base de conhecimento</em> ou <em>Ignorar</em>.</li>
                        </ol>
                      </div>
                    )}
                    <Field label="Notion Token">
                      <Input type="password" value={form.notion_token} onChange={onInput("notion_token")}
                        placeholder={savedSecret("notion") ? "•••••• (salvo) — cole para reconectar" : "secret_... ou ntn_..."} />
                    </Field>
                    <Button variant="outline" onClick={() => connectNotion(form.notion_mode)} disabled={busy === "notion" || !form.notion_token.trim()}>
                      {busy === "notion" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plug className="h-4 w-4 mr-1" />}
                      {form.notion_mode === "have" ? "Conectar e listar databases" : "Criar database de backlog"}
                    </Button>
                    {form.notion_databases.length > 0 && (
                      <div className="rounded-lg border divide-y mt-2">
                        <p className="px-3 py-2 text-xs text-muted-foreground">Defina o que o Atlas faz com cada database:</p>
                        {form.notion_databases.map((db) => (
                          <div key={db.database_id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="text-sm truncate">{db.name}</span>
                            <Select value={db.type} onValueChange={(v) => set("notion_databases",
                              form.notion_databases.map((d) => d.database_id === db.database_id ? { ...d, type: v as NotionDb["type"] } : d))}>
                              <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="backlog">Backlog operacional</SelectItem>
                                <SelectItem value="knowledge">Base de conhecimento</SelectItem>
                                <SelectItem value="ignore">Ignorar</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {form.backlog_provider === "asana" && <SoonNote>A integração com Asana chega em breve. Use Notion por enquanto.</SoonNote>}
              </>
            )}

            {/* 6 — Comunicação */}
            {step.id === "comunicacao" && (
              <>
                <StepTitle title="Comunicação" desc="Por onde o time fala com o Atlas e recebe avisos." />
                <ProviderToggle
                  value={form.comm_provider}
                  onChange={(v) => set("comm_provider", v as Form["comm_provider"])}
                  options={[{ value: "discord", label: "Discord" }, { value: "slack", label: "Slack", soon: true }]}
                />
                {form.comm_provider === "discord" && (
                  <>
                    <ModeToggle value={form.discord_mode} onChange={(v) => set("discord_mode", v as Form["discord_mode"])}
                      options={[{ value: "have", label: "Já tenho servidor" }, { value: "setup", label: "Configurar pra mim" }]} />
                    <Tutorial
                      title="Como obter Bot Token, Server ID e Public Key"
                      steps={[
                        "Acesse discord.com/developers/applications e clique em \"New Application\" (nome ex.: Atlas).",
                        "Na aba \"Bot\" → Reset Token → copie o Bot Token. Ative os Privileged Gateway Intents (Message Content).",
                        "Na aba \"General Information\" → copie a Public Key.",
                        "Na aba \"OAuth2\" → URL Generator → marque bot + escopos Manage Channels e Send Messages → abra a URL gerada e adicione o bot ao seu servidor.",
                        "No Discord, ative o Modo Desenvolvedor (Configurações → Avançado), clique com botão direito no nome do servidor → \"Copiar ID do servidor\". Esse é o Server (Guild) ID.",
                      ]}
                      link={{ href: "https://discord.com/developers/applications", label: "Abrir Discord Developer Portal" }}
                    />
                    <Field label="Discord Bot Token">
                      <Input type="password" value={form.discord_bot_token} onChange={onInput("discord_bot_token")}
                        placeholder={savedSecret("discord") ? "•••••• (salvo) — cole para reconectar" : "bot token"} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Server (Guild) ID"><Input value={form.discord_server_id} onChange={onInput("discord_server_id")} /></Field>
                      <Field label="Public Key"><Input value={form.discord_public_key} onChange={onInput("discord_public_key")} placeholder="para o Interactions Endpoint" /></Field>
                    </div>
                    {form.discord_mode === "setup" && (
                      <p className="text-xs text-muted-foreground">O Atlas vai criar os canais <strong>#operações #relatórios #alertas</strong>. O bot precisa já estar no servidor com permissão “Gerenciar Canais”.</p>
                    )}
                    <Button variant="outline" onClick={() => connectDiscord(form.discord_mode)} disabled={busy === "discord" || !form.discord_bot_token.trim() || !form.discord_server_id.trim()}>
                      {busy === "discord" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plug className="h-4 w-4 mr-1" />}
                      {form.discord_mode === "have" ? "Conectar e listar canais" : "Criar canais"}
                    </Button>
                    {form.discord_channels.length > 0 && (
                      <Field label="Canal principal (comandos e avisos)">
                        <Select value={form.discord_channel_id} onValueChange={(v) => set("discord_channel_id", v)}>
                          <SelectTrigger><SelectValue placeholder="Escolha o canal" /></SelectTrigger>
                          <SelectContent>
                            {form.discord_channels.map((c) => <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </>
                )}
                {form.comm_provider === "slack" && <SoonNote>A integração com Slack chega em breve. Use Discord por enquanto.</SoonNote>}
              </>
            )}

            {/* 7 — Identidade */}
            {step.id === "identidade" && (
              <>
                <StepTitle title="Identidade do Atlas" desc="Como o agente se chama e fala com o time. Você pode refinar depois no Cérebro." />
                {siteFilled && (
                  <Badge className="bg-info hover:bg-info text-white">
                    {contextBadge ? `Configurado para ${contextBadge} · Revise antes de continuar` : "Gerado a partir do seu site · Revise antes de continuar"}
                  </Badge>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  {wizardQuestions.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)} disabled={busy === "ai"}>
                      <MessageSquarePlus className="h-4 w-4 mr-1" /> Refinar com mais perguntas
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={fillIdentityWithAI} disabled={busy === "ai"}>
                    {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
                    Preencher com IA
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome do agente"><Input value={form.agent_name} onChange={onInput("agent_name")} maxLength={60} /></Field>
                  <Field label="Tom">
                    <Select value={form.tone} onValueChange={(v) => set("tone", v as Form["tone"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">Direto</SelectItem>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="informal">Informal</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Missão"><Textarea value={form.mission} onChange={onInput("mission")} rows={2} placeholder="O que o Atlas faz por esta empresa." /></Field>
                <Field label="Como se apresenta"><Textarea value={form.presentation} onChange={onInput("presentation")} rows={3} placeholder="Ex.: Sou o Atlas da ACME. Cuido da execução operacional e aviso sobre bloqueios." /></Field>
                <Field label="Contexto operacional (opcional)"><Textarea value={form.operational_context} onChange={onInput("operational_context")} rows={4} maxLength={20000} placeholder="Prioridades, restrições, regras." /></Field>
              </>
            )}

            {/* 8 — Guardrails */}
            {step.id === "guardrails" && (
              <>
                <StepTitle title="Guardrails" desc="Regras que o Atlas sempre respeita. Edite as sugestões ou escreva as suas." />
                {siteFilled && <Badge className="bg-info hover:bg-info text-white">Sugerido para o seu contexto · Edite como preferir</Badge>}
                {form.guardrails.map((g, i) => (
                  <div key={i} className="space-y-1.5">
                    <Label className="text-sm">{`Guardrail ${i + 1}`}</Label>
                    <Textarea value={g.content} rows={2} onChange={(e) =>
                      set("guardrails", form.guardrails.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} />
                    {g.reason && <p className="text-xs text-muted-foreground">💡 {g.reason}</p>}
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t bg-card px-6 py-4 flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={stepIdx === 0 || busy === "next" || submitting}>Voltar</Button>
        <span className="text-xs text-muted-foreground hidden sm:block">
          {isLast ? "Revise os guardrails e ative o Atlas." : "Salvo automaticamente ao avançar."}
        </span>
        <div className="flex items-center gap-2">
          {(step.id === "github" || step.id === "vps") && !canContinueHasData(step.id, form) && (
            <Button variant="outline" onClick={skipStep} disabled={busy === "next"}>
              <SkipForward className="h-4 w-4 mr-1" /> Pular
            </Button>
          )}
          {isLast ? (
            <Button onClick={finish} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Concluir e ativar o Atlas
            </Button>
          ) : step.id === "vps" && vpsSub === "install" ? null : (
            <Button onClick={goNext} disabled={!canContinue || busy === "next"}>
              {busy === "next" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continuar
            </Button>
          )}
        </div>
      </footer>

      {/* Dialog: refinar identidade com mais perguntas */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Refinar identidade com mais perguntas</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Responda o que fizer sentido — o Atlas usa para personalizar ainda mais.</p>
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {wizardQuestions.map((q, i) => (
              <div key={i} className="space-y-1.5">
                <Label className="text-sm">{q}</Label>
                <Textarea rows={2} value={wizardAnswers[i] ?? ""} onChange={(e) => setWizardAnswers((a) => ({ ...a, [i]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWizardOpen(false)} disabled={wizardBusy}>Cancelar</Button>
            <Button onClick={runRefine} disabled={wizardBusy}>
              {wizardBusy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Refinar identidade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function canContinueHasData(id: StepId, form: Form): boolean {
  if (id === "github") return !!form.github_repo_url.trim() || !!form.github_pat.trim();
  if (id === "vps") return !!form.openclaw_workspace_url.trim() || !!form.openclaw_token.trim();
  return false;
}

function StepTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Chips({ options, selected, onToggle, multi }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => onToggle(o)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
            }`}>
            {multi && on && <Check className="inline h-3 w-3 mr-1" />}{o}
          </button>
        );
      })}
    </div>
  );
}

type TutorialLink = { href: string; label: string };
type TutorialSection = { heading?: string; steps: React.ReactNode[]; link?: TutorialLink };

function Tutorial({ title, steps, link, sections }: {
  title: string;
  steps?: React.ReactNode[];
  link?: TutorialLink;
  sections?: TutorialSection[];
}) {
  const groups: TutorialSection[] = sections ?? (steps ? [{ steps, link }] : []);
  return (
    <Collapsible className="rounded-lg border border-dashed bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
        <HelpCircle className="h-3.5 w-3.5" />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1 text-xs text-muted-foreground space-y-3">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-1">
            {g.heading && <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">{g.heading}</p>}
            <ol className="list-decimal space-y-1 pl-4">
              {g.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            {g.link && (
              <a href={g.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> {g.link.label}
              </a>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Field({ label, ok, children }: { label: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {ok === true && <CheckCircle2 className="h-4 w-4 text-success" />}
        {ok === false && <XCircle className="h-4 w-4 text-destructive" />}
      </div>
      {children}
    </div>
  );
}

function SavedHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{children}</p>;
}

function SoonNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{children}</div>;
}

function ProviderToggle({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; soon?: boolean }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" disabled={o.soon}
          onClick={() => !o.soon && onChange(o.value)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
            value === o.value ? "border-primary bg-primary/5 font-medium" : "border-border"
          } ${o.soon ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"}`}>
          {o.label}{o.soon && <Badge variant="secondary" className="ml-2 text-[10px]">Em breve</Badge>}
        </button>
      ))}
    </div>
  );
}

function ModeToggle({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
            value === o.value ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
