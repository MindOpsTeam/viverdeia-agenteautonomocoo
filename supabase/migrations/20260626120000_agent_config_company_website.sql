-- Site da empresa em coluna durável (antes vivia só no onboarding draft, que é zerado no reset).
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS company_website text;
