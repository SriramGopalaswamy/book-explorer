
CREATE OR REPLACE FUNCTION public.enforce_terminal_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal_states text[];
BEGIN
  terminal_states := CASE TG_TABLE_NAME
    WHEN 'invoices'          THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'bills'             THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'purchase_orders'   THEN ARRAY['closed', 'cancelled']
    WHEN 'sales_orders'      THEN ARRAY['closed', 'cancelled']
    WHEN 'delivery_notes'    THEN ARRAY['returned']
    WHEN 'goods_receipts'    THEN ARRAY['accepted', 'rejected']
    WHEN 'work_orders'       THEN ARRAY['completed', 'cancelled']
    WHEN 'stock_transfers'   THEN ARRAY['completed', 'received', 'cancelled']
    WHEN 'purchase_returns'  THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'sales_returns'     THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'vendor_payments'   THEN ARRAY['completed', 'cancelled']
    WHEN 'payment_receipts'  THEN ARRAY['completed', 'cancelled']
    WHEN 'payroll_runs'      THEN ARRAY['paid', 'locked']
    WHEN 'stock_adjustments' THEN ARRAY['completed', 'cancelled']
    ELSE ARRAY['__none__']
  END;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = ANY(terminal_states) THEN
      -- For invoices: allow signing-related column updates even in terminal state
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
