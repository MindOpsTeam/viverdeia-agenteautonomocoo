# PROMPT MASTER — Claude Code · Agent COO
# Etapa 4 do pipeline: construção a partir do remix da base Nina (sure-shot)

---

## CONTEXTO GERAL

Você vai construir o **Agent COO** — uma plataforma SaaS para um agente de IA autônomo que atua como COO de pequenas e médias empresas. O agente lê backlog de tarefas (Notion/Asana), executa rotinas em sistemas web via OpenClaw, e se comunica com o time por Discord/Slack.

**Ponto de partida obrigatório**: o projeto base é o remix da Nina (sure-shot-code) — NÃO comece do zero. Reutilize toda a infraestrutura existente (auth, vault, heartbeat, brain-sync, Edge Functions) e substitua apenas o domínio (SDR/WhatsApp → COO/Discord+Slack).

**Referência visual**: o protótipo HTML exportado do Claude Design (DS Viver de IA) é a fonte da verdade para layout, componentes e UX. Siga-o fielmente.

---

## DESIGN SYSTEM — tokens obrigatórios

```css
/* Cores */
--navy-950: #02162a;   /* fundo sidebar, header, botões primários */
--navy-700: #123a5c;   /* links, destaques */
--white: #ffffff;
--gray-50: #f7f8fa;    /* fundo base das páginas */
--green-500: #1f9d6b;  /* sucesso, online, concluído */
--amber-500: #e0a330;  /* atenção, bloqueado */
--coral-500: #ff4d4d;  /* APENAS ações destrutivas */
--azure-500: #2c79e0;  /* info, badges de IA */

/* Tipografia */
--font-sans: "Geist", system-ui, sans-serif;
--font-mono: "Geist Mono", monospace;
--text-base: 14px;

/* Espaçamento base 4px */
--space-5: 16px; --space-7: 24px; --space-8: 32px;

/* Raios */
--radius-card: 12px; --radius-pill: 999px;

/* Sombras suaves */
--shadow-sm: 0 1px 3px rgba(2,22,42,0.06);
--shadow-md: 0 4px 12px rgba(2,22,42,0.07);

/* Sidebar */
--sidebar-width: 248px;
--topbar-height: 60px;
```

---

## ESTRUTURA DO PROJETO (reuso da base Nina)

### O que REUTILIZAR diretamente (não reescrever):
- `src/components/Auth.tsx` + `ProtectedRoute.tsx` — auth completo
- `src/components/Sidebar.tsx` — shell de navegação (adaptar labels/ícones)
- `src/components/ErrorBoundary.tsx` + `SystemHealthCard.tsx`
- `supabase/functions/heartbeat/` — heartbeat da instância
- `supabase/functions/brain-build/` — build do cérebro
- `supabase/functions/instance-register/` — registro da instância
- `supabase/functions/provision-secrets/` + `save-secret/` + `save-github-token/`
- `supabase/functions/validate-anthropic-key/` + `validate-github-pat/`
- `supabase/functions/reap-orphan-runs/` — cleanup de runs travados
- `supabase/functions/setup-installer/` + `secrets-status/`
- Scripts VPS: `heartbeat.sh`, `brain_sync.sh`, `_shared.sh`
- Modelo de Vault/Supabase para credenciais
- Padrão de skill versionada no GitHub (branch dedicado, sync ~2min)

### O que SUBSTITUIR (específico de domínio):
| Base Nina | Agent COO |
|---|---|
| `skills/nina/identity/` | `skills/agent-coo/identity/identity.md` + `soul.md` |
| `openclaw-skills/agendar\|cancelar\|reagendar` | `openclaw-skills/ler-backlog`, `atualizar-status`, `executar-rotina-browser`, `postar-relatorio` |
| `whatsapp-webhook` + `whatsapp-sender` | `discord-webhook` + `discord-sender` (e variantes Slack) |
| `nina-orchestrator` + `nina-reply` | `coo-orchestrator` + `coo-reply` |
| Tabela `contacts` + `client_memory` | Tabelas `team_members` + `company_context` + `routines` + `task_logs` |
| `Kanban.tsx` + `Scheduling.tsx` + `Contacts.tsx` | `Backlog.tsx` + `Rotinas.tsx` + `TimeCanais.tsx` |
| `ChatInterface.tsx` (chat com lead) | `ActivityFeed.tsx` (feed de execução em tempo real) |
| `CreateDealModal.tsx` + `LostReasonModal.tsx` | Removidos — não se aplicam |

