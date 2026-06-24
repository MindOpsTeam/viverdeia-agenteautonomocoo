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

// Estrutura-alvo do /docs (BUILD §9): 4 abas.
const VALID_TABS = ["conta", "integracoes", "credenciais", "instancia"] as const;
type Tab = (typeof VALID_TABS)[number];

// Mantém URLs antigas (/settings/team, /settings/agent, …) funcionando após a reorg.
const LEGACY_TABS: Record<string, Tab> = {
  general: "conta",
  security: "conta",
  team: "conta",
  demonstration: "conta",
  onboarding: "conta",
  integrations: "integracoes",
  credentials: "credenciais",
  agent: "instancia",
  schedule: "instancia",
};

const TAB_META: Record<Tab, { title: string; description: string }> = {
  conta:       { title: "Conta",        description: "Conta, equipe do painel, segurança e dados de demonstração." },
  integracoes: { title: "Integrações", description: "Notion, Discord e OpenClaw — IDs e URLs (tokens ficam em Credenciais)." },
  credenciais: { title: "Credenciais", description: "Chaves de API do Claude, OpenClaw, Notion e Discord. Armazenadas no Supabase Vault." },
  instancia:   { title: "Instância",   description: "Comportamento do agente (SOUL/AGENTS/USER) e horários da instância." },
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
        <h1 className="text-3xl font-bold">Configurações</h1>
        <Tabs value={activeTab} onValueChange={handleChange}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="conta">Conta</TabsTrigger>
            {isAdmin && <TabsTrigger value="integracoes">Integrações</TabsTrigger>}
            {isAdmin && <TabsTrigger value="credenciais">Credenciais</TabsTrigger>}
            {isAdmin && <TabsTrigger value="instancia">Instância</TabsTrigger>}
          </TabsList>
          <div className="mt-6 mb-4">
            <h2 className="text-xl font-semibold">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>

          <TabsContent value="conta" className="space-y-8">
            <GeneralSettings />
            {isAdmin && <Section title="Segurança"><SecuritySettings /></Section>}
            {isAdmin && <Section title="Equipe do painel"><TeamSettings /></Section>}
            {isAdmin && <Section title="Demonstração"><DemonstrationSettings /></Section>}
            {isAdmin && <Section title="Onboarding"><OnboardingSettings /></Section>}
          </TabsContent>

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
        </Tabs>
      </div>
    </AppShell>
  );
}
