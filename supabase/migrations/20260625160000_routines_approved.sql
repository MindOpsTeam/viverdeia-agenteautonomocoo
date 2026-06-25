-- D3: flag de aprovação explícita da rotina (status='active' continua sendo o gatilho de execução).
ALTER TABLE public.routines ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
UPDATE public.routines SET approved = true WHERE status = 'active' AND approved = false;