---

## NAVEGAÇÃO (Sidebar)

Itens da sidebar na ordem exata:
1. **Dashboard** — ícone LayoutDashboard
2. **Conversar** — ícone MessageSquare
3. **Backlog** — ícone CheckSquare
4. **Rotinas** — ícone RefreshCw
5. **Time & Canais** — ícone Users
6. **Relatórios** — ícone BarChart2
7. **Cérebro** — ícone Brain
8. **Ajuda** — ícone HelpCircle
9. **Configurações** — ícone Settings (rodapé da sidebar)

**Indicador de status do agente** sempre visível no topo da sidebar:
- 🟢 "Agente online · instância ativa" (verde, pulse animation)
- 🟡 "Configuração pendente" (âmbar)
- 🔴 "Agente offline" (coral)

---

## TELAS — especificação completa

### 1. `/dashboard`

**Header**: "ACME LTDA · OPERAÇÕES / Dashboard / Como está a operação agora."
**Toggle de estado (demo)**: Operação normal | 1 bloqueio | Offline | Setup pendente

**Estado: Operação normal**
- 3 cards de métricas: Concluídas hoje (18, +5 vs. ontem) | Em andamento (3 •, "rodando agora") | Bloqueadas (0, "tudo fluindo")
- 1 card: Taxa de sucesso (96%, "últimos 7 dias")
- ActivityFeed "Atividade do agente · AO VIVO": feed cronológico com ícone por tipo de ação, timestamp relativo, badge de contexto (Comando/Em execução/Notion/Discord)
- Card lateral "Próximas rotinas": lista com horário, nome, canal

**Estado: 1 bloqueio**
- Card "Precisa de você" em âmbar, acima das métricas, com motivo + botão "Ver detalhes"
- Card Bloqueadas mostra 1 com ícone âmbar

**Estado: Offline**
- Banner vermelho no topo: "Instância offline — verifique o Cérebro"
- Métricas zeradas/paradas

**Estado: Setup pendente**
- Banner âmbar: "Faltam N passos para o Agent COO ficar 100% operacional. Pendentes: Instalar, Ativar. [Retomar configuração]"
- Status na sidebar: "Configuração pendente · conclua o onboarding"

**Seção expandida (abaixo do feed)**:
- Gráfico de tendência (barras, 7 dias por padrão, toggle 7/14/30 dias) com linha de taxa de sucesso
- 4 cards de insight: Tempo médio de execução | Rotina com mais falhas | Quem mais aciona | Próximo vencimento

---

### 2. `/conversar`

**Header**: "Agent COO · Online · responde aqui, no Discord e no Slack" + badge canal ativo

**Duas abas**: "Chat direto" | "Histórico de canais"

**Aba Chat direto**:
- Mensagens do agente (esquerda, balão com ícone) e do usuário (direita, balão navy)
- Sugestões rápidas abaixo do feed: "Resumo de hoje" | "O que está bloqueado?" | "Extrair relatório de leads" | "Postar resumo no Discord"
- Input: "Dê uma ordem em linguagem natural..." + botão enviar

**Aba Histórico de canais**:
- Filtros: por canal (dropdown), data, tipo (Comando recebido / Resposta do agente / Relatório enviado / Alerta de bloqueio)
- Feed com: ícone canal (Discord/Slack) + nome canal + remetente + texto truncado + timestamp + badge tipo
- Mínimo 8 entradas fictícias variadas

---

### 3. `/backlog`

Board Kanban com 4 colunas: **A Fazer** | **Em Execução** | **Bloqueado** | **Concluído**

Cada card:
- Título da tarefa
- Badge de origem: ícone Notion ou Asana + nome
- Badge de responsável: "🤖 Agent COO" (azul) ou nome do membro humano
- Prazo (se houver)
- Barra de progresso para tarefas multi-passo

Cards em "Bloqueado": borda âmbar + motivo resumido

Cards em "Concluído": badge "✓ Validado" (não check genérico — comunica evidência)

Cards em "Ad hoc": badge adicional "Ad hoc · Discord" ou "Ad hoc · Slack"

**Filtros no topo**: por origem (Notion/Asana/Ad hoc), responsável (Agente/Humano), status

**Drawer lateral ao clicar num card**:
- Histórico completo da tarefa
- Cada passo executado com timestamp e (quando aplicável) badge de evidência

