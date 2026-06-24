# PRD — Agent COO (Agente Autônomo Chief Operations Officer)

**Versão:** 2.0 — incorpora mapeamento de reuso da base Nina (sure-shot)
**Stack confirmada:** Vite + React + Supabase + OpenClaw (cérebro na VPS do cliente) + DS Viver de IA

---

## 1. Visão Geral

O Agent COO é um agente de software autônomo que atua como braço direito executivo de fundadores e gestores de operação. Ele lê o backlog de tarefas da empresa (Notion/Asana), executa rotinas operacionais — inclusive em sistemas sem API, via navegador — e mantém o time informado por Discord/Slack, sem que o gestor precise microgerenciar.

A solução reaproveita a arquitetura já validada do agente Nina (modelo single-tenant: 1 remix por cliente + 1 instância OpenClaw na VPS do cliente), trocando o domínio de "atendimento via WhatsApp" por "operações via Notion/Asana + Discord/Slack".

---

## 2. Personas

- **CEO/Fundador**: precisa delegar execução operacional e ter visibilidade sem microgerenciar.
- **Gerente de Operações**: usa o agente para garantir que rotinas diárias/semanais sejam cumpridas sem falha humana.
- **Time operacional**: recebe comandos e relatórios do agente no canal de comunicação do dia a dia (Discord/Slack), sem precisar abrir o painel.

---

## 3. Mapeamento de Reuso (base Nina → Agent COO)

Esta seção existe para orientar o Claude Code na Etapa 4 do pipeline. Tudo que não está listado como "Trocar" é reuso direto.

### 3.1 Reuso direto (sem alteração estrutural)
| Componente da base Nina | Função no Agent COO |
|---|---|
| Painel `/cerebro` completo (`KeysStep`, `TrainBlock`, `InstallBlock`, `ActivateBlock`, `StatusPanel`, `TestBlock`) | Mantido 1:1 — é o painel de configuração do cérebro OpenClaw |
| Edge Functions de orquestração: `heartbeat`, `brain-build`, `instance-register`, `provision-secrets`, `validate-anthropic-key`, `validate-github-pat`, `reap-orphan-runs`, `setup-installer`, `secrets-status`, `save-secret`, `save-github-token` | Reuso direto — infraestrutura genérica de qualquer agente OpenClaw |
| Modelo de skill versionada no GitHub (branch dedicado, sync ~2min via `brain_sync.sh`) | Reuso direto — só muda o conteúdo da skill (ver 3.2) |
| `Auth.tsx`, `ProtectedRoute.tsx`, `Sidebar.tsx`, `Settings.tsx`, `ErrorBoundary.tsx`, `SystemHealthCard.tsx` | Reuso direto — shell de produto |
| Scripts da VPS (`heartbeat.sh`, `_shared.sh`, `brain_sync.sh`) | Reuso direto — agnósticos ao domínio |
| Modelo de Vault/Supabase para credenciais (Anthropic key, GitHub PAT) | Reuso direto |

### 3.2 Trocar (específico de domínio)
| Componente Nina (vendas/agendamento via WhatsApp) | Vira no Agent COO (operações via Notion/Asana + Discord/Slack) |
|---|---|
| `skills/nina/identity/identity.md` + `soul.md` | `skills/agent-coo/identity/identity.md` — persona de COO: tom direto, foco em execução e clareza de status |
| `openclaw-skills/agendar`, `cancelar`, `reagendar` | `openclaw-skills/ler-backlog`, `atualizar-status`, `executar-rotina-browser`, `postar-relatorio` |
| `whatsapp-webhook`, `whatsapp-sender`, `test-whatsapp-message` | `discord-webhook`/`slack-webhook`, `discord-sender`/`slack-sender` |
| `nina-orchestrator`, `nina-reply` | `coo-orchestrator`, `coo-reply` |
| `Kanban.tsx`, `Scheduling.tsx` (pipeline de vendas/agenda) | `Backlog.tsx` (board de tarefas sincronizado com Notion/Asana) |
| `Contacts.tsx`, `CreateDealModal.tsx`, `LostReasonModal.tsx`, `PipelineSettingsModal.tsx` | Não se aplicam — removidos ou substituídos por `RoutinesConfig.tsx` (configuração de rotinas recorrentes) |
| `skill-packs/pesquisa-empresa`, `tratamento-objecoes` | Não se aplicam — substituídos por skill-packs de operação (ex.: "extração de relatórios sem API", "preenchimento de formulários internos") |
| `ChatInterface.tsx` (conversa com lead) | Reaproveitado como `ActivityFeed.tsx` — não é chat com cliente, é o "pensamento" do agente em tempo real (o que está executando agora) |
| Tabela `contacts` / `client_memory` (perfil de lead) | Vira `team_members` + `company_context` (diretrizes da empresa, não perfil de cliente) |
| Onboarding voltado a "conectar WhatsApp" | Onboarding voltado a "conectar Notion/Asana + Discord/Slack" |

