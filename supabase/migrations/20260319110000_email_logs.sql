-- ============================================================
-- email_logs: audit trail for all inbound and outbound emails
-- related to invoices and workflow actions.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  subject TEXT,
  from_email TEXT,
  to_email TEXT,
  body_text TEXT,
  thread_id TEXT,
  -- AI classification (inbound emails only)
  classification TEXT CHECK (classification IN ('acknowledged', 'dispute', 'other')),
  raw_payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_invoice
  ON public.email_logs(invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_org_created
  ON public.email_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_thread
  ON public.email_logs(thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_direction
  ON public.email_logs(organization_id, direction, created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Reuse the is_finance_or_admin() helper created in the workflow migration
CREATE POLICY "finance_admin_email_logs_all"
  ON public.email_logs FOR ALL
  USING (public.is_finance_or_admin(organization_id));

-- ============================================================
-- Expand invoices.status CHECK constraint to include AI-driven
-- statuses: 'acknowledged' (AI confirmed) and 'dispute' (AI flagged)
-- ============================================================

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'acknowledged', 'dispute'));
