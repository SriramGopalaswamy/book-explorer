-- Add Aadhaar eSign via DigiLocker signing state columns to invoices.
--
-- Apply this migration via the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/qfgudhbrjfjmbamwsfuj/sql/new
--
-- The signing workflow already works with the existing invoice-assets bucket.
-- Applying this migration enables persistent signing status badges and
-- mid-flow resume when the modal is re-opened.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS signing_status TEXT
    CHECK (signing_status IN (
      'not_initiated',
      'pending_download',
      'pending_upload',
      'verifying',
      'verified',
      'failed'
    ))
    DEFAULT 'not_initiated',
  ADD COLUMN IF NOT EXISTS original_pdf_path      TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_path        TEXT,
  ADD COLUMN IF NOT EXISTS signing_initiated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signing_completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signing_failure_reason TEXT;
