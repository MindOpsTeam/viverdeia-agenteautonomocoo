-- D4: leitura para operadores do painel (user_roles), mantendo escrita só para owner/admin.
-- Modelo real do painel: profiles + user_roles (app_role: admin|supervisor|agent). NÃO team_members.

-- staff = qualquer usuário com role no painel (SECURITY DEFINER evita recursão de RLS em user_roles).
CREATE OR REPLACE FUNCTION public.is_company_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_company_staff() FROM public;
GRANT EXECUTE ON FUNCTION public.is_company_staff() TO authenticated, service_role;

-- Tabelas com company_id: leitura = owner OU staff; escrita = owner OU admin.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tasks','routines','execution_logs','reports','processes','knowledge_files','directives','channels'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "company_access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "read_access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "write_access" ON public.%I', t);

    EXECUTE format($f$
      CREATE POLICY "read_access" ON public.%I FOR SELECT USING (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
        OR public.is_company_staff()
      )$f$, t);

    EXECUTE format($f$
      CREATE POLICY "write_access" ON public.%I FOR ALL USING (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      ) WITH CHECK (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )$f$, t);
  END LOOP;
END $$;

-- agent_runs: mantém "service_role write"; troca a leitura para owner + staff.
DROP POLICY IF EXISTS "owner read" ON public.agent_runs;
DROP POLICY IF EXISTS "read_access" ON public.agent_runs;
CREATE POLICY "read_access" ON public.agent_runs FOR SELECT USING (
  company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  OR public.is_company_staff()
);
