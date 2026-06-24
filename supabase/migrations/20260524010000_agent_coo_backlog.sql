-- Agent COO — Sprint 8: Backlog
-- Estende public.tasks com campos de origem, evidência, bloqueio e passos.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'notion';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_adhoc BOOLEAN DEFAULT false;

-- Origem permitida (notion no MVP; demais já previstos para não re-migrar).
DO $$
BEGIN
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_source_check
    CHECK (source IN ('notion', 'asana', 'discord', 'slack', 'routine', 'manual'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS tasks_source_idx ON public.tasks(source);
