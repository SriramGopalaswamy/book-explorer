-- GBC-103: Reject future-dated financial entries via BEFORE INSERT/UPDATE triggers.
-- Per project policy (CLAUDE.md): CHECK constraints comparing to CURRENT_DATE are
-- non-IMMUTABLE and must be implemented as triggers instead.

CREATE OR REPLACE FUNCTION public.trg_reject_future_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_date DATE;
BEGIN
  EXECUTE format('SELECT ($1).%I', v_col) INTO v_date USING NEW;
  IF v_date IS NOT NULL AND v_date > CURRENT_DATE THEN
    RAISE EXCEPTION '%.% cannot be in the future (got %)', TG_TABLE_NAME, v_col, v_date
      USING ERRCODE = '22008';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_reject_future_date() IS
  'GBC-103: Generic trigger function rejecting future-dated rows. Pass the date column name as TG_ARGV[0].';

-- Drop existing triggers if rerunning
DROP TRIGGER IF EXISTS trg_payment_receipts_no_future_date ON public.payment_receipts;
DROP TRIGGER IF EXISTS trg_vendor_payments_no_future_date  ON public.vendor_payments;
DROP TRIGGER IF EXISTS trg_expenses_no_future_date         ON public.expenses;
DROP TRIGGER IF EXISTS trg_journal_entries_no_future_date  ON public.journal_entries;

CREATE TRIGGER trg_payment_receipts_no_future_date
  BEFORE INSERT OR UPDATE OF payment_date ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.trg_reject_future_date('payment_date');

CREATE TRIGGER trg_vendor_payments_no_future_date
  BEFORE INSERT OR UPDATE OF payment_date ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_reject_future_date('payment_date');

CREATE TRIGGER trg_expenses_no_future_date
  BEFORE INSERT OR UPDATE OF expense_date ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trg_reject_future_date('expense_date');

CREATE TRIGGER trg_journal_entries_no_future_date
  BEFORE INSERT OR UPDATE OF entry_date ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_reject_future_date('entry_date');