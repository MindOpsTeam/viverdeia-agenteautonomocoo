-- Heartbeat: saúde da instância + leitura service-role da credencial por empresa.

-- Colunas de saúde/propagação na instância.
ALTER TABLE public.atlas_instances ADD COLUMN IF NOT EXISTS last_seen timestamptz;
ALTER TABLE public.atlas_instances ADD COLUMN IF NOT EXISTS system_prompt text;

-- read_credential_service: lê o segredo do Vault por empresa SEM checar auth.uid()
-- (uso interno por Edge Functions com service role — ex.: heartbeat). NÃO exposta a anon/authenticated.
CREATE OR REPLACE FUNCTION public.read_credential_service(p_company_id uuid, p_service text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_vault_key text;
  v_value text;
BEGIN
  v_vault_key := 'coo_' || p_company_id::text || '_' || p_service;
  SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets WHERE name = v_vault_key;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.read_credential_service(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_credential_service(uuid, text) TO service_role;
