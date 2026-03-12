-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Compliance — Expense Receipt Required on Approval
--
-- Rule: IF expense.status = 'approved' THEN receipt_url IS NOT NULL
--
-- Applied to:
--   • expenses table          (user-submitted expense claims)
--   • reimbursement_requests  (manager-approved reimbursements)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. expenses table ─────────────────────────────────────────────────

-- Backfill existing approved expenses without receipt to a placeholder
-- so the constraint does not fail on historical data.
UPDATE public.expenses
SET    receipt_url = 'legacy_receipt_required'
WHERE  status = 'approved'
  AND  receipt_url IS NULL;

-- Add the CHECK constraint (idempotent)
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_receipt_required;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_receipt_required
  CHECK (
    status != 'approved'
    OR receipt_url IS NOT NULL
  );

-- ── 2. reimbursement_requests table ──────────────────────────────────
-- Check if receipt_url column exists before adding the constraint
DO $$
BEGIN
  -- Add receipt_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'reimbursement_requests'
      AND  column_name  = 'receipt_url'
  ) THEN
    ALTER TABLE public.reimbursement_requests
      ADD COLUMN receipt_url TEXT;
  END IF;
END;
$$;

-- Backfill
UPDATE public.reimbursement_requests
SET    receipt_url = 'legacy_receipt_required'
WHERE  status = 'approved'
  AND  (receipt_url IS NULL OR receipt_url = '');

-- Add the CHECK constraint
ALTER TABLE public.reimbursement_requests
  DROP CONSTRAINT IF EXISTS reimb_receipt_required;

ALTER TABLE public.reimbursement_requests
  ADD CONSTRAINT reimb_receipt_required
  CHECK (
    status != 'approved'
    OR receipt_url IS NOT NULL
  );

-- ── 3. Trigger: enforce receipt on status transition ──────────────────
-- Provides a more descriptive error than the CHECK constraint alone.
CREATE OR REPLACE FUNCTION public.enforce_expense_receipt_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (NEW.receipt_url IS NULL OR NEW.receipt_url = '') THEN
    RAISE EXCEPTION
      'Expense/reimbursement % cannot be approved without a receipt (receipt_url must be set).',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_receipt_required ON public.expenses;
CREATE TRIGGER trg_expense_receipt_required
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_expense_receipt_on_approval();

DROP TRIGGER IF EXISTS trg_reimb_receipt_required ON public.reimbursement_requests;
CREATE TRIGGER trg_reimb_receipt_required
  BEFORE INSERT OR UPDATE ON public.reimbursement_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_expense_receipt_on_approval();

-- ── Verification hint ─────────────────────────────────────────────────
-- The following should fail:
--   UPDATE public.expenses SET status = 'approved', receipt_url = NULL ...
-- Expected: ERROR: Expense/reimbursement ... cannot be approved without a receipt
