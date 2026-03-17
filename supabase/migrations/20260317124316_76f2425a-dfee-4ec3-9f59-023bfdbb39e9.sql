
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS signing_status TEXT DEFAULT 'not_initiated',
  ADD COLUMN IF NOT EXISTS original_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS signing_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signing_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signing_failure_reason TEXT;

-- Use a validation trigger instead of a CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_signing_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.signing_status IS NOT NULL AND NEW.signing_status NOT IN (
    'not_initiated', 'pending_download', 'pending_upload', 'verifying', 'verified', 'failed'
  ) THEN
    RAISE EXCEPTION 'Invalid signing_status: %', NEW.signing_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_signing_status ON public.invoices;
CREATE TRIGGER trg_validate_signing_status
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_signing_status();
