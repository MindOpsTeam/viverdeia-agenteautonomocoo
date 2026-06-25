-- Instâncias do Atlas registradas pelo instalador (instance-register na VPS).

CREATE TABLE IF NOT EXISTS atlas_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id),
  hostname text,
  openclaw_version text,
  ingress_url text,
  hooks_token text,
  openclaw_dashboard_token text,
  agent_type text DEFAULT 'atlas_coo',
  registered_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Uma instância por owner (necessário para o upsert onConflict owner_user_id).
CREATE UNIQUE INDEX IF NOT EXISTS atlas_instances_owner_uidx ON atlas_instances(owner_user_id);

ALTER TABLE atlas_instances ENABLE ROW LEVEL SECURITY;

-- O instance-register escreve via service role (ignora RLS).
DROP POLICY IF EXISTS "service_role only" ON atlas_instances;
CREATE POLICY "service_role only" ON atlas_instances
  USING (auth.role() = 'service_role');

-- Owner pode ler a própria instância no painel.
DROP POLICY IF EXISTS "owner read" ON atlas_instances;
CREATE POLICY "owner read" ON atlas_instances
  FOR SELECT USING (owner_user_id = auth.uid());