### 3.3 Decisão confirmada
Reuso da base é a abordagem correta: reduz risco (infra já auditada) e acelera entrega (pula etapas de auth, vault, heartbeat, brain-sync que já funcionam em produção).

---

## 4. Escopo de Funcionalidades

### 4.1 Gestão de Backlog e Tarefas
- Sincronização bidirecional com Notion (MVP) e Asana (fase 2).
- Identificação automática de tarefas marcadas/atribuídas ao "Agent COO".
- Atualização de status (To-Do → Doing → Done / Bloqueado) conforme a execução progride.
- Regra de negócio: o agente só altera o status de uma tarefa após confirmar a ação correspondente (ex.: só marca "Done" depois de validar que o formulário foi de fato preenchido, não apenas tentado).

### 4.2 Execução Autônoma (Browser-based via OpenClaw)
- Navegação em sistemas web sem API estruturada.
- Extração de dados e preenchimento de campos conforme instrução registrada na tarefa do Notion.
- Regra de negócio: toda ação que envolva escrita/submissão em sistema externo deve ser logada com print/snapshot do resultado antes de marcar a tarefa como concluída.
- Regra de negócio: se o agente encontrar um bloqueio (CAPTCHA, campo obrigatório não informado, permissão negada), a tarefa vai para status "Bloqueado" — nunca fica presa em "Doing" silenciosamente.

### 4.3 Comunicação e Relatórios
- Interface conversacional via Discord/Slack para envio de novas demandas em linguagem natural.
- Relatório diário (Daily Report) resumindo: tarefas concluídas, em andamento, bloqueadas, e próximos passos.
- Regra de negócio: todo bloqueio gera notificação imediata no canal — não espera o relatório diário.
- Tempo de resposta a comandos via Discord/Slack: inferior a 30 segundos (critério de sucesso herdado do PRD original).

### 4.4 Aprendizado Contínuo do Cérebro (Treinar 2.0)
A aba Treinar, no modelo original (texto livre em 3 blocos), resolve o setup inicial mas cria atrito no uso diário: o usuário precisa lembrar do erro, traduzir em regra e escrever manualmente — não há loop de feedback. Para resolver isso, a aba Treinar ganha dois mecanismos:

- **Sugestão automática de diretriz**: sempre que uma tarefa for marcada como "Bloqueada" ou o usuário corrigir manualmente uma ação do agente, o sistema analisa o evento e propõe uma nova diretriz em linguagem natural, com aprovação em 1 clique (Aceitar / Editar / Descartar). A diretriz aceita é adicionada automaticamente à lista de "Diretrizes da Empresa" e entra no próximo "Sincronizar cérebro".
- **Chat de treino**: em vez de exigir que o usuário formule a regra formalmente, ele pode descrever o que aconteceu em linguagem natural (ex.: "ele mandou e-mail pro cliente errado ontem") em um campo de chat; a IA reformula isso como diretriz estruturada e a apresenta para confirmação antes de adicionar à lista.

Regra de negócio: nenhuma diretriz é adicionada automaticamente sem confirmação do usuário — o sistema sempre sugere, nunca aplica direto. Isso preserva o controle humano sobre o comportamento do agente.

