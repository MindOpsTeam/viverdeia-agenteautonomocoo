-- Sprint 20: Processos com IA de ponta a ponta
-- Importação multi-formato (áudio/vídeo/transcrição/URL) com job assíncrono + Realtime.

-- ============================================================
-- processes: transcrição de origem + rótulo de origem do import
-- ============================================================
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS import_transcript TEXT;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS import_origin TEXT;  -- ex.: "Extraído de reuniao.mp3" | "YouTube: título"

-- ============================================================
-- process_suggestions: suportar padrão NÃO documentado (sem processo existente)
-- ============================================================
ALTER TABLE public.process_suggestions ALTER COLUMN process_id DROP NOT NULL;
-- suggested_process: rascunho de processo inteiro detectado sem documentação prévia (card "O que o Atlas observou")
ALTER TABLE public.process_suggestions ADD COLUMN IF NOT EXISTS suggested_process JSONB;  -- { name, area, steps:[{description,responsible,sla}] }

-- ============================================================
-- process_imports: job assíncrono de importação (status + Realtime)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.process_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID,
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'video', 'transcript', 'document', 'url')),
  source_name TEXT,                  -- nome do arquivo ou título/URL
  storage_path TEXT,                 -- caminho no bucket 'process-imports' (áudio/vídeo/documento)
  url TEXT,                          -- URL de origem (YouTube/Loom)
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'transcribing', 'analyzing', 'structuring', 'ready', 'error')),
  progress_message TEXT,
  transcript TEXT,                   -- transcrição/texto extraído
  result JSONB DEFAULT '[]',         -- [{ name, area, steps }] — processos detectados
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS process_imports_company_idx ON public.process_imports(company_id);
CREATE INDEX IF NOT EXISTS process_imports_status_idx ON public.process_imports(company_id, status);

ALTER TABLE public.process_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_access" ON public.process_imports;
CREATE POLICY "company_access" ON public.process_imports
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_process_imports ON public.process_imports;
CREATE TRIGGER set_updated_at_process_imports BEFORE UPDATE ON public.process_imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'process_imports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.process_imports;
  END IF;
END $$;

ALTER TABLE public.process_imports REPLICA IDENTITY FULL;

-- ============================================================
-- Storage: bucket privado 'process-imports' + RLS por dono (path = {company_id}/...)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('process-imports', 'process-imports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "process_imports_select" ON storage.objects;
CREATE POLICY "process_imports_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'process-imports'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "process_imports_insert" ON storage.objects;
CREATE POLICY "process_imports_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'process-imports'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.companies WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "process_imports_delete" ON storage.objects;
CREATE POLICY "process_imports_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'process-imports'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.companies WHERE owner_id = auth.uid()));
