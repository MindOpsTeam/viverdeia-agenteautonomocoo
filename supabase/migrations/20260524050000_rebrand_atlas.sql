-- Rebranding → Atlas
-- Default do nome do agente passa de 'COO' para 'Atlas' e migra linhas existentes.
-- Não toca em contratos: assigned_to='coo', nomes de Edge Functions, RPCs.

ALTER TABLE public.company_context ALTER COLUMN agent_name SET DEFAULT 'Atlas';

UPDATE public.company_context SET agent_name = 'Atlas' WHERE agent_name = 'COO';
