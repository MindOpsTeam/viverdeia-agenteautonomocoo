-- Agent COO — Sprint 7: Cérebro
-- Tables: company_context, directives, knowledge_files (+ agent_config brain columns)
-- RLS company_access + updated_at triggers + realtime + storage bucket 'knowledge'

-- ============================================================
-- company_context  (fonte estruturada da identidade do agente)
-- Compila para agent_config.soul_md/agents_md/user_md no "Sincronizar cérebro" (D1).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_name TEXT DEFAULT 'COO',
  communication_tone TEXT DEFAULT 'direct' CHECK (communication_tone IN ('direct', 'formal', 'informal')),
  presentation TEXT,
  operational_context TEXT,
  generated_by_ai BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- directives  (regras de comportamento; manual / ai_suggestion / wizard)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ai_suggestion', 'wizard')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending_approval', 'rejected')),
  origin_event TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS directives_company_id_idx ON public.directives(company_id);
CREATE INDEX IF NOT EXISTS directives_status_idx ON public.directives(status);

-- ============================================================
-- knowledge_files  (kind='file': uploads; kind='source': fontes automáticas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT DEFAULT 'file' CHECK (kind IN ('file', 'source')),
  filename TEXT NOT NULL,            -- nome do arquivo OU rótulo da fonte
  file_type TEXT,                    -- pdf/docx/xlsx/txt para arquivos
  source_type TEXT,                  -- 'notion' | 'discord' | ... para kind='source'
  storage_path TEXT,                 -- caminho no bucket 'knowledge' (kind='file')
  status TEXT DEFAULT 'indexing' CHECK (status IN ('indexing', 'available', 'error')),
  active BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_files_company_id_idx ON public.knowledge_files(company_id);

-- ============================================================
-- agent_config: colunas de versão/sync do cérebro
-- ============================================================
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS brain_version TEXT;
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS brain_synced_at TIMESTAMPTZ;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.company_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directives      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.company_context;
CREATE POLICY "company_access" ON public.company_context
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.directives;
CREATE POLICY "company_access" ON public.directives
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "company_access" ON public.knowledge_files;
CREATE POLICY "company_access" ON public.knowledge_files
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- ============================================================
-- updated_at triggers (reusa public.set_updated_at da Sprint 1)
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_company_context ON public.company_context;
DROP TRIGGER IF EXISTS set_updated_at_directives      ON public.directives;
DROP TRIGGER IF EXISTS set_updated_at_knowledge_files ON public.knowledge_files;

CREATE TRIGGER set_updated_at_company_context BEFORE UPDATE ON public.company_context FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_directives      BEFORE UPDATE ON public.directives      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_knowledge_files BEFORE UPDATE ON public.knowledge_files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Realtime (sugestões de diretriz + status de indexação ao vivo)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'directives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.directives;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'knowledge_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_files;
  END IF;
END $$;

ALTER TABLE public.directives      REPLICA IDENTITY FULL;
ALTER TABLE public.knowledge_files REPLICA IDENTITY FULL;

-- ============================================================
-- Storage: bucket privado 'knowledge' + acesso por empresa
-- Caminho dos objetos: <company_id>/<arquivo>
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "knowledge_company_access" ON storage.objects;
CREATE POLICY "knowledge_company_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.companies WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.companies WHERE owner_id = auth.uid())
  );
