-- Application ID do app Discord (necessário para registrar os slash commands via API).
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS discord_application_id text;
