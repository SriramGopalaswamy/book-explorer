-- Create recurring_transactions table
CREATE TABLE public.recurring_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES public.organizations(id),
  name              TEXT NOT NULL,
  description       TEXT,
  frequency         TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  debit_account_id  UUID,
  credit_account_id UUID,
  amount            NUMERIC NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'INR',
  start_date        DATE NOT NULL,
  end_date          DATE,
  next_run_date     DATE,
  last_run_date     DATE,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_recurring_transactions_org_id ON public.recurring_transactions(organization_id);
CREATE INDEX idx_recurring_transactions_created_at ON public.recurring_transactions(created_at DESC);
CREATE INDEX idx_recurring_transactions_status ON public.recurring_transactions(status);

-- Enable Row Level Security
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "Users can view their org recurring transactions"
ON public.recurring_transactions FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = created_by)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = recurring_transactions.organization_id
    AND om.user_id = auth.uid()
  ))
);

-- INSERT policy
CREATE POLICY "Users can create recurring transactions in their org"
ON public.recurring_transactions FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = created_by)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = recurring_transactions.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

-- UPDATE policy
CREATE POLICY "Users can update recurring transactions in their org"
ON public.recurring_transactions FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = created_by)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = recurring_transactions.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

-- DELETE policy
CREATE POLICY "Users can delete recurring transactions in their org"
ON public.recurring_transactions FOR DELETE
USING (
  (organization_id IS NULL AND auth.uid() = created_by)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = recurring_transactions.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ))
);

-- Auto-update updated_at on row changes
CREATE TRIGGER set_recurring_transactions_updated_at
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
