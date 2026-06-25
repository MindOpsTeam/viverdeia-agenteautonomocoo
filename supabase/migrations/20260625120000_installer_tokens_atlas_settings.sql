-- Instalador Atlas: tabelas installer_tokens (tokens de instalação) e atlas_settings
-- (config global/por usuário, ex.: brain_repo_url). Portado da base Nina.

CREATE TABLE IF NOT EXISTS installer_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id),
  expires_at timestamptz DEFAULT (now() + interval '30 minutes'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  brain_repo_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE installer_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_settings ENABLE ROW LEVEL SECURITY;

-- Só o service_role acessa installer_tokens
DROP POLICY IF EXISTS "service_role only" ON installer_tokens;
CREATE POLICY "service_role only" ON installer_tokens
  USING (auth.role() = 'service_role');

-- Owner lê e atualiza atlas_settings
DROP POLICY IF EXISTS "owner access" ON atlas_settings;
CREATE POLICY "owner access" ON atlas_settings
  USING (user_id = auth.uid());
