import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Info, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEMO_NAME = "Demo Atlas";

const DEMO_SOUL = `Você é o Atlas. Direto, eficiente, focado em entrega.\nFala em português do Brasil. Toma decisões com poucas hipóteses.`;
const DEMO_AGENTS = `Fluxo padrão:\n1. Lê backlog.\n2. Prioriza por urgência × impacto.\n3. Executa o que está claro; escala o ambíguo; bloqueia o impossível.`;
const DEMO_USER = `Empresa de demonstração.\nPrioridades: shipar produto, manter clientes felizes, evitar débito técnico.`;

const DEMO_TASKS = [
  { title: "Atualizar README do projeto", status: "done", priority: "medium", result: "README revisado e republicado." },
  { title: "Configurar pipeline de CI", status: "doing", priority: "high" },
  { title: "Auditar permissões do Supabase", status: "todo", priority: "high" },
  { title: "Documentar API pública", status: "todo", priority: "medium" },
  { title: "Resolver bug de export CSV", status: "blocked", priority: "high", result: "Aguardando dataset do cliente." },
  { title: "Refatorar componente de tabela", status: "done", priority: "low", result: "Componente extraído e testado." },
];

const DEMO_LOGS = [
  { type: "briefing", content: "Bom dia! Hoje temos 4 tarefas no radar do Atlas." },
  { type: "action", content: "Atualizei o README com a nova arquitetura." },
  { type: "action", content: "Iniciei configuração do pipeline de CI." },
  { type: "error", content: "Falha temporária ao acessar o Notion. Tentando novamente." },
  { type: "report", content: "Checkpoint do meio-dia: 1 concluída, 1 em curso, 1 bloqueada." },
];

const DEMO_REPORT_CONTENT = `**Relatório diário — Demo Atlas**

✅ Concluído hoje:
- Atualizar README do projeto
- Refatorar componente de tabela

🟡 Em curso:
- Configurar pipeline de CI

⛔ Bloqueio:
- Bug de export CSV — aguardando dataset

➡️ Próximos passos:
- Revisar PR de CI antes do fim do dia.`;

export default function DemonstrationSettings() {
  const [demoCompanyId, setDemoCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const { data } = await sb.from("companies").select("id").eq("name", DEMO_NAME).maybeSingle();
      setDemoCompanyId(data?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const loadDemo = async () => {
    setWorking(true);
    try {
      const sb: any = supabase;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Faça login"); return; }

      const { data: company, error: cErr } = await sb
        .from("companies")
        .insert({ name: DEMO_NAME, owner_id: user.id })
        .select("id").single();
      if (cErr || !company) throw new Error(cErr?.message ?? "Falha ao criar empresa demo");

      const companyId = company.id;

      await sb.from("agent_config").insert({
        company_id: companyId,
        soul_md: DEMO_SOUL,
        agents_md: DEMO_AGENTS,
        user_md: DEMO_USER,
        morning_briefing_time: "08:00",
        checkpoint_time: "12:00",
        daily_report_time: "18:00",
        timezone: "America/Sao_Paulo",
        is_active: true,
        notion_database_id: "demo-notion-db",
        discord_channel_id: "demo-channel",
        openclaw_workspace_url: "https://demo.openclaw.local",
      });

      await sb.from("tasks").insert(DEMO_TASKS.map((t, i) => ({
        company_id: companyId,
        notion_task_id: `demo-${i + 1}`,
        title: t.title,
        status: t.status,
        priority: t.priority,
        result: t.result ?? null,
        completed_at: t.status === "done" ? new Date().toISOString() : null,
      })));

      await sb.from("execution_logs").insert(DEMO_LOGS.map((l) => ({
        company_id: companyId,
        type: l.type,
        content: l.content,
      })));

      await sb.from("reports").insert({
        company_id: companyId,
        type: "daily",
        content: DEMO_REPORT_CONTENT,
        tasks_done: 2,
        tasks_doing: 1,
        tasks_blocked: 1,
        sent_to_discord: false,
      });

      setDemoCompanyId(companyId);
      toast.success("Dados de demonstração carregados!");
    } catch (e: any) {
      toast.error(`Falha: ${e?.message ?? e}`);
    } finally {
      setWorking(false);
    }
  };

  const clearDemo = async () => {
    if (!demoCompanyId) return;
    setWorking(true);
    const { error } = await (supabase as any)
      .from("companies").delete().eq("id", demoCompanyId);
    setWorking(false);
    if (error) { toast.error(`Falha ao limpar: ${error.message}`); return; }
    setDemoCompanyId(null);
    toast.success("Dados de demonstração removidos.");
  };

  const hasDemo = !!demoCompanyId;

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Cria uma empresa fictícia <strong>{DEMO_NAME}</strong> com tarefas, logs e relatório
          para você visualizar o dashboard. Não cria credenciais reais no Vault.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Dados de demonstração
              </CardTitle>
              <CardDescription className="text-sm">
                {loading ? "Verificando estado..." :
                  hasDemo ? "Empresa demo carregada — abra o dashboard para visualizar." : "Sem dados de demonstração."}
              </CardDescription>
            </div>
            {!loading && (hasDemo
              ? <Badge className="bg-success/100 hover:bg-success/100">Carregados</Badge>
              : <Badge variant="secondary">Sem dados</Badge>)}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={loadDemo} disabled={working || loading || hasDemo}>
            {working && !hasDemo && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Carregar dados de demonstração
          </Button>
          <Button
            variant="outline"
            onClick={clearDemo}
            disabled={working || loading || !hasDemo}
            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            {working && hasDemo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Remover dados de demonstração
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
