-- Agent COO — Sprint 9: Time & Canais
-- team_members (pessoas externas no Discord/Slack) + channels (canais e propósitos).
-- Distinto de profiles/user_roles (usuários do painel). instance_id do /docs -> company_id.

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,                       -- @usuario no Discord/Slack
  channel TEXT NOT NULL DEFAULT 'discord' CHECK (channel IN ('discord', 'slack')),
  role TEXT,
  -- níveis: can_command | receives_notifications | authorizes_approvals | readonly
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_members_company_id_idx ON public.team_members(company_id);

CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                         -- #operacoes
  platform TEXT NOT NULL DEFAULT 'discord' CHECK (platform IN ('discord', 'slack')),
  -- propósitos: receive_commands | send_reports | alerts | notifications
  purposes TEXT[] NOT NULL DEFAULT '{}',
  mention_member_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channels_company_id_idx ON public.channels(company_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.team_members;
CREATE POLICY "company_access" ON public.team_members
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.channels;
CREATE POLICY "company_access" ON public.channels
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- ============================================================
-- updated_at triggers
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_team_members ON public.team_members;
DROP TRIGGER IF EXISTS set_updated_at_channels     ON public.channels;

CREATE TRIGGER set_updated_at_team_members BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_channels     BEFORE UPDATE ON public.channels     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
