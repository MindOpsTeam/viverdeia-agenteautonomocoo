# Agent COO — Briefing Completo para Claude Code

## Contexto
Solução remixada do projeto base MindOpsTeam/viver-de-ia-projetobase.
Nunca começar do zero. Sempre partir do projeto base.

Stack: Lovable Cloud + Supabase + Claude API + OpenClaw (na conta do cliente)
Design System: C:\Users\sahho\Documents\Projetos\viver-de-ia\design-system
Canal de comunicação: Discord

---

## O que é essa solução

Agent COO é um agente autônomo de operações que roda no OpenClaw do cliente.
A plataforma Lovable é a interface de configuração e monitoramento.
O cliente traz suas próprias credenciais (Claude API, OpenClaw, Notion, Discord).
Tudo fica na conta e nos tokens do cliente — zero custo de infraestrutura pra quem vende.

---

## Fluxo principal

```
Cliente faz onboarding → configura credenciais → agente COO ativa
          ↓
Agente puxa backlog do Notion automaticamente
          ↓
Executa tarefas autônomas, atualiza status no Notion
          ↓
Reporta progresso no Discord
          ↓
Dashboard no Lovable mostra tudo em tempo real
```

---

## Banco de dados — Supabase

### Tabela: `companies`
```sql
create table companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  owner_id uuid references auth.users(id) not null,
  created_at timestamptz default now()
);
```

### Tabela: `credentials`
```sql
create table credentials (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) not null,
  service text not null, -- 'anthropic' | 'openclaw' | 'notion' | 'discord'
  vault_key text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, service)
);
```

### Tabela: `agent_config`
```sql
create table agent_config (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) not null unique,
  notion_database_id text,
  discord_channel_id text,
  discord_server_id text,
  openclaw_workspace_url text,
  soul_md text,
  agents_md text,
  user_md text,
  morning_briefing_time text default '08:00',
  checkpoint_time text default '12:00',
  daily_report_time text default '18:00',
  timezone text default 'America/Sao_Paulo',
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Tabela: `tasks`
```sql
create table tasks (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) not null,
  notion_task_id text not null,
  title text not null,
  description text,
  status text default 'todo', -- todo | doing | done | blocked
  priority text default 'medium', -- high | medium | low
  assigned_to text default 'coo',
  result text,
  error_log text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Tabela: `execution_logs`
```sql
create table execution_logs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) not null,
  task_id uuid references tasks(id),
  type text not null, -- 'action' | 'report' | 'error' | 'briefing'
  content text not null,
  created_at timestamptz default now()
);
```

### Tabela: `reports`
```sql
create table reports (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) not null,
  type text not null, -- 'daily' | 'weekly' | 'checkpoint'
  content text not null,
  tasks_done integer default 0,
  tasks_doing integer default 0,
  tasks_blocked integer default 0,
  sent_to_discord boolean default false,
  created_at timestamptz default now()
);
```

### RLS — habilitar em todas as tabelas
```sql
alter table companies enable row level security;
alter table credentials enable row level security;
alter table agent_config enable row level security;
alter table tasks enable row level security;
alter table execution_logs enable row level security;
alter table reports enable row level security;

create policy "owner_access" on companies
  for all using (owner_id = auth.uid());

create policy "company_access" on credentials
  for all using (
    company_id in (select id from companies where owner_id = auth.uid())
  );

create policy "company_access" on agent_config
  for all using (
    company_id in (select id from companies where owner_id = auth.uid())
  );

create policy "company_access" on tasks
  for all using (
    company_id in (select id from companies where owner_id = auth.uid())
  );

create policy "company_access" on execution_logs
  for all using (
    company_id in (select id from companies where owner_id = auth.uid())
  );

create policy "company_access" on reports
  for all using (
    company_id in (select id from companies where owner_id = auth.uid())
  );
```

### Wrapper functions — Supabase Vault
```sql
create or replace function public.store_credential(
  p_company_id uuid,
  p_service text,
  p_value text
) returns void as $$
declare
  v_vault_key text;
begin
  v_vault_key := 'coo_' || p_company_id || '_' || p_service;
  perform vault.create_secret(p_value, v_vault_key);
  insert into credentials (company_id, service, vault_key)
  values (p_company_id, p_service, v_vault_key)
  on conflict (company_id, service)
  do update set vault_key = v_vault_key, updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function public.read_credential(
  p_company_id uuid,
  p_service text
) returns text as $$
declare
  v_vault_key text;
  v_value text;
begin
  select vault_key into v_vault_key
  from credentials
  where company_id = p_company_id and service = p_service;

  select decrypted_secret into v_value
  from vault.decrypted_secrets
  where name = v_vault_key;

  return v_value;
end;
$$ language plpgsql security definer;
```

---

## Edge Functions

### `onboard-agent`
1. Salva credenciais no Vault via store_credential
2. Valida conexão com Notion
3. Valida conexão com Discord
4. Valida conexão com OpenClaw
5. Ativa agente (is_active = true)
6. Envia mensagem de boas-vindas no Discord

