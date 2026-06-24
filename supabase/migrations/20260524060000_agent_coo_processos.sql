-- Agent COO (Atlas) — Sprint 13: Processos
-- processes: repositório de processos com visibilidade, status e passos estruturados.

CREATE TABLE IF NOT EXISTS public.processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area TEXT,
  visibility TEXT NOT NULL DEFAULT 'admin' CHECK (visibility IN ('admin', 'authorized_team', 'everyone')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  steps JSONB NOT NULL DEFAULT '[]',          -- [{ description, responsible, sla }]
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'imported', 'ai')),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processes_company_id_idx ON public.processes(company_id);
CREATE INDEX IF NOT EXISTS processes_status_idx ON public.processes(status);

ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.processes;
CREATE POLICY "company_access" ON public.processes
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_processes ON public.processes;
CREATE TRIGGER set_updated_at_processes BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'processes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.processes;
  END IF;
END $$;

ALTER TABLE public.processes REPLICA IDENTITY FULL;
