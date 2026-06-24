# Gap-Analysis & Plano de Sprints — Agent COO

**Data:** 2026-06-23
**Base confirmada:** Atlas (atlas-base) = repositório atual. Nomes "Nina"/"sure-shot" nos `/docs` são legados do mesmo base — ignorados.
**Alvo:** evoluir ESTE repositório (Sprints 1–5 = MVP) em direção ao spec `/docs` v2.0.
**Fonte da verdade:** `/docs` (PRD v2.0 + BUILD). `BRIEFING.md` = histórico do MVP.
**Fora do MVP (fase 2, confirmado no PRD §10/202):** Slack, Asana, edição visual de regras.

---

## 1. Estado atual (o que JÁ existe e funciona)

### Frontend
- **Rotas:** `/auth`, `/onboarding` (wizard 4 etapas), `/dashboard`, `/settings/*` (admin), `/pending-approval`.
- **Sidebar:** só **Dashboard** + rodapé (Configurações, Ajuda=placeholder "Em breve", Sair). **Sem indicador de status do agente na sidebar.**
- **Dashboard:** 4 cards (concluídas/andamento/bloqueadas/último relatório), **tabela** de tarefas (não Kanban) com filtro + "Sincronizar Notion", feed de logs em tempo real (Supabase Realtime), toggle pausar/retomar.
- **Settings (abas):** general, credentials, agent (soul/agents/user .md), schedule, integrations, security, team (aprovar/rejeitar/role de usuários do painel), demonstration, onboarding.
- **Realtime:** assinado em `execution_logs` (INSERT) e `tasks` (todos eventos).

### Backend (Supabase)
- **Tabelas auth/infra:** `profiles`, `user_roles` (admin/supervisor/agent), `project_config`, `api_keys_registry`, `onboarding_progress`.
- **Tabelas COO:** `companies`, `credentials` (Vault-backed), `agent_config`, `tasks`, `execution_logs`, `reports`.
- **RLS:** scoping consistente por `company_id ∈ (companies do owner)`.
- **RPCs:** `store_credential`/`read_credential` (Vault), `handle_new_user`, `has_role`, `ensure_auth_trigger`, `bootstrap` (fallback de remix).
- **pg_cron:** `coo-tick` a cada minuto.
- **Edge Functions:** `onboard-agent`, `sync-notion-tasks`, `execute-task`, `generate-report`, `discord-webhook` (6 comandos: status/backlog/executa/pausa/retoma/report), `coo-tick`, + infra de auth/credenciais.
- **Claude:** `claude-sonnet-4-20250514` hardcoded em execute-task/generate-report/validações. Lê chave do cliente do Vault. **Discord-only.**

> **Achado relevante:** a infra de "skill versionada no GitHub + brain-build + heartbeat + instance-register" que o BUILD descreve como "reuso da Nina" **NÃO existe** neste repo. O MVP usa `agent_config.soul_md/agents_md/user_md` + `openclaw_workspace_url` direto. Ver Decisão D1.

---

## 2. Estado-alvo (`/docs` v2.0)

**Sidebar (ordem exata):** Dashboard · Conversar · Backlog · Rotinas · Time & Canais · Relatórios · Cérebro · Ajuda · Configurações. + indicador de status (🟢/🟡/🔴). + Onboarding Wizard tela cheia (5 etapas).

**Tabelas novas no spec:** `team_members`, `channels`, `company_context`, `directives`, `knowledge_files`, `routines`, `task_logs`, `channel_messages` (no BUILD referenciam `instances(id)` → **reconciliar para `company_id`**).

---

## 3. Matriz de gaps (tela a tela)