### `sync-notion-tasks`
1. Lê database do Notion filtrando Assignee = COO
2. Upsert na tabela tasks
3. Retorna lista de tarefas pendentes

### `execute-task`
1. Lê tarefa da tabela tasks
2. Chama Claude API com contexto da tarefa + soul_md + agents_md + user_md do cliente
3. Claude decide: executar autonomamente | escalar para humano | bloquear
4. Atualiza status no Notion via API
5. Registra em execution_logs
6. Notifica no Discord

```typescript
// Estrutura da chamada Claude API — usar chave do cliente lida do Vault
const anthropic_key = await supabase.rpc('read_credential', {
  p_company_id: company_id,
  p_service: 'anthropic'
})

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': anthropic_key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `${soul_md}\n\n${agents_md}\n\n${user_md}`,
    messages: [{
      role: 'user',
      content: `Tarefa: ${task.title}\nDescrição: ${task.description}\nPrioridade: ${task.priority}\n\nDecida e execute.`
    }]
  })
})
```

### `generate-report`
1. Agrega tarefas do dia por status
2. Chama Claude API para formatar relatório
3. Salva na tabela reports
4. Envia no Discord

### `discord-webhook`
Recebe comandos do Discord.
Comandos: status | backlog | executa | pausa | retoma | report

---

## Telas

### `/onboarding` — 4 etapas
- Etapa 1: nome da empresa, fuso horário
- Etapa 2: Claude API Key, OpenClaw Workspace URL, OpenClaw Token
- Etapa 3: Notion Token, Notion Database ID, Discord Bot Token, Discord Server ID, Discord Channel ID
- Etapa 4: horários dos cron jobs, contexto da empresa (texto livre → USER.md), botão "Ativar Agent COO"

### `/dashboard` — Painel principal
- Header: nome da empresa + status do agente + botão pausar/retomar
- Cards: tarefas concluídas hoje, em andamento, bloqueadas, último relatório
- Lista de tarefas com status, prioridade, filtros, botão "Sincronizar Notion"
- Feed de logs em tempo real via Supabase Realtime

### `/configuracoes` — Settings
- Aba Credenciais: editar API keys
- Aba Agente: editar soul_md, agents_md, user_md
- Aba Horários: editar cron jobs
- Aba Integrações: editar Notion e Discord
- Aba Demonstração (admin only): botão carregar dados demo + botão limpar. NUNCA auto-oculta. Sempre visível.

---

## Ordem de build — Sprints

### Sprint 1 — Fundação
- Migrations: todas as tabelas + RLS + wrapper functions do Vault
- Layout shell: sidebar, header, roteamento
- Rotas: /onboarding, /dashboard, /configuracoes
- Commit ao final

### Sprint 2 — Onboarding
- Tela /onboarding com 4 etapas
- Edge Function onboard-agent
- Validação de credenciais em tempo real
- Mensagem de boas-vindas no Discord
- Commit ao final

### Sprint 3 — Dashboard + Notion
- Tela /dashboard completa
- Edge Function sync-notion-tasks
- Feed de logs em tempo real (Supabase Realtime)
- Cards de resumo
- Commit ao final

### Sprint 4 — Agente + Execução
- Edge Function execute-task com Claude API
- Edge Function generate-report
- Edge Function discord-webhook
- Cron jobs: 08h00 morning briefing, 12h00 checkpoint, 18h00 daily report (seg-sex)
- Commit ao final

### Sprint 5 — Configurações + Polish
- Tela /configuracoes com todas as abas
- Aba Demonstração com seed de dados
- Empty states, skeletons, error states
- Commit ao final

---

## Regras críticas

- NUNCA usar triggers em auth.users — sempre bootstrap_current_user()
- Supabase Vault via wrapper functions no schema public — NUNCA .schema('vault') direto
- Toda credencial do cliente vai pro Vault — nunca em texto puro no banco
- Claude API key usada nas Edge Functions é a do cliente, lida do Vault via read_credential()
- NUNCA OpenAI — sempre Claude API (Anthropic), modelo claude-sonnet-4-20250514
- Design system em: C:\Users\sahho\Documents\Projetos\viver-de-ia\design-system
- Aba Demonstração: sempre visível, dois estados apenas (carregar/limpar), nunca auto-oculta
- Lovable cuida dos deploys — nunca Supabase CLI local

---

## Checklist de entrega

- [ ] Onboarding funcionando com validação de credenciais
- [ ] Agente ativando e enviando mensagem no Discord
- [ ] Backlog sincronizando do Notion
- [ ] Dashboard com logs em tempo real
- [ ] Relatório diário sendo gerado e enviado
- [ ] Credenciais salvas no Vault
- [ ] Aba Demonstração com seed de dados
- [ ] RLS validado — usuário só vê dados da própria empresa
- [ ] Deploy no Lovable Cloud funcionando
