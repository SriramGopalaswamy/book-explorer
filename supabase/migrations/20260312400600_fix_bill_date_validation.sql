-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Bill Date Validation
--
-- Constraint: due_date must be >= bill_date (or NULL when not yet set)
--
-- This prevents data entry errors where a bill's payment due date is
-- set earlier than the bill issue date, which would incorrectly mark
-- bills as immediately overdue upon creation.
-- ═══════════════════════════════════════════════════════════════════════

-- ── bills table ───────────────────────────────────────────────────────
-- Fix any existing rows where due_date < bill_date before adding constraint
UPDATE public.bills
SET    due_date = bill_date + INTERVAL '30 days'
WHERE  due_date IS NOT NULL
  AND  due_date < bill_date;

-- Add the CHECK constraint (idempotent)
ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_due_date_check;

ALTER TABLE public.bills
  ADD CONSTRAINT bills_due_date_check
  CHECK (due_date IS NULL OR due_date >= bill_date);

-- ── invoices table — same temporal logic ─────────────────────────────
-- Fix any existing rows
UPDATE public.invoices
SET    due_date = invoice_date + INTERVAL '30 days'
WHERE  due_date IS NOT NULL
  AND  due_date < invoice_date;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_due_date_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_due_date_check
  CHECK (due_date IS NULL OR due_date >= invoice_date);

-- ── Verification hint ─────────────────────────────────────────────────
-- The following should fail:
--   INSERT INTO public.bills (..., bill_date = '2026-03-10', due_date = '2026-03-01', ...)
-- Expected: ERROR: new row for relation "bills" violates check constraint "bills_due_date_check"
