CREATE TABLE IF NOT EXISTS public.job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  progress_label TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3
);

CREATE INDEX IF NOT EXISTS idx_job_queue_org_status ON public.job_queue(organization_id, status)
  WHERE status NOT IN ('completed','failed','cancelled');
CREATE INDEX IF NOT EXISTS idx_job_queue_created_by ON public.job_queue(created_by);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view job_queue" ON public.job_queue;
CREATE POLICY "org members can view job_queue" ON public.job_queue FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org members can insert job_queue" ON public.job_queue;
CREATE POLICY "org members can insert job_queue" ON public.job_queue FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "job owner can cancel" ON public.job_queue;
CREATE POLICY "job owner can cancel" ON public.job_queue FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='job_queue') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.job_queue';
  END IF;
END $$;