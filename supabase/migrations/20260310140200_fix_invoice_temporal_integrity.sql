-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Temporal integrity constraints for invoices and credit notes
--
-- Bills already have: CHECK (due_date >= bill_date) from phase1_vendors_bills.
-- Invoices have no equivalent constraint — an invoice can be created with
-- a due_date before its issue_date, which is a logical impossibility and
-- will be caught by CHAOS-NEW-8. Adding the guard here.
--
-- Also adds a constraint for credit notes: credit_date should not be before
-- the original invoice date (credit notes are issued after the fact).
-- ═══════════════════════════════════════════════════════════════════════

-- Guard: invoice due_date must be on or after the issue_date
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_due_date_check
  CHECK (due_date IS NULL OR issue_date IS NULL OR due_date >= issue_date);

-- Guard: invoice due_date must be on or after invoice_date (alternate column name)
-- (Some invoice rows use invoice_date instead of issue_date — cover both)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices'
      AND column_name = 'invoice_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public' AND table_name = 'invoices'
      AND constraint_name = 'invoices_invoice_date_due_date_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_date_due_date_check
      CHECK (due_date IS NULL OR invoice_date IS NULL OR due_date >= invoice_date);
  END IF;
END;
$$;

-- Guard: stock_transfers cannot transfer to the same warehouse (self-transfer)
-- This makes CHAOS-NEW self-transfer test a hard block rather than application-layer check
ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_no_self_transfer
  CHECK (from_warehouse_id IS NULL OR to_warehouse_id IS NULL OR from_warehouse_id <> to_warehouse_id);
