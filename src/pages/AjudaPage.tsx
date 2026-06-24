import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Search, Info, AlertTriangle } from "lucide-react";

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info">
      <Info className="h-4 w-4 mt-0.5 shrink-0" /> <div>{children}</div>
    </div>
  );
}

function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <div>{children}</div>
    </div>
  );
}

function ArchDiagram() {
  const Box = ({ title, sub }: { title: string; sub: string }) => (
    <div className="rounded-xl border bg-card px-4 py-3 text-center min-w-[140px]">
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 my-3">
      <Box title="Painel" sub="Lovable (configuração)" />
      <span className="text-muted-foreground">→</span>
      <Box title="GitHub" sub="Repo privado de skills do cliente" />
      <span className="text-muted-foreground">→</span>
      <Box title="Atlas" sub="OpenClaw na VPS Hostinger" />
    </div>
  );
}

interface Section {
  id: string;
  num: string;
  title: string;
  keywords: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "como-funciona", num: "01", title: "Como funciona",
    keywords: "como funciona visão geral backlog notion discord executa rotinas",
    body: (
      <>
        <p>O Atlas é um agente autônomo de operações. Ele lê o backlog de tarefas no Notion, executa rotinas
        (inclusive em sistemas sem API, via navegador no OpenClaw) e mantém o time informado pelo Discord.</p>
        <p className="mt-2">Você configura o comportamento dele no painel (Cérebro), conecta suas ferramentas em Integrações,
        e acompanha tudo em tempo real no Dashboard.</p>
        <InfoBox>As credenciais e o custo de execução ficam na sua conta — o Atlas usa a sua chave da Anthropic, o seu Notion e o seu Discord.</InfoBox>
      </>
    ),
  },
  {
    id: "arquitetura", num: "02", title: "Arquitetura",
    keywords: "arquitetura vps openclaw cérebro agent_config skills github painel",
    body: (
      <>
        <p>São três peças:</p>
        <ArchDiagram />
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong>Painel (Lovable):</strong> onde você configura o Cérebro e monitora o Atlas.</li>
          <li><strong>GitHub (repo do cliente):</strong> ao clicar "Sincronizar tudo", o Cérebro é compilado em arquivos de skill (identity.md, guardrails.md, system_prompt.md, knowledge/, skills/) e <strong>commitado no seu repositório privado</strong>.</li>
          <li><strong>Atlas (VPS):</strong> a instância OpenClaw na sua VPS puxa o repo (~2min) e executa as tarefas.</li>
        </ul>
        <InfoBox>Um repositório privado por cliente. O PAT é seu, guardado no Vault — o Atlas commita só no seu repo, isolamento total.</InfoBox>
      </>
    ),
  },
  {
    id: "dados-seguranca", num: "03", title: "Dados e segurança",
    keywords: "dados segurança vault credenciais criptografia retenção logs",
    body: (
      <>
        <p>Todas as credenciais (Anthropic, OpenClaw, Notion, Discord) são guardadas criptografadas no Supabase Vault — nunca em texto puro.</p>
        <p className="mt-2">Cada empresa só enxerga os próprios dados (isolamento por RLS).</p>
        <WarnBox>Logs de execução e histórico de tarefas e conversas são retidos para sempre — nunca deletados automaticamente.</WarnBox>
      </>
    ),
  },
  {
    id: "permissoes", num: "04", title: "Permissões e membros",
    keywords: "permissões membros pode dar ordens notificações aprovações somente leitura discord",
    body: (
      <>
        <p>Em <strong>Time &amp; Canais</strong> você define quem é quem e o que cada pessoa pode pedir ao Atlas. São quatro níveis:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
          <li><strong>Pode dar ordens</strong> — aciona o agente diretamente.</li>
          <li><strong>Recebe notificações</strong> — é avisado de conclusões/alertas.</li>
          <li><strong>Autoriza aprovações</strong> — pode aprovar rotinas solicitadas.</li>
          <li><strong>Somente leitura</strong> — acompanha sem acionar.</li>
        </ul>
        <WarnBox>Um membro sem "Pode dar ordens" que tentar acionar o Atlas recebe uma resposta educada de que não está autorizado — nunca é ignorado em silêncio, e o admin é avisado no painel.</WarnBox>
      </>
    ),
  },
  {
    id: "rotinas", num: "05", title: "Rotinas",
    keywords: "rotinas recorrentes aprovação pausar ativar frequência",
    body: (
      <>
        <p>Rotinas são tarefas recorrentes (diárias, semanais ou mensais). O admin cria rotinas no painel — elas já entram ativas.</p>
        <p className="mt-2">Membros autorizados podem <em>solicitar</em> uma rotina pelo Discord; ela fica em "Aguardando aprovação" até um admin ou aprovador liberar.</p>
        <InfoBox>Nenhuma rotina é ativada sem aprovação. Rotinas ativas podem ser pausadas a qualquer momento direto na lista.</InfoBox>
      </>
    ),
  },
  {
    id: "conhecimento", num: "06", title: "Base de conhecimento",
    keywords: "conhecimento arquivos upload fontes notion discord indexação ativar",
    body: (
      <>
        <p>No Cérebro → Conhecimento você descreve o contexto operacional, envia arquivos (SOPs, organogramas, processos) e ativa fontes automáticas (Notion, Discord).</p>
        <WarnBox>Nenhuma fonte ou arquivo é usado pelo Atlas sem ativação explícita — cada item tem um interruptor próprio.</WarnBox>
      </>
    ),
  },
  {
    id: "relatorios", num: "07", title: "Relatórios e histórico",
    keywords: "relatórios daily report histórico canais tendência taxa de sucesso enviar agora",
    body: (
      <>
        <p>O Atlas envia relatórios automáticos (briefing matinal, checkpoint e relatório diário) no canal configurado. Você pode forçar um envio a qualquer momento em <strong>Relatórios → Enviar relatório agora</strong>.</p>
        <p className="mt-2">Em <strong>Conversar → Histórico de canais</strong> fica o registro de tudo que o Atlas recebeu e respondeu nos canais externos, com filtros por canal, data e tipo.</p>
      </>
    ),
  },
  {
    id: "faq", num: "08", title: "Perguntas frequentes",
    keywords: "faq perguntas o que é openclaw bloqueio captcha como adicionar membro aprovar rotina",
    body: (
      <>
        <p className="font-medium">O que é o OpenClaw?</p>
        <p className="text-sm text-muted-foreground mb-3">É o "braço executor" do Atlas: um ambiente na sua VPS que navega em sistemas web e preenche formulários mesmo sem API.</p>
        <p className="font-medium">O Atlas pode travar numa tarefa?</p>
        <p className="text-sm text-muted-foreground mb-3">Não em silêncio. Ao encontrar um bloqueio (CAPTCHA, campo faltando, permissão negada), a tarefa vai para "Bloqueado" com o motivo, e o canal de alertas é avisado na hora.</p>
        <p className="font-medium">Como adiciono um membro ou aprovo uma rotina?</p>
        <p className="text-sm text-muted-foreground">Membros: Time &amp; Canais → "Adicionar membro". Rotinas: a seção "Aguardando aprovação" em Rotinas.</p>
      </>
    ),
  },
];

const SUGGESTIONS = ["como adicionar membro", "como aprovar rotina", "o que é OpenClaw"];

export default function AjudaPage() {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => (s.title + " " + s.keywords).toLowerCase().includes(q));
  }, [query]);

  return (
    <AppShell>
      <div className="max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Central de ajuda</p>
          <h1 className="text-3xl font-bold">Como o Atlas funciona</h1>
          <p className="text-sm text-muted-foreground mt-1">Um guia honesto e completo da plataforma — escrito para gestores, sem jargão desnecessário.</p>
        </header>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar na ajuda…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setQuery(s)} className="text-xs rounded-full border px-3 py-1 hover:bg-muted transition-colors">{s}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar interna */}
          <nav className="hidden md:block w-56 shrink-0">
            <ul className="sticky top-4 space-y-1 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors">
                    <span className="text-muted-foreground tabular-nums">{s.num}</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Conteúdo */}
          <div className="flex-1 space-y-8 min-w-0">
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada encontrado para "{query}".</p>
            ) : visible.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-20">
                <h2 className="text-xl font-semibold mb-2"><span className="text-muted-foreground tabular-nums mr-2">{s.num}</span>{s.title}</h2>
                <div className="text-sm leading-relaxed space-y-1">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