**Dados fictícios realistas** (mínimo 3 cards por coluna):
- "Atualizar planilha de custos no ERP" — Notion — Agent COO
- "Extrair relatório semanal de leads" — Asana — Agent COO
- "Preencher formulário de compliance no portal do Fornecedor X" — Notion — Agent COO — Em execução
- "Relatório mensal de operações" — Ad hoc · Discord — Agent COO — Bloqueado (aguarda CAPTCHA)
- "Revisar contratos Q2" — Notion — Rafael Milagre (humano)
- "Postar resumo semanal no Discord" — Rotina — Agent COO — Concluído ✓ Validado

---

### 4. `/rotinas`

Lista de rotinas com: nome, frequência (badge), sistema-alvo, status (Ativa/Pausada), última execução + resultado

Toggle rápido por rotina (sem abrir detalhe)

Rotinas pausadas: opacidade 50%

Botão "Nova rotina" → formulário: nome, frequência, instrução em linguagem natural (textarea), sistema-alvo

**Fluxo de aprovação de rotinas solicitadas** (seção separada "Aguardando aprovação"):
- Badge "Solicitada por @membro via Discord"
- Botões: "Aprovar" (verde) | "Rejeitar" (outline vermelho)
- Nota: "Nenhuma rotina é ativada sem aprovação de admin ou aprovador."

**Dados fictícios**:
- "Relatório diário de operações" — Diária 18h — Discord — Ativa — Última: hoje ✓
- "Verificação semanal de SLA de fornecedores" — Semanal seg 9h — Portal fornecedor — Ativa — Última: há 2 dias ✓
- "Backup de métricas no Notion" — Diária 7h — Notion — Ativa — Última: hoje ✓
- "Relatório de inadimplência" — Mensal dia 1 — ERP — Pausada
- Pendente: "Verificar estoque toda sexta 10h" — Solicitada por @ana via Discord

---

### 5. `/time`

**Header**: "QUEM É QUEM / Time & Canais / O agente trata cada pessoa conforme a permissão — não trata todo mundo igual."

**Seção "Membros do time"**:
Tabela: Avatar | Nome + @handle + canal | Cargo | Permissão com o agente | Ações (editar)

Badges de permissão (cores diferentes por tipo):
- "Pode dar ordens" — azul
- "Recebe notificações" — verde
- "Autoriza aprovações" — âmbar
- "Somente leitura" — cinza

Dados fictícios:
- Rafael Milagre · @rafael · Discord · Fundador · [Pode dar ordens] [Autoriza aprovações]
- Ana Lima · @ana · Discord · Gerente de Ops · [Pode dar ordens] [Recebe notificações]
- Bruno Costa · @bruno · Discord · Financeiro · [Autoriza aprovações]
- Mariana Souza · @mariana · Slack · Analista · [Somente leitura]

Nota explicativa: "Um membro sem a permissão 'Pode dar ordens' que tentar acionar o agente recebe uma resposta educada de que não está autorizado — nunca é ignorado em silêncio, e o admin é avisado no painel."

Botão "+ Adicionar membro"

**Seção "Canais e seus propósitos"**:
- #operações — badges: "Receber comandos" + "Alertas de bloqueio" — Menciona: Todos os membros
- #relatórios — badge: "Enviar relatórios diários" — Menciona: Ana, Rafael
- #financeiro — badge: "Notificações de conclusão" — Menciona: Bruno, Rafael

---

### 6. `/relatorios`

Gráfico de linha no topo: taxa de sucesso últimos 14 dias (toggle 7/14/30 dias)

Lista cronológica de Daily Reports expansíveis:
- Cada item: data + resumo inline (X concluídas, Y bloqueadas, Z em andamento)
- Expandido: detalhes completos do relatório

Botão "Enviar relatório agora" (força envio manual)

---

### 7. `/cerebro`

**Header fixo (em todas as abas)**:
```
🟢 Cérebro online · Última sincronização: há 1 min · Próxima em 47s · v.2024.06.14-acme · [Sincronizar agora]
[Histórico de versões] (link discreto)
```

**4 abas**: Resumo | Identidade | Diretrizes | Conhecimento

#### Aba Resumo:
1. Card âmbar "Precisa da sua atenção" (só aparece com pendências):
   - "1 sugestão de diretriz aguardando aprovação → [Ver sugestão]"
   - "Arquivo 'Tabela_SLA_Fornecedores.xlsx' ainda indexando → [Ver progresso]"

