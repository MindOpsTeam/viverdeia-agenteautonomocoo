-- Sprint 16: Motor de sugestões de processos
-- process_suggestions: passos sugeridos pelo Atlas a partir de execuções observadas.

CREATE TABLE IF NOT EXISTS public.process_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  suggested_step JSONB NOT NULL,                 -- { description, responsible, sla }
  evidence JSONB DEFAULT '{}',                   -- { count, dates: [] }
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'ignored')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS process_suggestions_process_idx ON public.process_suggestions(process_id);
CREATE INDEX IF NOT EXISTS process_suggestions_company_status_idx ON public.process_suggestions(company_id, status);

ALTER TABLE public.process_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.process_suggestions;
CREATE POLICY "company_access" ON public.process_suggestions
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_process_suggestions ON public.process_suggestions;
CREATE TRIGGER set_updated_at_process_suggestions BEFORE UPDATE ON public.process_suggestions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'process_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.process_suggestions;
  END IF;
END $$;

ALTER TABLE public.process_suggestions REPLICA IDENTITY FULL;
