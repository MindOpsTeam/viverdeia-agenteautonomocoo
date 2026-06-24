-- Sprint 19: Reformulação do onboarding (8 etapas, persistência por etapa,
-- múltiplos databases Notion, providers de backlog/comunicação).

-- ============================================================
-- agent_config: multi-database Notion + escolha de providers
-- ============================================================
-- notion_database_ids: array de objetos [{ database_id, name, type }]
--   type ∈ 'backlog' (Atlas lê/executa) | 'knowledge' (Cérebro) | 'ignore' (não monitora)
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS notion_database_ids JSONB DEFAULT '[]';
-- provider do backlog e da comunicação (Asana/Slack ficam para fase 2; UI mostra "Em breve")
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS backlog_provider TEXT DEFAULT 'notion';
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS comm_provider TEXT DEFAULT 'discord';

ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_backlog_provider_check;
ALTER TABLE public.agent_config ADD CONSTRAINT agent_config_backlog_provider_check
  CHECK (backlog_provider IN ('notion', 'asana'));
ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_comm_provider_check;
ALTER TABLE public.agent_config ADD CONSTRAINT agent_config_comm_provider_check
  CHECK (comm_provider IN ('discord', 'slack'));

-- ============================================================
-- onboarding_progress: retomada com posição + rascunho não-secreto
-- ============================================================
-- company_id: vincula o progresso à empresa materializada na etapa 1
ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
-- current_step: etapa em que o usuário parou (1..8) para retomar a posição
ALTER TABLE public.onboarding_progress ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 1;
-- draft: estado não-secreto que não tem coluna própria
--   (flags de validação por serviço, etapas puladas, escolhas transitórias).
--   Segredos NUNCA entram aqui — vão para o Vault via store_credential.
ALTER TABLE public.onboarding_progress ADD COLUMN IF NOT EXISTS draft JSONB DEFAULT '{}';