2. Card principal Agent COO:
   - Avatar + "Agent COO" + badge "Tom Direto"
   - Descrição
   - 4 métricas: 3 Diretrizes | 3 Integrações ativas | ✓ Conhecimento Preenchido | ● Operando

3. Seção "O que o agente sabe hoje" (3 cards, só com links de navegação):
   - Identidade: "Tom Direto · Nome: COO · ✓ Configurado" + "Editar →"
   - Diretrizes: "3 regras ativas · ⚠️ 1 sugestão pendente" + "Ver →"
   - Conhecimento: "2 arquivos ativos · 2 fontes indexadas · Atualizado há 1 min" + "Ver →"

**SEM botões de ação no Resumo** — apenas links de navegação para as abas corretas.

#### Aba Identidade:
**Modo wizard** (quando vazio ou ao clicar "Preencher com IA" no Resumo):
- Card com "⚡ Vamos montar a identidade com IA" + badge "GERADO POR IA"
- Stepper 3 etapas: Sobre a empresa → Sobre o agente → Revisão
- Interface de chat: balões da IA (esquerda) + respostas do usuário (direita)
- Input "Digite sua resposta..." + botão enviar
- Link "Pular wizard — preencher manualmente"

**Modo formulário** (pós-wizard ou ao pular):
- Badge "Gerado por IA · Revisado em 14/06" quando preenchido via wizard
- Nome: input com "COO"
- Tom: toggle Direto (selecionado) | Formal | Informal
- Como se apresenta: textarea

#### Aba Diretrizes:
**Seção 1 — Diretrizes ativas** (lista com data + editar + deletar):
1. "Nunca enviar e-mail a clientes sem aprovação humana." · 10/06
2. "Sempre confirmar antes de excluir qualquer registro." · 10/06
3. "Pagamentos acima de R$ 5.000 exigem aprovação do Rafael." · 12/06

**Seção 2 — Sugestão automática** (card, fundo azul-claro, badge "AUTOMÁTICA"):
- Origem: "⚡ Baseado no bloqueio de hoje às 14:32 — tarefa 'Enviar e-mail de cobrança ao cliente'"
- Diretriz sugerida: "Confirmar o destinatário e obter aprovação humana antes de enviar e-mails a clientes."
- Botões: ✓ Aceitar (verde) | Editar | Descartar
- Nota: "Nenhuma diretriz é aplicada sem sua confirmação."

**Seção 3 — Treinar o agente** (card borda tracejada):
- 3 abas: Escrever | Falar | Com IA
- Textarea com placeholder
- Botão "Adicionar diretriz"

#### Aba Conhecimento:
**Seção 1 — Contexto operacional**:
- Textarea com badge "● Indexado · há 1 min"
- Dado: "O fechamento de caixa é feito toda sexta às 17h. Pagamentos acima de R$ 5.000 exigem aprovação do Rafael. Relatórios vão sempre para o canal #operações."

**Seção 2 — Arquivos** (upload drag-and-drop + lista):
- SOP_Financeiro_v3.pdf · badge "Disponível" (verde) · Toggle ON · 🗑️
- Organograma_2026.docx · badge "Disponível" (verde) · Toggle ON · 🗑️
- Tabela_SLA_Fornecedores.xlsx · badge "Indexando..." (azul pulse) · Toggle OFF · 🗑️

**Seção 3 — Fontes automáticas**:
- N Notion · "Banco 'Backlog Operacional' — sincronizado há 3 min" · Toggle ON
- D Discord · "Canal #operações — últimos 30 dias indexados" · Toggle ON
- Nota: "ℹ️ Nenhuma fonte é usada pelo agente sem ativação explícita."

---

### 8. `/ajuda`

**Header**: "CENTRAL DE AJUDA / Como o Agent COO funciona / Um guia honesto e completo da plataforma — escrito para gestores, sem jargão desnecessário."

Barra de busca + sugestões: "como adicionar membro" | "como aprovar rotina" | "o que é OpenClaw"

Sidebar interna com 8 seções numeradas (01–08):
01 Como funciona | 02 Arquitetura | 03 Dados e segurança | 04 Permissões e membros | 05 Rotinas | 06 Base de conhecimento | 07 Relatórios e histórico | 08 Perguntas frequentes

Diagrama visual simples na seção 02 mostrando: Painel → Cérebro (VPS) → Skills (GitHub)

