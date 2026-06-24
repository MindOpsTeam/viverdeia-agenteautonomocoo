// Seed do Modo Demonstração — ACME Ltda (e-commerce de materiais de construção).
// Tudo em memória, somente leitura. Nenhuma escrita no banco.

export interface DemoTask {
  id: string; title: string; status: "todo" | "doing" | "done" | "blocked";
  priority: "high" | "medium" | "low"; source: string; assigned_to: string;
  is_adhoc?: boolean; block_reason?: string;
}
export interface DemoRoutine { id: string; name: string; frequency: "daily" | "weekly" | "monthly"; schedule: string; target: string; status: "active" | "paused"; last: string }
export interface DemoMember { id: string; name: string; handle: string; channel: "discord" | "slack"; role: string; permissions: string[] }
export interface DemoChannel { name: string; platform: string; purposes: string[]; mentions: string[] }
export interface DemoProcess { id: string; name: string; area: string; visibility: "admin" | "authorized_team" | "everyone"; steps: { description: string; responsible: string; sla: string }[] }
export interface DemoMessage { id: string; channel: string; sender: string; type: "command" | "response" | "report" | "alert"; content: string; at: string }
export interface DemoSuggestion { id: string; process_id: string; description: string; count: number }

export const DEMO = {
  company: "ACME Ltda",
  user: "Rafael",
  agent: {
    name: "Atlas",
    tone: "Tom Direto",
    mission: "Manter a operação do e-commerce rodando sozinha: backlog em dia, estoque reposto e o time avisado.",
    presentation: "Sou o Atlas da ACME. Cuido da execução operacional e te aviso na hora sobre qualquer bloqueio.",
    audience: "Construtoras e revendas de materiais de construção no Sudeste.",
  },
  github: { repoUrl: "https://github.com/acme/atlas-skills", commit: "a1b2c3d", version: "v.2026.06.23-acme" },

  tasks: [
    { id: "t1", title: "Atualizar planilha de custos no ERP", status: "done", priority: "medium", source: "notion", assigned_to: "coo" },
    { id: "t2", title: "Extrair relatório semanal de vendas", status: "done", priority: "high", source: "notion", assigned_to: "coo" },
    { id: "t3", title: "Preencher compliance no portal do Fornecedor X", status: "doing", priority: "high", source: "notion", assigned_to: "coo" },
    { id: "t4", title: "Repor estoque de cimento CP-II", status: "done", priority: "high", source: "routine", assigned_to: "coo" },
    { id: "t5", title: "Conferir pedidos B2B pendentes", status: "todo", priority: "medium", source: "notion", assigned_to: "coo" },
    { id: "t6", title: "Relatório mensal de operações", status: "blocked", priority: "high", source: "discord", assigned_to: "coo", is_adhoc: true, block_reason: "Aguardando resolução de CAPTCHA no portal." },
    { id: "t7", title: "Atualizar preços de argamassa", status: "todo", priority: "medium", source: "notion", assigned_to: "coo" },
    { id: "t8", title: "Revisar contratos Q2", status: "todo", priority: "low", source: "notion", assigned_to: "Rafael Milagre" },
    { id: "t9", title: "Postar resumo semanal no Discord", status: "done", priority: "low", source: "routine", assigned_to: "coo" },
    { id: "t10", title: "Baixar NF-e do fornecedor Y", status: "doing", priority: "medium", source: "notion", assigned_to: "coo" },
    { id: "t11", title: "Verificar inadimplência", status: "blocked", priority: "high", source: "routine", assigned_to: "coo", block_reason: "Acesso negado ao módulo financeiro do ERP." },
    { id: "t12", title: "Cadastrar novos SKUs de telha", status: "todo", priority: "low", source: "notion", assigned_to: "coo" },
  ] as DemoTask[],

  routines: [
    { id: "r1", name: "Relatório diário de operações", frequency: "daily", schedule: "Diária · 18h", target: "Discord", status: "active", last: "hoje ✓" },
    { id: "r2", name: "Verificação semanal de SLA de fornecedores", frequency: "weekly", schedule: "Semanal · seg 9h", target: "Portal fornecedor", status: "active", last: "há 2 dias ✓" },
    { id: "r3", name: "Backup de métricas no Notion", frequency: "daily", schedule: "Diária · 7h", target: "Notion", status: "active", last: "hoje ✓" },
    { id: "r4", name: "Relatório de inadimplência", frequency: "monthly", schedule: "Mensal · dia 1", target: "ERP", status: "paused", last: "—" },
  ] as DemoRoutine[],

  members: [
    { id: "m1", name: "Rafael Milagre", handle: "@rafael", channel: "discord", role: "Fundador", permissions: ["can_command", "authorizes_approvals"] },
    { id: "m2", name: "Ana Lima", handle: "@ana", channel: "discord", role: "Gerente de Ops", permissions: ["can_command", "receives_notifications"] },
    { id: "m3", name: "Bruno Costa", handle: "@bruno", channel: "discord", role: "Financeiro", permissions: ["authorizes_approvals"] },
    { id: "m4", name: "Mariana Souza", handle: "@mariana", channel: "slack", role: "Analista", permissions: ["readonly"] },
  ] as DemoMember[],

  channels: [
    { name: "#operacoes", platform: "discord", purposes: ["receive_commands", "alerts"], mentions: ["Todos os membros"] },
    { name: "#relatorios", platform: "discord", purposes: ["send_reports"], mentions: ["Ana Lima", "Rafael Milagre"] },
    { name: "#financeiro", platform: "discord", purposes: ["notifications"], mentions: ["Bruno Costa", "Rafael Milagre"] },
  ] as DemoChannel[],

  processes: [
    { id: "p1", name: "Fechamento de caixa", area: "Financeiro", visibility: "admin", steps: [
      { description: "Conferir as vendas do dia no ERP", responsible: "Bruno Costa", sla: "até 17h" },
      { description: "Conciliar com o extrato bancário", responsible: "Bruno Costa", sla: "30min" },
      { description: "Registrar o fechamento no ERP", responsible: "Atlas", sla: "" },
      { description: "Enviar resumo no #financeiro", responsible: "Atlas", sla: "" },
    ] },
    { id: "p2", name: "Reposição de estoque", area: "Operações", visibility: "everyone", steps: [
      { description: "Verificar itens abaixo do nível mínimo", responsible: "Atlas", sla: "diário" },
      { description: "Gerar pedido ao fornecedor", responsible: "Ana Lima", sla: "24h" },
      { description: "Registrar a previsão de entrega no Notion", responsible: "Atlas", sla: "" },
    ] },
    { id: "p3", name: "Atendimento de pedido B2B", area: "Comercial", visibility: "authorized_team", steps: [
      { description: "Validar o cadastro do cliente", responsible: "Ana Lima", sla: "2h" },
      { description: "Confirmar disponibilidade dos itens", responsible: "Atlas", sla: "" },
      { description: "Emitir a proposta comercial", responsible: "Ana Lima", sla: "4h" },
      { description: "Registrar o pedido no Notion", responsible: "Atlas", sla: "" },
    ] },
  ] as DemoProcess[],

  messages: [
    { id: "c1", channel: "#operacoes", sender: "@ana", type: "command", content: "/executa", at: "há 8 min" },
    { id: "c2", channel: "#operacoes", sender: "agent", type: "response", content: "▶️ Executando: Preencher compliance no portal do Fornecedor X.", at: "há 8 min" },
    { id: "c3", channel: "#financeiro", sender: "agent", type: "alert", content: "⛔ Verificar inadimplência bloqueada: acesso negado ao módulo financeiro.", at: "há 1 h" },
    { id: "c4", channel: "#relatorios", sender: "agent", type: "report", content: "📊 Relatório diário: 4 concluídas, 2 em curso, 2 bloqueadas.", at: "há 3 h" },
    { id: "c5", channel: "#operacoes", sender: "@bruno", type: "command", content: "/status", at: "ontem" },
  ] as DemoMessage[],

  suggestions: [
    { id: "s1", process_id: "p1", description: "Obter aprovação do Rafael para diferenças de caixa acima de R$ 500.", count: 4 },
    { id: "s2", process_id: "p2", description: "Confirmar o prazo de entrega com o fornecedor antes de registrar a previsão.", count: 3 },
  ] as DemoSuggestion[],

  guardrails: [
    "Nunca aprovar pagamento acima de R$ 5.000 sem o Rafael.",
    "Sempre confirmar o destinatário antes de enviar e-mail a cliente.",
  ],

  reports: [
    { id: "rep1", date: "Hoje, 18:00", done: 4, doing: 2, blocked: 2, content: "**Resumo:** dia produtivo. 4 tarefas concluídas, com 2 bloqueios que precisam de você.\n\n✅ Concluído: planilha de custos, relatório de vendas, reposição de cimento, resumo no Discord.\n⛔ Bloqueado: relatório mensal (CAPTCHA), inadimplência (acesso negado)." },
    { id: "rep2", date: "Ontem, 18:00", done: 6, doing: 1, blocked: 0, content: "**Resumo:** operação fluindo, sem bloqueios. 6 tarefas concluídas." },
    { id: "rep3", date: "Há 2 dias, 18:00", done: 5, doing: 2, blocked: 1, content: "**Resumo:** 5 concluídas, 1 bloqueio resolvido no mesmo dia." },
  ],

  trend: [
    { date: "17/06", concluidas: 5, taxa: 83 },
    { date: "18/06", concluidas: 6, taxa: 100 },
    { date: "19/06", concluidas: 4, taxa: 80 },
    { date: "20/06", concluidas: 7, taxa: 88 },
    { date: "21/06", concluidas: 6, taxa: 86 },
    { date: "22/06", concluidas: 6, taxa: 100 },
    { date: "23/06", concluidas: 4, taxa: 67 },
  ],
};

export function demoGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
