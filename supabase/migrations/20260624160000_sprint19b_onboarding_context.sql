-- Sprint 19b: contexto de negócio no onboarding (alimenta a IA de identidade/guardrails).

ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS segment TEXT;
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS business_model TEXT;   -- B2B | B2C | B2B2C | Marketplace
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS team_size TEXT;
-- main_challenges: array de até 3 desafios operacionais escolhidos no onboarding
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS main_challenges JSONB DEFAULT '[]';