Caixas de destaque para regras críticas (azul para info, âmbar para atenção)

---

### 9. `/configuracoes`

**Header**: "ADMINISTRAÇÃO / Configurações / Conta, credenciais técnicas, instalação e ativação da instância."

**4 abas**: Conta | Integrações | Credenciais | Instância

**Aba Conta**: Empresa (ACME Ltda) | Instância (acme-9f3a) | Plano (Agent COO · Pro) | Modo escuro (toggle) | Desconectar instância (botão coral)

**Aba Integrações** (cards de apps + base de conhecimento):
Cards: Notion (Conectado) | Asana (Conectado) | Discord (Conectado) | Slack (Não conectado) | Gmail (Não conectado) | Webhook/HTTP (Não conectado)
Cada card conectado: status + descrição do que faz + botão "Trocar" ou "Trocar canal"
Não conectados: opacidade reduzida + botão "Conectar" navy

**Aba Credenciais**:
- Barra "3 de 5 credenciais configuradas"
- Anthropic API Key · GitHub PAT · Notion Token (configurados, com ✓)
- Asana Token (opcional, placeholder)
- Discord Bot Token (placeholder)
- Cada campo: input password + botão "Testar conexão" + ícone status

**Aba Instância**: stepper Chaves → Integrações → Treinar → Instalar → Ativar (checkmarks nas concluídas) + conteúdo da etapa atual

---

### 10. Onboarding Wizard (primeiro login)

Tela cheia, sem sidebar, header simplificado:
"Vamos deixar seu Agent COO pronto para operar / Conclua as 5 etapas para ativar a operação."

Stepper horizontal: Chaves → Integrações → Treinar → Instalar → Ativar
Etapas concluídas: check verde | Atual: circle navy | Futuras: circle cinza

Corpo: a tela real correspondente embutida (sem duplicar componentes)
Rodapé: "Voltar" (esquerda) + instrução contextual (centro) + "Continuar >" (direita, navy, desabilitado até etapa mínima preenchida)

Último passo: botão "Concluir e ir para o Dashboard"

---

## BANCO DE DADOS — tabelas novas/adaptadas

```sql
-- Membros do time e suas permissões com o agente
create table team_members (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  name text not null,
  handle text not null, -- @usuario no Discord/Slack
  channel text not null, -- 'discord' | 'slack'
  role text,
  permissions text[] default '{}', -- ['can_command','receives_notifications','authorizes_approvals','readonly']
  created_at timestamptz default now()
);

-- Canais e seus propósitos
create table channels (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  name text not null, -- #operacoes
  platform text not null, -- 'discord' | 'slack'
  purposes text[] default '{}', -- ['receive_commands','send_reports','alerts','notifications']
  mention_member_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- Contexto da empresa (substitui client_memory da Nina)
create table company_context (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  agent_name text default 'COO',
  communication_tone text default 'direct', -- 'direct' | 'formal' | 'informal'
  presentation text,
  operational_context text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Diretrizes do agente
create table directives (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  content text not null,
  source text default 'manual', -- 'manual' | 'ai_suggestion' | 'wizard'
  status text default 'active', -- 'active' | 'pending_approval' | 'rejected'
  origin_event text, -- descrição do bloqueio que gerou a sugestão
  created_at timestamptz default now()
);

-- Arquivos da base de conhecimento
create table knowledge_files (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  filename text not null,
  file_type text,
  status text default 'indexing', -- 'indexing' | 'available' | 'error'
  active boolean default false,
  uploaded_at timestamptz default now()
);

-- Rotinas recorrentes
create table routines (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  name text not null,
  frequency text not null, -- 'daily' | 'weekly' | 'monthly'
  schedule_time time,
  schedule_day int, -- 0-6 para weekly
  instruction text not null,
  target_system text,
  status text default 'pending_approval', -- 'active' | 'paused' | 'pending_approval' | 'rejected'
  requested_by text, -- '@handle via Discord'
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz default now()
);

-- Log de execuções (retido para sempre)
create table task_logs (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  task_title text not null,
  source text, -- 'notion' | 'asana' | 'discord' | 'slack' | 'routine'
  responsible text, -- 'agent' | member handle
  status text, -- 'todo' | 'doing' | 'blocked' | 'done'
  block_reason text,
  evidence_url text,
  steps jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Histórico de conversas dos canais externos
create table channel_messages (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references instances(id),
  channel_name text not null,
  platform text not null,
  sender text not null, -- 'agent' | @handle do membro
  message_type text, -- 'command' | 'response' | 'report' | 'alert'
  content text not null,
  created_at timestamptz default now()
);
```