### 4.5 Monitoramento (Dashboard Lovable)
- Painel com a "mente" do agente: o que está pensando agora, qual tarefa está executando, histórico de sucesso/falha.
- Substitui o `ChatInterface.tsx` da Nina por um `ActivityFeed.tsx` — feed de raciocínio/ação em tempo real, não conversa com lead.
- Painel `/cerebro` (reuso direto) para configurar credenciais, treinar identidade/diretrizes da empresa, instalar e ativar a instância OpenClaw na VPS.

---

### 4.6 Onboarding de Configuração
O setup completo do agente envolve 5 etapas espalhadas em 2 telas diferentes (Cérebro → Chaves/Treinar/Instalar/Ativar, e Integrações). Sem um fluxo guiado, o usuário precisa descobrir sozinho que existem essas telas e em que ordem visitá-las. Para resolver isso:

- **Wizard de tela cheia no primeiro login**: conduz o usuário, passo a passo, por tudo que é necessário para a solução funcionar: Chaves → Integrações (Notion/Asana/Discord/Slack) → Treinar (identidade/diretrizes iniciais) → Instalar (VPS) → Ativar. Cada etapa do wizard navega de fato para a tela real correspondente (não é uma simulação separada) — ao concluir uma etapa, o sistema retorna ao wizard para a próxima.
- **Banner/checklist persistente no Dashboard**: se o usuário sair do wizard antes de concluir todas as etapas, um banner fixo no topo do Dashboard mostra o checklist com o que falta (ex.: "Faltam 2 passos para o Agent COO ficar 100% operacional: Integrações, Ativar") com botão para retomar de onde parou.
- O wizard só aparece automaticamente na primeira sessão; depois disso, o usuário pode reabri-lo a qualquer momento a partir do banner ou de um link em Configurações.

Regra de negócio: o agente não pode ser marcado como "Online" no Dashboard enquanto o onboarding não estiver 100% completo (todas as 5 etapas) — reforça visualmente a mesma regra já existente em Ativar (toggle bloqueado se a instância não estiver online).

### 4.7 Nota de escopo — Configurações vs. Cérebro vs. Integrações
Para evitar confusão de produto, a navegação principal trata cada área de forma distinta:
- **Configurações**: administrativa (conta, instância, plano, modo escuro, desconectar). Não define comportamento nem credenciais de integração — fica como item próprio da sidebar.
- **Integrações**: tela própria na sidebar, dedicada a conectar/gerenciar Notion, Asana, Discord, Slack — separada de Configurações e separada de Cérebro → Chaves (que cobre as credenciais técnicas de infraestrutura: Anthropic, GitHub).
- **Cérebro → Treinar**: é onde o comportamento do agente é definido e evolui com o tempo (identidade, diretrizes, conhecimento, sugestões automáticas da seção 4.4). O que é treinado aqui vira skill versionada no GitHub via "Sincronizar cérebro" — nem Configurações nem Integrações geram commit de skill.

## 5. Requisitos Não Funcionais
- **Segurança**: credenciais de Notion/Asana/Discord/Slack criptografadas no Supabase Vault (mesmo padrão da Nina para Anthropic key e GitHub PAT).
- **Confiabilidade**: logs detalhados de cada ação para auditoria; reaproveita o cron `reap-orphan-runs` para garantir que nenhuma tarefa fique "travada" sem resposta.
- **Escalabilidade**: múltiplas rotinas em fila via Edge Functions (Supabase).

---

## 6. Fluxo de Usuário
1. Usuário cria/atribui uma tarefa ao "Agent COO" no Notion (ou Asana).
2. Edge Function detecta a alteração (webhook ou polling).
3. O cérebro (OpenClaw na VPS do cliente) decide os passos de execução.
4. Se envolver navegação web, o OpenClaw executa a ação no browser.
5. Status é atualizado no Notion/Asana e confirmação é enviada no Discord/Slack.
6. Progresso é refletido em tempo real na Dashboard (Lovable).
7. Ao final do dia, o Daily Report é enviado automaticamente.

