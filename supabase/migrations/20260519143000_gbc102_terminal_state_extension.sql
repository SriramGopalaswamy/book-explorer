-- GBC-102: extend enforce_terminal_state() to cover 5 more tables.
--
-- The function existed but its CASE/array list omitted expenses,
-- reimbursement_requests, leave_requests, credit_notes, vendor_credits.
-- These remained the only status-bearing tables where a user with DevTools
-- could delete or modify an "approved"/"paid" row even though the UI hid
-- the buttons. This migration extends the function and attaches the
-- BEFORE UPDATE OR DELETE trigger to the 5 new tables.

CREATE OR REPLACE FUNCTION public.enforce_terminal_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal_states text[];
BEGIN
  terminal_states := CASE TG_TABLE_NAME
    WHEN 'invoices'              THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'bills'                 THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'purchase_orders'       THEN ARRAY['closed', 'cancelled']
    WHEN 'sales_orders'          THEN ARRAY['closed', 'cancelled']
    WHEN 'delivery_notes'        THEN ARRAY['returned']
    WHEN 'goods_receipts'        THEN ARRAY['accepted', 'rejected']
    WHEN 'work_orders'           THEN ARRAY['completed', 'cancelled']
    WHEN 'stock_transfers'       THEN ARRAY['completed', 'received', 'cancelled']
    WHEN 'purchase_returns'      THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'sales_returns'         THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'vendor_payments'       THEN ARRAY['completed', 'cancelled']
    WHEN 'payment_receipts'      THEN ARRAY['completed', 'cancelled']
    WHEN 'payroll_runs'          THEN ARRAY['paid', 'locked']
    WHEN 'stock_adjustments'     THEN ARRAY['completed', 'cancelled']
    -- GBC-102 additions (2026-05-19):
    WHEN 'expenses'              THEN ARRAY['paid', 'rejected', 'cancelled']
    WHEN 'reimbursement_requests' THEN ARRAY['paid', 'rejected', 'cancelled']
    WHEN 'leave_requests'        THEN ARRAY['approved', 'rejected', 'cancelled']
    WHEN 'credit_notes'          THEN ARRAY['applied', 'void', 'cancelled']
    WHEN 'vendor_credits'        THEN ARRAY['applied', 'void', 'cancelled']
    ELSE ARRAY['__none__']
  END;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = ANY(terminal_states) THEN
      -- Existing exception: signing-related fields on invoices can still mutate.
      IF TG_TABLE_NAME = 'invoices' AND NEW.status = OLD.status THEN
        IF (
          NEW.signing_status IS DISTINCT FROM OLD.signing_status OR
          NEW.original_pdf_path IS DISTINCT FROM OLD.original_pdf_path OR
          NEW.signed_pdf_path IS DISTINCT FROM OLD.signed_pdf_path OR
          NEW.signing_initiated_at IS DISTINCT FROM OLD.signing_initiated_at OR
          NEW.signing_completed_at IS DISTINCT FROM OLD.signing_completed_at OR
          NEW.signing_failure_reason IS DISTINCT FROM OLD.signing_failure_reason
        ) THEN
          IF NEW.amount = OLD.amount AND NEW.total_amount = OLD.total_amount
             AND NEW.tax_amount = OLD.tax_amount THEN
            RETURN NEW;
          END IF;
        END IF;
      END IF;

      RAISE EXCEPTION '% record (id: %) is in terminal state "%" and cannot be modified. Create a reversal or adjustment instead.',
        TG_TABLE_NAME, OLD.id, OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = ANY(terminal_states) THEN
      RAISE EXCEPTION '% record (id: %) is in terminal state "%" and cannot be deleted.',
        TG_TABLE_NAME, OLD.id, OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Attach trigger to the 5 newly-covered tables. (Existing tables already have
-- the trigger attached from migration 20260310120000; we don't disturb them.)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'expenses',
    'reimbursement_requests',
    'leave_requests',
    'credit_notes',
    'vendor_credits'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip if the named table doesn't actually exist in this database
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Skipping % (table not present)', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_terminal_state ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_enforce_terminal_state
        BEFORE UPDATE OR DELETE ON public.%I
        FOR EACH ROW
        EXECUTE FUNCTION public.enforce_terminal_state()',
      tbl
    );
  END LOOP;
END;
$$;
