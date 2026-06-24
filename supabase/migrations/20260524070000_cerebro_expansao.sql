-- Sprint 18: Expansão do Cérebro (reverte D1 — GitHub passa a ser o canal de skills)

-- company_context: identidade + conhecimento expandidos
ALTER TABLE public.company_context ADD COLUMN IF NOT EXISTS mission TEXT;
ALTER TABLE public.company_context ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE public.company_context ADD COLUMN IF NOT EXISTS cases JSONB DEFAULT '[]';          -- [{ title, result }]
ALTER TABLE public.company_context ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE public.company_context ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]';        -- [{ name, description }]
ALTER TABLE public.company_context ADD COLUMN IF NOT EXISTS skills_enabled JSONB DEFAULT '[]';  -- ["ler-backlog", ...]

-- agent_config: infra GitHub/VPS
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS github_repo_url TEXT;
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS vps_url TEXT;
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS github_commit_hash TEXT;

-- credentials: permitir github/vps no Vault
ALTER TABLE public.credentials DROP CONSTRAINT IF EXISTS credentials_service_check;
ALTER TABLE public.credentials ADD CONSTRAINT credentials_service_check
  CHECK (service IN ('anthropic', 'openclaw', 'notion', 'discord', 'github', 'vps'));

-- store_credential: aceitar os novos serviços (mesma lógica, lista ampliada)
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

  IF p_service NOT IN ('anthropic', 'openclaw', 'notion', 'discord', 'github', 'vps') THEN
    RAISE EXCEPTION 'invalid service: %', p_service;
  END IF;

  v_vault_key := 'coo_' || p_company_id::text || '_' || p_service;

  DELETE FROM vault.secrets WHERE name = v_vault_key;
  PERFORM vault.create_secret(p_value, v_vault_key);

  INSERT INTO public.credentials (company_id, service, vault_key)
  VALUES (p_company_id, p_service, v_vault_key)
  ON CONFLICT (company_id, service)
  DO UPDATE SET vault_key = EXCLUDED.vault_key, updated_at = now();
END;
$$;
