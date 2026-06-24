import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GeneralSettings from "@/components/settings/GeneralSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";
import TeamSettings from "@/components/settings/TeamSettings";
import DemonstrationSettings from "@/components/settings/DemonstrationSettings";
import OnboardingSettings from "@/components/settings/OnboardingSettings";
import CredentialsSettings from "@/components/settings/CredentialsSettings";
import AgentSettings from "@/components/settings/AgentSettings";
import ScheduleSettings from "@/components/settings/ScheduleSettings";
import IntegrationsSettings from "@/components/settings/IntegrationsSettings";
import { useAuth } from "@/hooks/useAuth";

// Abas: Conta · Equipe · Integrações · Credenciais · Instância · Segurança · Demonstração.
const VALID_TABS = ["conta", "equipe", "integracoes", "credenciais", "instancia", "seguranca", "demonstracao"] as const;
type Tab = (typeof VALID_TABS)[number];

// Mantém URLs antigas (/settings/team, /settings/agent, …) funcionando após a reorg.
const LEGACY_TABS: Record<string, Tab> = {
  general: "conta",
  onboarding: "conta",
  team: "equipe",
  integrations: "integracoes",
  credentials: "credenciais",
  agent: "instancia",
  schedule: "instancia",
  security: "seguranca",
  demonstration: "demonstracao",
};

const TAB_META: Record<Tab, { title: string; description: string }> = {
  conta:        { title: "Conta",        description: "Dados da empresa, fuso horário, tema e onboarding." },
  equipe:       { title: "Equipe",       description: "Usuários do painel, permissões e status." },
  integracoes:  { title: "Integrações", description: "Notion, Discord e OpenClaw — IDs e URLs (tokens ficam em Credenciais)." },
  credenciais:  { title: "Credenciais", description: "Chaves de API do Claude, OpenClaw, Notion e Discord. Armazenadas no Supabase Vault." },
  instancia:    { title: "Instância",   description: "Comportamento do agente (SOUL/AGENTS/USER) e horários da instância." },
  seguranca:    { title: "Segurança",   description: "Restrição de cadastro por domínio e configurações de acesso." },
  demonstracao: { title: "Demonstração", description: "Carregar ou remover dados de demonstração." },
};

function getTabFromPath(pathname: string): Tab {
  const segment = pathname.replace(/^\/settings\/?/, "").split("/")[0];
  if ((VALID_TABS as readonly string[]).includes(segment)) return segment as Tab;
  if (segment in LEGACY_TABS) return LEGACY_TABS[segment];
  return "conta";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeTab = getTabFromPath(pathname);
  const meta = TAB_META[activeTab];

  const handleChange = (value: string) => {
    navigate(value === "conta" ? "/settings" : `/settings/${value}`);
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>
        <Tabs value={activeTab} onValueChange={handleChange}>
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="conta">Conta</TabsTrigger>
            {isAdmin && <TabsTrigger value="equipe">Equipe</TabsTrigger>}
            {isAdmin && <TabsTrigger value="integracoes">Integrações</TabsTrigger>}
            {isAdmin && <TabsTrigger value="credenciais">Credenciais</TabsTrigger>}
            {isAdmin && <TabsTrigger value="instancia">Instância</TabsTrigger>}
            {isAdmin && <TabsTrigger value="seguranca">Segurança</TabsTrigger>}
            {isAdmin && <TabsTrigger value="demonstracao">Demonstração</TabsTrigger>}
          </TabsList>
          <div className="mt-6 mb-4">
            <h2 className="text-xl font-semibold tracking-tight">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>

          <TabsContent value="conta" className="space-y-8">
            <GeneralSettings />
            <Section title="Refazer onboarding"><OnboardingSettings /></Section>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="equipe">
              <TeamSettings />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="integracoes">
              <IntegrationsSettings />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="credenciais">
              <CredentialsSettings />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="instancia" className="space-y-8">
              <Section title="Comportamento do agente"><AgentSettings /></Section>
              <Section title="Horários"><ScheduleSettings /></Section>
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="seguranca">
              <SecuritySettings />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="demonstracao">
              <DemonstrationSettings />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
