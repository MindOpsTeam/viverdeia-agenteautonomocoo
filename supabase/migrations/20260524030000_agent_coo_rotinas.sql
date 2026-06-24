-- Agent COO — Sprint 10: Rotinas
-- routines: rotinas recorrentes. Criadas no painel pelo admin (status 'active') ou
-- solicitadas via Discord (status 'pending_approval'). instance_id do /docs -> company_id.

CREATE TABLE IF NOT EXISTS public.routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  schedule_time TIME,
  schedule_day INT,                  -- weekly: 0-6 (dia da semana); monthly: dia do mês
  instruction TEXT NOT NULL,
  target_system TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('active', 'paused', 'pending_approval', 'rejected')),
  requested_by TEXT,                 -- '@handle via Discord'
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routines_company_id_idx ON public.routines(company_id);
CREATE INDEX IF NOT EXISTS routines_status_idx ON public.routines(status);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.routines;
CREATE POLICY "company_access" ON public.routines
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- ============================================================
-- updated_at trigger
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_routines ON public.routines;
CREATE TRIGGER set_updated_at_routines BEFORE UPDATE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Realtime (aprovações aparecem ao vivo no painel)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'routines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.routines;
  END IF;
END $$;

ALTER TABLE public.routines REPLICA IDENTITY FULL;