---

## 7. Critérios de Sucesso
- Redução de pelo menos 20% no tempo gasto pelos gestores em tarefas manuais de atualização de sistemas.
- Taxa de sucesso de execução de rotinas via OpenClaw superior a 90%.
- Tempo de resposta aos comandos via Discord/Slack inferior a 30 segundos.
- Zero tarefas "travadas" sem status visível por mais de 5 minutos (herdado do padrão reap-orphan-runs).

---

## 8. Funcionalidades Must-Have (MVP)
1. **Dashboard de Operações** (Lovable) — tarefas pendentes, status de projetos, logs de execução, ActivityFeed em tempo real.
2. **Integração bidirecional com Notion** — leitura de backlog + escrita de status.
3. **Interface de comando via Discord/Slack** — ordens em linguagem natural + relatórios de execução.
4. **Automação de rotinas com OpenClaw** — execução browser-based de tarefas sem API.
5. **Notificações de status e alertas** — conclusão e bloqueios operacionais.
6. **Memória de contexto operacional** (`company_context`) — diretrizes da empresa e histórico de decisões, treinado via painel `/cerebro` → aba Treinar.
7. **Painel `/cerebro`** (Chaves, Treinar, Instalar, Ativar, Status) — reuso direto da base Nina.
8. **Onboarding Wizard** — fluxo guiado de primeiro acesso cobrindo Chaves → Integrações → Treinar → Instalar → Ativar, com banner persistente de retomada se interrompido.

## 9. Regras de Negócio Consolidadas

### 9.1 Execução de comandos
- O comportamento do agente ao receber um comando depende do nível de permissão do membro: membros com permissão "Pode dar ordens" têm execução direta; ações destrutivas/irreversíveis sempre pedem confirmação independente do perfil.
- O agente responde **no mesmo canal onde foi acionado**. Também pode ser acionado via **DM/privado** diretamente com o bot.
- Membro **sem permissão** que tenta dar um comando recebe resposta educada do agente no próprio canal + notificação ao admin no painel.

### 9.2 Bloqueios e escalação
- Quando o agente encontra um bloqueio (CAPTCHA, campo sem informação, permissão negada), ele tenta pelo **tempo configurável pelo admin** antes de escalar.
- Ao escalar: tarefa vai para status "Bloqueado" no Backlog + notificação imediata no canal de alertas configurado + notificação no painel. Nunca fica em "Doing" silenciosamente.
- Admin pode **pausar ou cancelar qualquer tarefa em execução** a qualquer momento pelo painel. Membros não têm essa permissão.

### 9.3 Tarefas ad hoc via Discord/Slack
- Comandos ad hoc de membros autorizados criam tarefas que aparecem **no Backlog da plataforma E no Notion** (workspace configurado).
- No Backlog, aparecem com badge "Ad hoc · Discord" ou "Ad hoc · Slack" para diferenciá-las de tarefas originadas no Notion ou de rotinas agendadas.

### 9.4 Rotinas
- Qualquer membro pode **solicitar** uma nova rotina via Discord/Slack.
- A rotina só é ativada após **aprovação de admin ou membro com permissão "Autoriza aprovações"** — aparece como pendente no painel até ser aprovada ou rejeitada.
- Membros (sem ser admin) só podem acionar rotinas já existentes e aprovadas — não podem criar rotinas diretamente pelo painel.

### 9.5 Base de conhecimento
- Arquivos enviados (PDF/DOCX/XLSX/TXT) são indexados automaticamente, mas o admin define **quais arquivos o agente pode usar** — cada arquivo tem toggle de ativação individual.
- Fontes automáticas das integrações (Notion, Discord etc.) também têm toggle individual — nenhuma fonte é usada sem autorização explícita.

### 9.6 Perfis de acesso ao painel
- Existem dois tipos de perfil no painel Lovable: **Admin** e **Operador**.
- Admins definem as permissões dos Operadores.
- Operadores têm acesso limitado conforme configurado — ex: podem ver Dashboard e Backlog, mas não acessar Cérebro ou Configurações.

