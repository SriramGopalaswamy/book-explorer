
-- ═══════════════════════════════════════════════════════════════
-- TERMINAL STATE ENFORCEMENT TRIGGERS
-- Prevents modification/deletion of records in terminal states
-- ═══════════════════════════════════════════════════════════════

-- Generic terminal state enforcement function
CREATE OR REPLACE FUNCTION public.enforce_terminal_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  terminal_states text[];
BEGIN
  -- Define terminal states per table
  terminal_states := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'bills' THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'purchase_orders' THEN ARRAY['closed', 'cancelled']
    WHEN 'sales_orders' THEN ARRAY['closed', 'cancelled']
    WHEN 'delivery_notes' THEN ARRAY['delivered', 'cancelled']
    WHEN 'goods_receipts' THEN ARRAY['completed', 'cancelled']
    WHEN 'work_orders' THEN ARRAY['completed', 'cancelled']
    WHEN 'stock_transfers' THEN ARRAY['completed', 'received', 'cancelled']
    WHEN 'purchase_returns' THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'sales_returns' THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'vendor_payments' THEN ARRAY['completed', 'cancelled']
    WHEN 'payment_receipts' THEN ARRAY['completed', 'cancelled']
    WHEN 'payroll_runs' THEN ARRAY['approved', 'paid', 'locked']
    WHEN 'stock_adjustments' THEN ARRAY['completed', 'cancelled']
    ELSE ARRAY['__none__']
  END;

  -- For UPDATE: block if OLD status is terminal
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = ANY(terminal_states) THEN
      RAISE EXCEPTION '% record (id: %) is in terminal state "%" and cannot be modified. Create a reversal or adjustment instead.',
        TG_TABLE_NAME, OLD.id, OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  -- For DELETE: block if status is terminal
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

-- Apply terminal state triggers to all relevant tables
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'invoices', 'bills', 'purchase_orders', 'sales_orders',
    'delivery_notes', 'goods_receipts', 'work_orders',
    'stock_transfers', 'purchase_returns', 'sales_returns',
    'vendor_payments', 'payment_receipts', 'payroll_runs',
    'stock_adjustments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop existing trigger if any
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_terminal_state ON public.%I', tbl);
    -- Create trigger for UPDATE and DELETE
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

-- ═══════════════════════════════════════════════════════════════
-- SELF-TRANSFER BLOCK (CHECK constraint)
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_no_self_transfer'
  ) THEN
    ALTER TABLE public.stock_transfers
      ADD CONSTRAINT chk_no_self_transfer
      CHECK (from_warehouse_id IS DISTINCT FROM to_warehouse_id);
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- NEGATIVE AMOUNT VALIDATION TRIGGERS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_positive_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount < 0 THEN
    RAISE EXCEPTION '% does not allow negative amounts (got: %)',
      TG_TABLE_NAME, NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply to expenses and reimbursement_requests
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['expenses', 'reimbursement_requests'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_positive_amount ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_validate_positive_amount
       BEFORE INSERT OR UPDATE ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.validate_positive_amount()',
      tbl
    );
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PAYROLL VALIDATION: paid_days <= working_days, positive salary
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_payroll_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.basic_salary < 0 THEN
    RAISE EXCEPTION 'payroll_records: basic_salary cannot be negative (got: %)', NEW.basic_salary;
  END IF;
  IF NEW.paid_days > NEW.working_days THEN
    RAISE EXCEPTION 'payroll_records: paid_days (%) cannot exceed working_days (%)', NEW.paid_days, NEW.working_days;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payroll_record ON public.payroll_records;
CREATE TRIGGER trg_validate_payroll_record
  BEFORE INSERT OR UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payroll_record();

-- ═══════════════════════════════════════════════════════════════
-- LEAVE VALIDATION: days > 0, to_date >= from_date
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_leave_request()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.days IS NOT NULL AND NEW.days <= 0 THEN
    RAISE EXCEPTION 'leave_requests: days must be positive (got: %)', NEW.days;
  END IF;
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'leave_requests: to_date (%) cannot be before from_date (%)', NEW.to_date, NEW.from_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_leave_request ON public.leave_requests;
CREATE TRIGGER trg_validate_leave_request
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_leave_request();
