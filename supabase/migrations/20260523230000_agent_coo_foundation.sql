-- Agent COO — Sprint 1: Foundation
-- Tables: companies, credentials, agent_config, tasks, execution_logs, reports
-- RLS + Vault wrapper functions (store_credential, read_credential)

-- ============================================================
-- companies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_owner_id_idx ON public.companies(owner_id);

-- ============================================================
-- credentials
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('anthropic', 'openclaw', 'notion', 'discord')),
  vault_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, service)
);

CREATE INDEX IF NOT EXISTS credentials_company_id_idx ON public.credentials(company_id);

-- ============================================================
-- agent_config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  notion_database_id TEXT,
  discord_channel_id TEXT,
  discord_server_id TEXT,
  openclaw_workspace_url TEXT,
  soul_md TEXT,
  agents_md TEXT,
  user_md TEXT,
  morning_briefing_time TEXT DEFAULT '08:00',
  checkpoint_time TEXT DEFAULT '12:00',
  daily_report_time TEXT DEFAULT '18:00',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notion_task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'blocked')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assigned_to TEXT DEFAULT 'coo',
  result TEXT,
  error_log TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, notion_task_id)
);

CREATE INDEX IF NOT EXISTS tasks_company_id_idx ON public.tasks(company_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);

-- ============================================================
-- execution_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('action', 'report', 'error', 'briefing')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS execution_logs_company_id_idx ON public.execution_logs(company_id);
CREATE INDEX IF NOT EXISTS execution_logs_created_at_idx ON public.execution_logs(created_at DESC);

-- ============================================================
-- reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly', 'checkpoint')),
  content TEXT NOT NULL,
  tasks_done INTEGER DEFAULT 0,
  tasks_doing INTEGER DEFAULT 0,
  tasks_blocked INTEGER DEFAULT 0,
  sent_to_discord BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_company_id_idx ON public.reports(company_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_access" ON public.companies;
CREATE POLICY "owner_access" ON public.companies
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "company_access" ON public.credentials;
CREATE POLICY "company_access" ON public.credentials
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.agent_config;
CREATE POLICY "company_access" ON public.agent_config
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.tasks;
CREATE POLICY "company_access" ON public.tasks
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.execution_logs;
CREATE POLICY "company_access" ON public.execution_logs
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.reports;
CREATE POLICY "company_access" ON public.reports
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- ============================================================
-- Vault wrapper functions
-- Always called via public schema; never .schema('vault') from clients.
-- ============================================================

CREATE OR REPLACE FUNCTION public.store_credential(
  p_company_id UUID,
  p_service TEXT,
  p_value TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_vault_key TEXT;
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.companies WHERE id = p_company_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_service NOT IN ('anthropic', 'openclaw', 'notion', 'discord') THEN
    RAISE EXCEPTION 'invalid service: %', p_service;
  END IF;

  v_vault_key := 'coo_' || p_company_id::text || '_' || p_service;

  -- Remove previous secret with same name (vault.create_secret requires unique names)
  DELETE FROM vault.secrets WHERE name = v_vault_key;

  PERFORM vault.create_secret(p_value, v_vault_key);

  INSERT INTO public.credentials (company_id, service, vault_key)
  VALUES (p_company_id, p_service, v_vault_key)
  ON CONFLICT (company_id, service)
  DO UPDATE SET vault_key = EXCLUDED.vault_key, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.read_credential(
  p_company_id UUID,
  p_service TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_vault_key TEXT;
  v_value TEXT;
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.companies WHERE id = p_company_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT vault_key INTO v_vault_key
  FROM public.credentials
  WHERE company_id = p_company_id AND service = p_service;

  IF v_vault_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_value
  FROM vault.decrypted_secrets
  WHERE name = v_vault_key;

  RETURN v_value;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.store_credential(UUID, TEXT, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.read_credential(UUID, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.store_credential(UUID, TEXT, TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.read_credential(UUID, TEXT) TO authenticated;

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_credentials   ON public.credentials;
DROP TRIGGER IF EXISTS set_updated_at_agent_config  ON public.agent_config;
DROP TRIGGER IF EXISTS set_updated_at_tasks         ON public.tasks;

CREATE TRIGGER set_updated_at_credentials   BEFORE UPDATE ON public.credentials   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_agent_config  BEFORE UPDATE ON public.agent_config  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_tasks         BEFORE UPDATE ON public.tasks         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
