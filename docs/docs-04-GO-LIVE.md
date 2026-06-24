# Go-Live & Onboarding — Atlas

Guia operacional do primeiro uso. Pré-requisito: o deploy já está feito
(banco migrado, 18 Edge Functions ativas, cron `coo-tick` agendado).

- **Projeto (Supabase ref):** `pmrzuqocgefrlookjnxh`
- **Base URL das functions:** `https://pmrzuqocgefrlookjnxh.supabase.co/functions/v1/`
- **Modelo Claude:** `claude-sonnet-4-6`

---

## 0. Visão geral do fluxo

```
Cliente faz onboarding no painel → credenciais no Vault → Atlas ativado
        ↓
Cérebro (identidade/guardrails/conhecimento) → "Sincronizar tudo"
        ↓
Compila skills → commita no repo GitHub do cliente → VPS (OpenClaw) puxa
        ↓
coo-tick (cron 1×/min) dispara rotinas/relatórios · discord-webhook recebe comandos
        ↓
Dashboard em tempo real no painel
```

---

## 1. Pré-requisitos — credenciais a obter ANTES do onboarding

| Serviço | O que pegar | Onde |
|---|---|---|
| **Anthropic** | API Key (`sk-ant-...`) | console.anthropic.com → **API Keys**. (Modelo usado: `claude-sonnet-4-6`.) |
| **Notion** | Integration Token (`secret_...` ou `ntn_...`) + **Database ID** | notion.so/my-integrations → **New integration** (internal) → copie o token. Abra o banco de backlog → **Connections** → conecte a integração. Database ID = o hash de 32 chars na URL do banco. |
| **Discord** | **Bot Token**, **Public Key**, **Application ID**, **Server (Guild) ID**, **Channel ID** | discord.com/developers/applications → **New Application** (ver §4). |
| **OpenClaw / VPS** | **Workspace URL** + **Token** | Provisione o OpenClaw na VPS Hostinger e crie um workspace (ver §6). |
| **GitHub** | **Repo URL** (privado) + **PAT** | Crie um repo privado por cliente + um PAT fine-grained (ver §5). |

> Tudo o que é segredo (keys/tokens/PAT) é guardado **criptografado no Supabase Vault** via `store_credential`. URLs/IDs não-secretos ficam em `agent_config`.

---

## 2. Primeiro uso no painel (passo a passo)

1. **Cadastro do primeiro usuário** (`/auth`). O **primeiro** usuário vira **admin** automaticamente e cai na Home (`/`).
2. **Onboarding Wizard** (tela cheia, 5 etapas):
   - **Chaves** — nome da empresa + fuso + **Anthropic API Key** (valida na hora).
   - **Integrações** — **Notion** (token + database ID) + **Discord** (bot token + server ID + channel ID) (valida).
   - **Identidade** — nome do Atlas, tom, missão, público-alvo, cases, apresentação (ou use o **wizard com IA**).
   - **Instalar** — **OpenClaw Workspace URL + Token** (valida).
   - **Ativar** — "Concluir e começar a operar" → grava credenciais no Vault, cria `companies` + `agent_config`, ativa o agente, envia boas-vindas no Discord.
3. **Configurações → Credenciais** — preencha **GitHub** (repo URL + PAT) e **VPS** (URL + token) e clique **"Testar conexão"** em cada.
4. **Configurações → Integrações** — salve o **Discord Public Key** (campo `discord_public_key`) — **necessário antes** de configurar o Interactions Endpoint no Discord (§4).
5. **Cérebro** — preencha Identidade / Guardrails / Conhecimento (produtos, habilidades, contexto, arquivos) e clique **"Sincronizar tudo"** → compila e **commita no repo GitHub** (o hash do commit aparece no Resumo).
6. **Time & Canais** — cadastre os membros (handle do Discord + permissões: *Pode dar ordens / Recebe notificações / Autoriza aprovações / Somente leitura*) e os canais com seus propósitos.
7. **Backlog** — clique **"Sincronizar Notion"** para puxar as tarefas atribuídas ao Atlas.
8. **Rotinas** — crie as rotinas recorrentes (entram ativas).

---

## 3. Notion — detalhe

- A integração precisa estar **conectada ao banco** (Connections), senão a API retorna 404/sem acesso.
- O Atlas sincroniza tarefas cujo **Assignee/Responsável** contenha **"Atlas"** (ou **"COO"**, por compatibilidade).
- Status no Notion mapeados: `Done/Concluído → done`, `Doing/Em andamento → doing`, `Blocked/Bloqueado → blocked`, demais → `todo`.

---

## 4. Discord — configuração completa

No **Developer Portal** (discord.com/developers/applications), na sua aplicação:

1. **Bot** → *Reset Token* → copie o **Bot Token** (vai no onboarding).
2. **General Information** → copie a **Public Key** e o **Application ID**.
   - Salve a **Public Key** no painel em **Configurações → Integrações** (`discord_public_key`).
3. **Convide o bot** no servidor (OAuth2 → URL Generator → scopes `bot` + `applications.commands`; permissões: *Send Messages, Read Message History, Use Slash Commands*). Pegue o **Server (Guild) ID** e o **Channel ID** (modo desenvolvedor do Discord → botão direito → Copiar ID).
4. **Interactions Endpoint URL** (General Information):
   ```
   https://pmrzuqocgefrlookjnxh.supabase.co/functions/v1/discord-webhook
   ```
   > ⚠️ O Discord faz um **PING de verificação** ao salvar — por isso a `discord_public_key` precisa **já estar salva** no painel (passo 2) antes de salvar essa URL. A function já está com `verify_jwt: false` (o Discord chama sem JWT do Supabase).
