-- Agent COO — Sprint 11: Conversar (Histórico de canais)
-- channel_messages: tudo que o agente recebeu/enviou nos canais externos.
-- Retida para sempre (regra 9.8) — sem deleção automática. instance_id -> company_id.

CREATE TABLE IF NOT EXISTS public.channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'discord' CHECK (platform IN ('discord', 'slack')),
  sender TEXT NOT NULL,              -- 'agent' | @handle do membro
  message_type TEXT CHECK (message_type IN ('command', 'response', 'report', 'alert')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_messages_company_id_idx ON public.channel_messages(company_id);
CREATE INDEX IF NOT EXISTS channel_messages_created_at_idx ON public.channel_messages(created_at DESC);

ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.channel_messages;
CREATE POLICY "company_access" ON public.channel_messages
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Realtime: histórico de canais ao vivo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'channel_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;
  END IF;
END $$;

ALTER TABLE public.channel_messages REPLICA IDENTITY FULL;