| Área | Existe hoje | Falta para o v2.0 | Esforço |
|---|---|---|---|
| **Sidebar/Shell** | 1 item + rodapé | 9 itens + status do agente + rotas/placeholders | P |
| **Cérebro** ⭐1 | — (nada) | 4 abas (Resumo/Identidade/Diretrizes/Conhecimento), wizard IA 3 etapas, sugestão automática de diretriz, upload de conhecimento, header de sync vivo | **G** |
| **Backlog** ⭐2 | tabela simples | Kanban 4 colunas, badges (origem/responsável/ad hoc/validado), filtros, drawer com histórico de passos + evidência | M |
| **Time & Canais** ⭐3 | gestão de usuários do painel | membros externos (Discord/Slack) + permissões com o agente + canais e propósitos | M |
| **Rotinas** | 3 horários fixos em agent_config | tela de rotinas, toggle, nova rotina, fluxo de aprovação; refatorar coo-tick | M |
| **Conversar** | — | Chat direto + Histórico de canais (com filtros) | M |
| **Relatórios** | dados existem (reports) | gráfico de tendência + lista expansível + "enviar agora" | P |
| **Ajuda** | placeholder | 8 seções + diagrama arquitetura | P |
| **Configurações** | 9 abas atuais | reorganizar p/ 4 abas (Conta/Integrações/Credenciais/Instância) | P |
| **Onboarding Wizard** | 4 etapas embutidas | tela cheia 5 etapas (Chaves→Integrações→Treinar→Instalar→Ativar) + banner de retomada | M |
| **Dashboard** | base pronta | 4 estados (normal/bloqueio/offline/setup), gráfico tendência, 4 cards insight, "próximas rotinas" | M |

### Reconciliação de dados (spec `/docs` → schema do repo)
- `instances(id)` → **`company_id`** (FK para `companies`) em todas as tabelas novas.
- `task_logs` (spec) → **estender `tasks`** com `source`, `responsible`, `block_reason`, `evidence_url`, `steps jsonb`, `is_adhoc/origin`. Manter `execution_logs` como feed de passos. (Não criar tabela duplicada.)
- `company_context` (spec: agent_name/tone/presentation/operational_context) → **nova tabela**, é a fonte estruturada do Cérebro. Compila para `agent_config.soul_md/agents_md/user_md` no "Sincronizar cérebro" (ver D1).
- `directives`, `knowledge_files`, `routines`, `team_members`, `channels`, `channel_messages` → **tabelas novas**.
- **Perfis do painel** (`user_roles`: admin/supervisor/agent) ≠ **membros do agente** (`team_members`: handles Discord/Slack + permissões can_command etc.). São conceitos distintos — mantidos separados.

---

## 4. Decisões arquiteturais (recomendação + precisa do teu aval)

- **D1 — "Sincronizar cérebro":** *recomendo* que o Cérebro (Identidade+Diretrizes+Conhecimento estruturados) **compile para os campos `agent_config.soul_md/agents_md/user_md`** que o agente já usa — NÃO introduzir o versionamento de skill no GitHub (modelo Nina que não existe no repo). Mais simples e alinhado ao código atual. ⚠️ Confirma.
- **D2 — Cérebro × Configurações→Agente:** a aba "Agente" das Configurações (edita soul/agents/user .md cru) vira a **saída técnica** do Cérebro. Cérebro = editor estruturado; Configurações→Agente = visão avançada/raw. Sem duplicar fonte.
- **D3 — Rotinas × coo-tick:** *recomendo* fase incremental — manter os 3 horários default funcionando e adicionar a tabela `routines` por cima; coo-tick passa a iterar rotinas ativas. Sem big-bang.
- **D4 — Modelo Claude:** hoje `claude-sonnet-4-20250514` está hardcoded em 4 funções. *Recomendo* centralizar num único `MODEL` const (opcionalmente subir para `claude-sonnet-4-6`). Baixa prioridade, faço junto do Cérebro.

---

## 5. Plano de Sprints (continua a numeração; ⭐ = prioridade do cliente)

### Sprint 6 — Shell & Navegação (habilitador, baixo risco)
- AppSidebar com os 9 itens na ordem do BUILD + indicador de status (🟢/🟡/🔴) ligado a `agent_config.is_active` + completude do onboarding.
- Rotas + páginas placeholder para Conversar/Backlog/Rotinas/Time/Relatórios/Cérebro/Ajuda.
- Reorganizar `/configuracoes` para 4 abas (Conta/Integrações/Credenciais/Instância) reaproveitando os componentes existentes.
- *Desbloqueia todas as telas seguintes.*

