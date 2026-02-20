
-- ============================================================
-- STAGE 3: LEDGER ARCHITECTURE (TRUE GENERAL LEDGER)
-- Purpose: Transform financial_records into authoritative ledger
--          with double-entry, posting triggers, and references
-- ============================================================

-- Step 1: Add ledger columns to financial_records
ALTER TABLE public.financial_records 
  ADD COLUMN IF NOT EXISTS debit NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS posting_date DATE,
  ADD COLUMN IF NOT EXISTS is_posted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID,
  ADD COLUMN IF NOT EXISTS memo TEXT;

-- Backfill posting_date from record_date
UPDATE public.financial_records 
SET posting_date = record_date 
WHERE posting_date IS NULL;

-- Backfill debit/credit from amount + type
UPDATE public.financial_records 
SET debit = CASE WHEN type = 'expense' THEN amount ELSE 0 END,
    credit = CASE WHEN type = 'revenue' THEN amount ELSE 0 END,
    is_posted = true,
    posted_at = created_at
WHERE debit = 0 AND credit = 0 AND amount > 0;

-- Step 2: Create indexes for ledger queries
CREATE INDEX IF NOT EXISTS idx_financial_records_posting_date ON public.financial_records(posting_date);
CREATE INDEX IF NOT EXISTS idx_financial_records_reference ON public.financial_records(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_account_code ON public.financial_records(account_code);
CREATE INDEX IF NOT EXISTS idx_financial_records_journal ON public.financial_records(journal_entry_id);

-- Step 3: Posting trigger for INVOICES → financial_records
CREATE OR REPLACE FUNCTION public.post_invoice_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total NUMERIC;
BEGIN
  -- Only post when status changes to 'sent' or 'paid'
  IF NEW.status IN ('sent', 'paid') AND (OLD IS NULL OR OLD.status NOT IN ('sent', 'paid')) THEN
    _total := COALESCE(NEW.total_amount, NEW.amount, 0);
    
    -- Revenue entry (credit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount, 
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'revenue', 'Invoices',
      _total, 0, _total, NEW.id, 'invoice',
      COALESCE(NEW.created_at::date, CURRENT_DATE), CURRENT_DATE,
      'Invoice ' || NEW.invoice_number || ' - ' || NEW.client_name,
      true, now()
    );

    -- Accounts Receivable entry (debit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Accounts Receivable',
      _total, _total, 0, NEW.id, 'invoice',
      COALESCE(NEW.created_at::date, CURRENT_DATE), CURRENT_DATE,
      'AR: Invoice ' || NEW.invoice_number || ' - ' || NEW.client_name,
      true, now()
    );
  END IF;

  -- When invoice is paid, reverse AR and record cash
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    _total := COALESCE(NEW.total_amount, NEW.amount, 0);
    
    -- Cash entry (debit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Cash',
      _total, _total, 0, NEW.id, 'payment_received',
      CURRENT_DATE, CURRENT_DATE,
      'Payment received: Invoice ' || NEW.invoice_number,
      true, now()
    );

    -- Reverse AR (credit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Accounts Receivable',
      _total, 0, _total, NEW.id, 'payment_received',
      CURRENT_DATE, CURRENT_DATE,
      'AR cleared: Invoice ' || NEW.invoice_number,
      true, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_invoice_to_ledger
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.post_invoice_to_ledger();

-- Step 4: Posting trigger for BILLS → financial_records
CREATE OR REPLACE FUNCTION public.post_bill_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total NUMERIC;
BEGIN
  IF NEW.status IN ('approved', 'paid') AND (OLD IS NULL OR OLD.status NOT IN ('approved', 'paid')) THEN
    _total := COALESCE(NEW.total_amount, NEW.amount, 0);
    
    -- Expense entry (debit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'expense', 'Bills',
      _total, _total, 0, NEW.id, 'bill',
      COALESCE(NEW.bill_date, CURRENT_DATE), CURRENT_DATE,
      'Bill ' || NEW.bill_number || ' - ' || NEW.vendor_name,
      true, now()
    );

    -- Accounts Payable entry (credit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'liability', 'Accounts Payable',
      _total, 0, _total, NEW.id, 'bill',
      COALESCE(NEW.bill_date, CURRENT_DATE), CURRENT_DATE,
      'AP: Bill ' || NEW.bill_number || ' - ' || NEW.vendor_name,
      true, now()
    );
  END IF;

  -- Bill payment
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    _total := COALESCE(NEW.total_amount, NEW.amount, 0);
    
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Cash',
      _total, 0, _total, NEW.id, 'bill_payment',
      CURRENT_DATE, CURRENT_DATE,
      'Payment: Bill ' || NEW.bill_number,
      true, now()
    );

    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'liability', 'Accounts Payable',
      _total, _total, 0, NEW.id, 'bill_payment',
      CURRENT_DATE, CURRENT_DATE,
      'AP cleared: Bill ' || NEW.bill_number,
      true, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_bill_to_ledger
  AFTER INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.post_bill_to_ledger();

-- Step 5: Posting trigger for EXPENSES → financial_records
CREATE OR REPLACE FUNCTION public.post_expense_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    -- Expense debit
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'expense', NEW.category,
      NEW.amount, NEW.amount, 0, NEW.id, 'expense',
      COALESCE(NEW.expense_date, CURRENT_DATE), CURRENT_DATE,
      'Expense: ' || COALESCE(NEW.description, NEW.category),
      true, now()
    );

    -- Cash credit
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Cash',
      NEW.amount, 0, NEW.amount, NEW.id, 'expense',
      COALESCE(NEW.expense_date, CURRENT_DATE), CURRENT_DATE,
      'Cash out: ' || COALESCE(NEW.description, NEW.category),
      true, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_post_expense_to_ledger
  AFTER INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.post_expense_to_ledger();

-- Step 6: Ledger balance validation function
CREATE OR REPLACE FUNCTION public.check_ledger_balance()
RETURNS TABLE(total_debits NUMERIC, total_credits NUMERIC, is_balanced BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    SUM(debit) AS total_debits,
    SUM(credit) AS total_credits,
    SUM(debit) = SUM(credit) AS is_balanced
  FROM public.financial_records
  WHERE is_posted = true;
$$;

-- Step 7: Immutability trigger - prevent editing posted entries
CREATE OR REPLACE FUNCTION public.prevent_posted_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_posted = true THEN
    RAISE EXCEPTION 'Cannot modify a posted ledger entry. Use a reversal instead.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_immutable_ledger
  BEFORE UPDATE ON public.financial_records
  FOR EACH ROW 
  WHEN (OLD.is_posted = true)
  EXECUTE FUNCTION public.prevent_posted_edit();

-- Step 8: Prevent deletion of posted entries
CREATE OR REPLACE FUNCTION public.prevent_posted_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_posted = true THEN
    RAISE EXCEPTION 'Cannot delete a posted ledger entry. Use a reversal instead.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_no_delete_posted
  BEFORE DELETE ON public.financial_records
  FOR EACH ROW
  WHEN (OLD.is_posted = true)
  EXECUTE FUNCTION public.prevent_posted_delete();