---

## REGRAS DE NEGÓCIO — implementar na lógica

1. **Execução por permissão**: membro sem "can_command" → resposta educada + notificação ao admin
2. **Bloqueio escalável**: timeout configurável pelo admin antes de escalar; tarefa nunca fica em "doing" silenciosamente
3. **Tarefas ad hoc**: comandos via Discord/Slack criam tasks_logs E sincronizam com Notion
4. **Rotinas**: qualquer membro pode solicitar; só admin ou "authorizes_approvals" aprova; status "pending_approval" até aprovação
5. **Base de conhecimento**: arquivo indexado mas `active = false` por padrão; admin ativa manualmente
6. **Diretrizes por IA**: source = 'ai_suggestion', status = 'pending_approval'; nunca aplicadas sem confirmação
7. **Daily Report**: horário e frequência configuráveis; pode ser forçado manualmente
8. **Logs**: retidos para sempre, nunca deletados automaticamente
9. **Agente responde no mesmo canal** onde foi acionado; suporta DM/privado
10. **Admin pode pausar/cancelar** qualquer tarefa em execução pelo Backlog
11. **Onboarding wizard**: 5 etapas obrigatórias; banner de retomada persiste até concluir; status da sidebar muda para "Configuração pendente"

---

## SKILLS DO AGENTE COO — estrutura inicial

Criar na pasta `skills/agent-coo/`:

**identity/identity.md**:
```markdown
# Identidade do Agent COO
Nome: COO
Tom: Direto e objetivo
Papel: Braço operacional autônomo da empresa.
Missão: Ler o backlog, executar rotinas, reportar resultados e notificar bloqueios.
Nunca: tomar decisões financeiras sem aprovação, excluir registros sem confirmar, enviar comunicações externas sem aprovação humana.
```

**skills/ler-backlog.md**: instrução para ler e sincronizar tarefas do Notion/Asana
**skills/atualizar-status.md**: instrução para atualizar status de tarefas com evidência
**skills/executar-rotina-browser.md**: instrução para navegação via OpenClaw
**skills/postar-relatorio.md**: instrução para formatar e postar Daily Report no canal configurado
**skills/escalar-bloqueio.md**: instrução para notificar bloqueios imediatamente

---

## STACK E CONFIGURAÇÕES

- **Frontend**: Vite + React + TypeScript (base Nina)
- **Backend**: Supabase (Edge Functions TypeScript)
- **Auth**: Supabase Auth (reuso direto da Nina)
- **Vault**: Supabase Vault para todas as credenciais (Anthropic key, GitHub PAT, Notion token, Discord bot token, Slack bot token)
- **Agente**: OpenClaw na VPS do cliente (instalação via curl único)
- **Skills**: GitHub branch dedicado, sync ~2min via brain_sync.sh
- **Canais**: Discord + Slack (substituindo WhatsApp da Nina)
- **Backlog**: Notion (MVP) / Asana (fase 2)
- **Deploy**: GitHub → Lovable sync

---

## ORDEM DE BUILD RECOMENDADA

1. Fork/remix do projeto Nina → limpar domínio específico (WhatsApp, SDR)
2. Adaptar Sidebar com nova navegação
3. Dashboard com ActivityFeed e estados
4. Configurações (Conta + Credenciais + Instância) — reutiliza padrão Cérebro da Nina
5. Cérebro completo (4 abas + header de status vivo)
6. Onboarding Wizard (5 etapas)
7. Time & Canais
8. Backlog (Kanban)
9. Rotinas (com fluxo de aprovação)
10. Conversar (Chat direto + Histórico de canais)
11. Relatórios
12. Ajuda
13. Criar tabelas no Supabase (migrations)
14. Adaptar Edge Functions (orchestrator + reply para Discord/Slack)
15. Criar skills iniciais do COO no GitHub

---

## ENTREGA ESPERADA

Repositório GitHub com:
- Todo o código fonte buildável
- Migrations do Supabase prontas para rodar
- Skills iniciais do agente em `skills/agent-coo/`
- README com instruções de setup (instalar dependências, configurar Supabase, conectar ao Lovable)
- `.env.example` com todas as variáveis necessárias