5. **Registrar os slash commands** (não é automático). Via API do Discord (substitua `APP_ID`, `GUILD_ID`, `BOT_TOKEN`):
   ```bash
   for c in status backlog executa pausa retoma report processo; do
     curl -s -X POST "https://discord.com/api/v10/applications/APP_ID/guilds/GUILD_ID/commands" \
       -H "Authorization: Bot BOT_TOKEN" -H "Content-Type: application/json" \
       -d "{\"name\":\"$c\",\"type\":1,\"description\":\"Atlas: $c\"}"
   done
   # /processo aceita um argumento (nome do processo):
   curl -s -X POST "https://discord.com/api/v10/applications/APP_ID/guilds/GUILD_ID/commands" \
     -H "Authorization: Bot BOT_TOKEN" -H "Content-Type: application/json" \
     -d '{"name":"processo","type":1,"description":"Consultar um processo","options":[{"name":"nome","description":"nome do processo","type":3,"required":true}]}'
   ```
   Comandos: `status`, `backlog`, `executa`, `pausa`, `retoma`, `report`, `processo <nome>`.
6. **Permissões dos membros:** quem não tiver "Pode dar ordens" recebe resposta educada + o admin é avisado no painel. Cadastre os handles em **Time & Canais** com o mesmo nome de usuário do Discord.

---

## 5. GitHub — repo de skills do cliente

1. Crie um **repositório PRIVADO por cliente** (ex.: `acme-atlas-skills`).
2. **Inicialize com pelo menos 1 commit** (ex.: um `README.md`) — o `brain-sync` precisa que a branch default exista (senão retorna erro "branch vazia").
3. Crie um **PAT fine-grained** com acesso **Contents: Read and write** **apenas** nesse repo (Settings → Developer settings → Fine-grained tokens).
4. No painel: **Configurações → Credenciais → GitHub** → cole a **Repo URL** (`https://github.com/cliente/acme-atlas-skills`) + o **PAT** → **Testar conexão**.
5. Ao **"Sincronizar tudo"** no Cérebro, o Atlas commita:
   ```
   identity.md · guardrails.md · system_prompt.md
   knowledge/products.md · knowledge/context.md
   skills/enabled.md
   ```
   O **hash do commit** aparece no Resumo do Cérebro. Isolamento total: o PAT é do cliente e só dá acesso ao repo dele.

---

## 6. VPS Hostinger — OpenClaw (executor)

1. Provisione o **OpenClaw** na VPS do cliente e crie um **workspace**.
2. Pegue a **URL do workspace** e gere um **token de acesso**.
3. No painel: **Configurações → Credenciais → VPS** → URL + token → **Testar conexão**.
4. Configure o `brain_sync` da VPS para **puxar o repo GitHub** (~2 min) — assim a VPS roda sempre a última skill compilada.
5. O OpenClaw é quem **executa de fato** as ações de browser (sistemas sem API): navega, preenche formulários, extrai dados — com a evidência registrada antes de marcar a tarefa como concluída.

---

## 7. Verificação pós go-live (smoke test)

- **Functions vivas:** `curl -i https://pmrzuqocgefrlookjnxh.supabase.co/functions/v1/brain-sync` → **401** (existe; exige auth). 404 = não deployada.
- **Cron rodando:**
  ```sql
  select status, return_message, start_time from cron.job_run_details
  where jobid=(select jobid from cron.job where jobname='coo-tick')
  order by start_time desc limit 5;   -- esperado: succeeded; net._http_response com status 200 {"ok":true,...}
  ```
- **Discord:** o Interactions Endpoint salva sem erro (verificação OK) e `/status` responde no canal.
- **Notion:** "Sincronizar Notion" no Backlog traz as tarefas atribuídas ao Atlas.
- **Cérebro:** "Sincronizar tudo" gera um commit no repo GitHub (hash visível).

---

## 8. Operação & retenção

- **Relatórios automáticos:** briefing matinal (08h), checkpoint (12h), diário (18h) — seg–sex, no fuso da empresa (configurável em Configurações → Instância/Horários). Forçar envio: Relatórios → "Enviar relatório agora".
- **Rotinas:** disparadas pelo `coo-tick` no horário; criam tarefa + executam via OpenClaw.
- **Sugestões de processo:** geradas 1×/dia (03h) a partir das execuções observadas.
- **Retenção:** logs de execução, histórico de tarefas e mensagens de canais são mantidos **para sempre** (nunca deletados automaticamente).

## 9. Débitos técnicos conhecidos (não bloqueiam o go-live)

1. **RLS owner-scoped:** hoje só o **dono** (admin que fez o onboarding) enxerga os dados via RLS; operadores não-donos caem em estado vazio — revisar policies para multiusuário por empresa.
2. **Aprovação de rotina via Discord:** o comando ainda não existe no webhook (aprovação só no painel).
3. **Ações reais a partir do Chat direto:** hoje o chat é conversacional (não executa ações).
4. **DOCX na importação de processos:** best-effort (extração de texto); se falhar, oriente converter para PDF.
5. **Cron `coo-tick`:** agendado via `cron.schedule` chamando a function com a anon key pública (a function usa a service role injetada internamente).
