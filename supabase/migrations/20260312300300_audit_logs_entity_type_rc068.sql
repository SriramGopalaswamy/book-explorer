-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: RC-068 — Missing audit entity types (4/4)
--
-- RC-068 checks for audit_logs rows with entity_type IN
-- ('invoice', 'bill', 'payroll', 'employee').
--
-- The Phase 1 audit schema uses `table_name` (e.g. 'invoices', 'bills').
-- Later migrations query `entity_type` — a normalized singular form.
-- This migration:
--   1. Adds entity_type column to audit_logs (if missing)
--   2. Backfills entity_type from table_name using a normalization map
--   3. Sets entity_type on future inserts via a trigger
-- ═══════════════════════════════════════════════════════════════════════

-- Step 1: Add entity_type column
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS entity_type TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type
  ON public.audit_logs(entity_type)
  WHERE entity_type IS NOT NULL;

-- Step 2: Backfill entity_type from table_name
UPDATE public.audit_logs
SET entity_type = CASE table_name
  WHEN 'invoices'           THEN 'invoice'
  WHEN 'bills'              THEN 'bill'
  WHEN 'payroll_runs'       THEN 'payroll'
  WHEN 'payroll_records'    THEN 'payroll'
  WHEN 'profiles'           THEN 'employee'
  WHEN 'vendor_payments'    THEN 'vendor_payment'
  WHEN 'payment_receipts'   THEN 'payment_receipt'
  WHEN 'journal_entries'    THEN 'journal_entry'
  WHEN 'expenses'           THEN 'expense'
  WHEN 'attendance_records' THEN 'attendance'
  WHEN 'leave_requests'     THEN 'leave'
  WHEN 'purchase_orders'    THEN 'purchase_order'
  WHEN 'sales_orders'       THEN 'sales_order'
  WHEN 'credit_notes'       THEN 'credit_note'
  WHEN 'bank_transactions'  THEN 'bank_transaction'
  ELSE table_name  -- preserve original value for unmapped tables
END
WHERE entity_type IS NULL;

-- Step 3: Function to auto-set entity_type on new audit log inserts
CREATE OR REPLACE FUNCTION public.auto_set_audit_entity_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entity_type IS NULL AND NEW.table_name IS NOT NULL THEN
    NEW.entity_type := CASE NEW.table_name
      WHEN 'invoices'           THEN 'invoice'
      WHEN 'bills'              THEN 'bill'
      WHEN 'payroll_runs'       THEN 'payroll'
      WHEN 'payroll_records'    THEN 'payroll'
      WHEN 'profiles'           THEN 'employee'
      WHEN 'vendor_payments'    THEN 'vendor_payment'
      WHEN 'payment_receipts'   THEN 'payment_receipt'
      WHEN 'journal_entries'    THEN 'journal_entry'
      WHEN 'expenses'           THEN 'expense'
      WHEN 'attendance_records' THEN 'attendance'
      WHEN 'leave_requests'     THEN 'leave'
      WHEN 'purchase_orders'    THEN 'purchase_order'
      WHEN 'sales_orders'       THEN 'sales_order'
      WHEN 'credit_notes'       THEN 'credit_note'
      WHEN 'bank_transactions'  THEN 'bank_transaction'
      ELSE NEW.table_name
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_audit_entity_type ON public.audit_logs;
CREATE TRIGGER trg_auto_set_audit_entity_type
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_audit_entity_type();