### Sprint 7 — Cérebro ⭐1 (maior; pode dividir 7a/7b)
- **Migration:** `company_context`, `directives`, `knowledge_files` (FK company_id, RLS, realtime onde fizer sentido).
- **7a — Resumo + Identidade + Diretrizes:** 4 abas com header de sync vivo; Identidade (wizard IA 3 etapas → form com badge "Gerado por IA · Revisado"); Diretrizes (lista ativa + card de sugestão automática + bloco Treinar Escrever/Falar/Com IA).
- **7b — Conhecimento + Sync:** contexto operacional, upload de arquivos (Supabase Storage + status indexando/disponível + toggle), fontes automáticas com toggle.
- **Edge Functions:** `suggest-directive` (Claude analisa bloqueio/correção → propõe diretriz, status `pending_approval`) e `brain-sync` (compila company_context+directives+knowledge → agent_config .md). Regra: nada aplicado sem confirmação.

### Sprint 8 — Backlog ⭐2 (Kanban)
- **Migration:** estender `tasks` (source, responsible, block_reason, evidence_url, steps jsonb, is_adhoc/origin).
- Kanban 4 colunas + cards com badges + filtros (origem/responsável/status) + drawer (histórico de passos + evidência). Reusa realtime de `tasks`.
- Atualizar `sync-notion-tasks` e `execute-task` para popular os novos campos (evidência antes de "Done"; bloqueio nunca silencioso).

### Sprint 9 — Time & Canais ⭐3
- **Migration:** `team_members`, `channels`.
- Tela `/time`: tabela de membros + badges de permissão (can_command/notifications/approvals/readonly) + add/editar; seção de canais e propósitos.
- Aplicar permissões no `discord-webhook`: membro sem `can_command` → resposta educada + aviso ao admin; comando ad hoc cria task (Backlog + Notion) com badge "Ad hoc".

### Sprint 10 — Rotinas
- **Migration:** `routines`. Refatorar `coo-tick` para iterar rotinas ativas (mantendo defaults — D3).
- Tela `/rotinas`: lista, toggle, nova rotina, seção "Aguardando aprovação" (admin/aprovador). discord-webhook: membro solicita rotina → `pending_approval`.

### Sprint 11 — Conversar + Relatórios
- **Migration:** `channel_messages` (log de mensagens dos canais externos).
- `/conversar`: Chat direto (gestor↔agente) + Histórico de canais (filtros canal/data/tipo).
- `/relatorios`: gráfico de tendência (7/14/30d) + lista expansível de Daily Reports + "Enviar agora" (reusa `reports` + `generate-report`).

### Sprint 12 — Ajuda + Wizard + Dashboard 2.0 + polish
- `/ajuda` (8 seções + diagrama Painel→Cérebro→Skills).
- Onboarding Wizard tela cheia 5 etapas embutindo telas reais + banner de retomada no Dashboard + regra "não fica Online até onboarding 100%".
- Dashboard: 4 estados, gráfico de tendência, 4 cards de insight, card "Próximas rotinas".

---

## 6. Riscos & observações
- **Cérebro é o maior item** e tem dependências de IA (sugestão de diretriz, wizard). Recomendo dividir em 7a/7b para entregar valor cedo.
- **Permissões** (Sprint 9) tocam o `discord-webhook` em produção — testar com cuidado.
- **Notion-only** no MVP; toda UI de "origem" já deve prever Asana/Ad hoc nos enums para não re-migrar depois.

---

## 7. Atualização v2 do protótipo (2026-06-23)

Fonte: novo `docs/Agente COO (standalone).html` (bundle ~770KB, thumbnail "A"). Diferenças relevantes vs. v1:

### 7.0 Rebranding: "Agent COO" → **Atlas**
O agente passa a se chamar **Atlas** em toda a UI (108 ocorrências no bundle; logo "A"). Mudança transversal: textos, saudações, títulos. Não cria sprint própria — folded nas sprints que tocam cada tela (principalmente 14) + um passe de rename. O nome técnico de projeto/tabelas (`company`, `agent_config`) não muda.