### 9.7 Relatórios
- Horário e frequência do Daily Report são **configuráveis pelo admin** (ex: diário às 18h, semanal às segundas 9h).
- Admin pode forçar envio manual a qualquer momento pelo painel.
- O relatório é enviado no canal configurado para "Relatórios" em Time & Canais.

### 9.8 Retenção de dados
- Logs de execução e histórico de tarefas são armazenados **para sempre** — nunca deletados automaticamente.
- Histórico de conversas dos canais externos (Discord/Slack) também é retido indefinidamente no painel.

## 10. Decisões de produto — Ciclo 2

### 9.1 Integrações como base de conhecimento viva
Integrações não é só "conectar apps" — cada fonte conectada alimenta o contexto operacional do agente. A tela de Integrações (dentro de Configurações) passa a ter duas seções: (1) Ferramentas conectadas (Notion/Asana/Discord/Slack/Gmail/Webhook) e (2) Base de conhecimento, com sub-seções de upload direto de arquivos (PDF/DOCX/XLSX/TXT — SOPs, organigramas, processos) e fontes automáticas indexadas a partir das integrações ativas. Regra: nenhuma fonte é indexada sem autorização explícita do usuário.

### 9.2 Time & Canais
Nova tela na sidebar (`/time`) onde o usuário mapeia: quem é quem (nome, canal vinculado, cargo, nível de permissão com o agente) e para que serve cada canal (receber comandos, enviar relatórios, alertas de bloqueio etc.). Níveis de permissão: Pode dar ordens / Recebe notificações / Autoriza aprovações / Somente leitura. Regra: membro sem permissão "Pode dar ordens" recebe resposta educada do agente — não é ignorado.

### 9.3 Cérebro — wizard conversacional guiado por IA
A aba Identidade substitui o formulário estático por um wizard em 3 etapas de chat com a IA: (1) Sobre a empresa, (2) Sobre o agente, (3) Revisão e confirmação. A IA faz perguntas específicas e monta identidade + diretrizes iniciais a partir das respostas. O usuário revisa e confirma antes de aplicar — nada é aplicado automaticamente. Pós-wizard, a aba volta ao formulário estático com os dados preenchidos e badge "Gerado por IA · Revisado".

### 9.4 Histórico de conversas dos grupos
A tela Conversar ganha duas abas: "Chat direto" (gestor ↔ agente, como já existe) e "Histórico de canais" (feed centralizado de tudo que o agente disse/recebeu em todos os canais externos, com filtros por canal, data e tipo de mensagem).

### 9.5 Dashboard expandido
Além das métricas existentes, o Dashboard ganha: gráfico de tendência de volume/taxa de sucesso (7/14/30 dias) e 4 cards de insight operacional (tempo médio de execução, rotina com mais falhas, quem mais aciona, próximo vencimento no backlog).

### 9.6 Rotinas — ordens ad hoc via Discord/Slack
Rotinas recorrentes são criadas pelo admin no painel. Comandos de membros autorizados no Discord/Slack geram **tarefas ad hoc** no Backlog — não viram rotinas permanentes. A distinção aparece no Backlog com badge "Ad hoc / Discord" vs. "Rotina agendada".

## 10. Fora do escopo do MVP
- Integração com Asana (fase 2 — MVP é Notion-only).
- Multi-idioma na interface de comando.
- Edição de regras de automação via UI visual (drag-and-drop) — fase 2.

---

## 10. Ferramentas
| Ferramenta | Papel |
|---|---|
| **Lovable** | Dashboard de monitoramento + centro de controle (`/cerebro`) |
| **Supabase** | Backend, Vault, Edge Functions, orquestração heartbeat/brain-sync |
| **Anthropic API (Claude)** | Cérebro do agente — interpreta tarefas, planeja execução, gera linguagem natural |
| **Notion (MVP) / Asana (fase 2)** | Fonte da verdade do backlog operacional |
| **OpenClaw** | Braço executor — navegação web, scraping, preenchimento de formulários sem API |
| **Discord / Slack** | Interface de comando e canal de relatórios/alertas |
