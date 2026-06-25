-- agent_runs: rastreio dos disparos do coo-orchestrator para a instância OpenClaw (VPS).
-- O coo-reply atualiza o run por run_id (status/content/result).

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('task', 'routine', 'brain_sync')),
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  routine_id uuid REFERENCES public.routines(id) ON DELETE SET NULL,
  instance_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatched', 'done', 'blocked', 'error')),
  content text,
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_company_idx ON public.agent_runs(company_id);
CREATE INDEX IF NOT EXISTS agent_runs_task_idx ON public.agent_runs(task_id);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.agent_runs;
CREATE POLICY "company_access" ON public.agent_runs
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_agent_runs ON public.agent_runs;
CREATE TRIGGER set_updated_at_agent_runs BEFORE UPDATE ON public.agent_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
