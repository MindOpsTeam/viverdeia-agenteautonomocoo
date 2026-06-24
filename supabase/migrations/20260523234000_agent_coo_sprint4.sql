-- Sprint 4 additions:
-- 1. discord_public_key on agent_config (used by discord-webhook to verify interactions)
-- 2. pg_cron + pg_net extensions for time-driven dispatch

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS discord_public_key TEXT;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Helper: dispatch coo-tick once per minute. The edge function decides which
-- companies match their morning/checkpoint/daily time *in the company's timezone*.
-- The project URL and service role key must exist in vault as 'project_url'
-- and 'service_role_key' (Lovable Cloud / Supabase convention).
-- If they are missing, the schedule call is registered but executions will no-op
-- with an HTTP error — see execution_logs for diagnostics.

DO $$
DECLARE
  v_project_url TEXT;
  v_service_key TEXT;
  v_job_id BIGINT;
BEGIN
  -- Best effort: skip scheduling if the vault entries we expect are missing.
  SELECT decrypted_secret INTO v_project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_project_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Skipping cron.schedule for coo-tick: vault missing project_url or service_role_key. Schedule manually after configuring vault.';
    RETURN;
  END IF;

  -- Unschedule existing job if it exists (idempotency)
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'coo-tick';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'coo-tick',
    '* * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
      $cron$,
      v_project_url || '/functions/v1/coo-tick',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      )::text
    )
  );
END $$;