### 7.1 Tela de entrada `/` reformulada — Atlas fala primeiro (NOVO)
A raiz deixa de redirecionar para `/dashboard`. Vira uma **tela conversacional proativa**: Atlas saúda ("Bom dia, Rafael. A operação está rodando. 18 tarefas concluídas ontem…") e **apresenta sugestões proativas com botões de resposta rápida** ("Aceitar sugestão"). Conceito: "monitora os canais e aparece com sugestões — sem você precisar perguntar". O Dashboard (cards/métricas) continua existindo, mas como destino secundário, não como landing.
- Impacto: muda o `Navigate to="/dashboard"` em `App.tsx`. Reaproveita `coo-chat` (Sprint 11) + sugestões (estilo `cerebro-ai`).

### 7.2 Nova tela `/processos` — repositório de processos (NOVO)
Item de sidebar `Processos` (ícone `workflow`, "Memória operacional viva"). Repositório de processos com:
- **Editor estruturado** (passos), busca ("Buscar processo…"), processos com `area` (ex.: "Processo de criação de conteúdo · Marketing"; "fechamento de contrato"), carimbo "Atualizado · há X".
- **Importação**: botão "Importar" — "conecte Notion/Discord como fonte" (Notion confirmado no protótipo; Google Docs = intenção do produto, ainda não no protótipo).
- **Sugestões automáticas do Atlas** baseadas em execuções observadas (ver 7.4).
- Nova tabela `processes` (ver abaixo).

### 7.3 Visibilidade por processo (NOVA regra de negócio)
Cada processo tem um nível de visibilidade: `visMap = { admin (🔒 "Admin"), authorized_team (👥 "Time autorizado"), everyone (🌐 "Todo o time") }`. Define quem pode ver/perguntar sobre o processo. "Time autorizado" cruza com `team_members` (Sprint 9). Reflete no Discord (quem pode perguntar o quê — ver Unknown abaixo).

### 7.4 Motor de sugestões de processos (NOVO)
Atlas **observa execuções** (ex.: "7 execuções observadas entre 01/06 e 21/06") e **detecta divergência** entre o processo documentado e o que foi realmente executado: "Isso não está no processo atual" → propõe adicionar um passo (ex.: "Aprovação do financeiro"). Aprovação em 1 clique (mesmo padrão das diretrizes em 4.4). Fonte de observação: `execution_logs` + `tasks` (source=routine/notion). Reusa o padrão `cerebro-ai`.

### 7.5 PWA (NOVO)
Instalável: **manifesto** (`display: standalone`) + **bottom navigation mobile** + ícones. Service worker não aparece no protótipo (intenção declarada — implementar no build). Bottom nav só no mobile; sidebar permanece no desktop.

### 7.6 Modo demonstração `/demo` (NOVO)
Seed de dados realistas **sem login** numa rota `/demo` (hoje existe `DemonstrationSettings`, mas é pós-login). Permite mostrar o produto populado sem autenticar.

### Tabela nova proposta
```sql
create table processes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  area text,
  visibility text default 'admin' check (visibility in ('admin','authorized_team','everyone')),
  authorized_member_ids uuid[] default '{}',  -- quando visibility='authorized_team'
  content jsonb default '[]',                  -- passos estruturados
  source text default 'manual',                -- 'manual' | 'imported_notion' | 'ai_suggested'
  observed_executions int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- sugestões de processo: reusar 'directives'-like OU process_suggestions(process_id, suggested_step, origin_event, status)
```

### Impacto no plano (sprints a adicionar / modificar)
- **Adicionar:** 13 `/processos`+`processes`+visibilidade · 14 tela de entrada Atlas-first · 15 PWA · 16 motor de sugestões de processos · 17 modo demo `/demo`.
- **Modificar:** Sprint 12 (pendente) — o "Dashboard 2.0" continua, mas o landing `/` migra para a tela proativa na Sprint 14 (ajustar `App.tsx`). Rebranding Atlas (7.0) entra como passe transversal (principalmente Sprint 14).
- **Cross-cutting:** visibilidade de processos (7.3) depende de `team_members` (Sprint 9, já entregue).
