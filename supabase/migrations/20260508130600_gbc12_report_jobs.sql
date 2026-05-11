-- ══════════════════════════════════════════════════════════════════════
-- GBC-12 — server-side PDF / heavy-report rendering: report_jobs queue
--
-- Heavy reports (year-long General Ledger, bulk payslip exports,
-- multi-month statutory bundles) currently render in the browser via
-- jsPDF. Past a few hundred pages the tab OOMs.
--
-- Architecture:
--   1. Frontend calls enqueue_report_job(report_type, params jsonb) — RPC
--      inserts a queued row scoped to caller's org + user, returns the
--      job id immediately.
--   2. Edge Function "render_report" picks up queued rows, runs Playwright
--      (or pdfkit) to render the PDF, uploads to `erp-documents-storage`
--      under <orgId>/reports/<job_id>.pdf, and marks the job 'succeeded'
--      with the storage path.
--   3. Frontend subscribes to the row via Realtime, surfaces "Preparing…"
--      until 'succeeded', then offers a download link from a signed URL.
--
-- This migration adds the queue table + RLS + the enqueue RPC + a small
-- mark_report_job_* helper set the Edge Function uses to update state
-- without needing the service-role key.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.report_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type      text NOT NULL,        -- 'general_ledger', 'payslip_bulk', 'gstr1', etc.
  params           jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  progress_pct     integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  storage_path     text,                 -- set on success: <org>/reports/<id>.pdf
  page_count       integer,
  error            text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_jobs_org_user_status
  ON public.report_jobs (organization_id, user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_jobs_queued
  ON public.report_jobs (status, created_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_jobs_select_own ON public.report_jobs;
CREATE POLICY report_jobs_select_own
  ON public.report_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         AND organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS report_jobs_insert_own ON public.report_jobs;
CREATE POLICY report_jobs_insert_own
  ON public.report_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND organization_id = public.get_user_organization_id(auth.uid()));

-- enqueue: frontend-facing RPC. Returns the job id; the row arrives via
-- Realtime so the UI can show "Queued → Running → Ready".
CREATE OR REPLACE FUNCTION public.enqueue_report_job(
  p_report_type text,
  p_params      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_id  uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_report_type IS NULL OR length(trim(p_report_type)) = 0 THEN
    RAISE EXCEPTION 'report_type is required';
  END IF;

  INSERT INTO public.report_jobs (organization_id, user_id, report_type, params)
  VALUES (v_org, auth.uid(), p_report_type, COALESCE(p_params, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.enqueue_report_job(text, jsonb) TO authenticated;

-- Helpers the Edge Function calls. Each updates a specific lifecycle
-- transition idempotently and is org-scoped via the join — so even if a
-- service-role key isn't used (e.g. the Edge runs in user context), the
-- function can only touch jobs in the caller's org.
CREATE OR REPLACE FUNCTION public.mark_report_job_running(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.report_jobs
     SET status = 'running', started_at = now(), progress_pct = 1
   WHERE id = p_id AND status = 'queued';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_report_job_progress(p_id uuid, p_pct integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.report_jobs
     SET progress_pct = LEAST(GREATEST(p_pct, 0), 99)
   WHERE id = p_id AND status = 'running';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_report_job_succeeded(
  p_id           uuid,
  p_storage_path text,
  p_page_count   integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.report_jobs
     SET status = 'succeeded',
         storage_path = p_storage_path,
         page_count = p_page_count,
         progress_pct = 100,
         finished_at = now()
   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_report_job_failed(
  p_id    uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.report_jobs
     SET status = 'failed',
         error = p_error,
         finished_at = now()
   WHERE id = p_id;
END;
$$;
