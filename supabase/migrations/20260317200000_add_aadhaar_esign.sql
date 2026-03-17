-- Add Aadhaar eSign via DigiLocker support to invoices
-- Signing status tracks the signing workflow separately from payment status.

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

-- Private Storage bucket for invoice PDFs (original generated + signed uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-pdfs',
  'invoice-pdfs',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Only finance/admin can upload invoice PDFs
CREATE POLICY "Finance can upload invoice PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoice-pdfs'
    AND is_admin_or_finance(auth.uid())
  );

-- Finance/admin can read their org's PDFs
CREATE POLICY "Finance can read invoice PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoice-pdfs'
    AND is_admin_or_finance(auth.uid())
  );

-- Finance/admin can delete (e.g. to replace a wrong upload)
CREATE POLICY "Finance can delete invoice PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'invoice-pdfs'
    AND is_admin_or_finance(auth.uid())
  );
