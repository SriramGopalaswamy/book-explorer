
-- ============================================================
-- P1-3: COMPOSITE INDEXES FOR HIGH-TRAFFIC TABLES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_financial_records_org_type_date 
  ON public.financial_records (organization_id, type, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_org_status 
  ON public.invoices (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_org_due_date 
  ON public.invoices (organization_id, due_date);

CREATE INDEX IF NOT EXISTS idx_bills_org_status 
  ON public.bills (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_records_org_date 
  ON public.attendance_records (organization_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_org_date 
  ON public.attendance_daily (organization_id, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_org_status 
  ON public.leave_requests (organization_id, status);

-- Use pay_period instead of pay_month/pay_year
CREATE INDEX IF NOT EXISTS idx_payroll_records_org_period 
  ON public.payroll_records (organization_id, pay_period);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date 
  ON public.journal_entries (organization_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created 
  ON public.audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_txn_org_date 
  ON public.bank_transactions (organization_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_org_status 
  ON public.profiles (organization_id, status);

-- ============================================================
-- P2-1: SOFT DELETE PATTERN
-- ============================================================

ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.bills 
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.journal_entries 
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.financial_records 
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_active ON public.invoices (organization_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bills_active ON public.bills (organization_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_expenses_active ON public.expenses (organization_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_journal_entries_active ON public.journal_entries (organization_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_financial_records_active ON public.financial_records (organization_id) WHERE is_deleted = false;

-- ============================================================
-- P2-2: AUDIT LOGGING TRIGGER FOR HR/PAYROLL MUTATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_hr_payroll_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
  _entity_id text;
  _org_id uuid;
  _actor_id uuid;
  _metadata jsonb;
BEGIN
  _actor_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _entity_id := NEW.id::text;
    _org_id := NEW.organization_id;
    _metadata := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _entity_id := NEW.id::text;
    _org_id := NEW.organization_id;
    _metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW),
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _entity_id := OLD.id::text;
    _org_id := OLD.organization_id;
    _metadata := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_logs (
    action, actor_id, entity_type, entity_id, organization_id, metadata
  ) VALUES (
    _action, _actor_id, TG_TABLE_NAME, _entity_id, _org_id, _metadata
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_payroll_records ON public.payroll_records;
CREATE TRIGGER trg_audit_payroll_records
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_hr_payroll_changes();

DROP TRIGGER IF EXISTS trg_audit_leave_requests ON public.leave_requests;
CREATE TRIGGER trg_audit_leave_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_hr_payroll_changes();

DROP TRIGGER IF EXISTS trg_audit_payroll_runs ON public.payroll_runs;
CREATE TRIGGER trg_audit_payroll_runs
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_hr_payroll_changes();

DROP TRIGGER IF EXISTS trg_audit_attendance_records ON public.attendance_records;
CREATE TRIGGER trg_audit_attendance_records
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_hr_payroll_changes();

-- ============================================================
-- P2-3: INVOICE TOTAL VS LINE ITEMS VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_validate_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _line_total numeric;
  _invoice_amount numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO _line_total
  FROM public.invoice_items
  WHERE invoice_id = NEW.invoice_id;

  SELECT COALESCE(subtotal, amount) INTO _invoice_amount
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  IF _invoice_amount > 0 AND ABS(_line_total - _invoice_amount) > 0.01 THEN
    RAISE WARNING 'Invoice % line items total (%) differs from invoice amount (%) by more than 0.01',
      NEW.invoice_id, _line_total, _invoice_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_line_totals ON public.invoice_items;
CREATE TRIGGER trg_validate_invoice_line_totals
  AFTER INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_invoice_totals();

-- ============================================================
-- P3-3: COST CENTER CIRCULAR REFERENCE PREVENTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_prevent_circular_cost_center()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_parent uuid;
  _depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Cost center cannot be its own parent';
  END IF;

  _current_parent := NEW.parent_id;
  WHILE _current_parent IS NOT NULL AND _depth < 10 LOOP
    IF _current_parent = NEW.id THEN
      RAISE EXCEPTION 'Circular reference detected in cost center hierarchy';
    END IF;
    SELECT parent_id INTO _current_parent
    FROM public.cost_centers
    WHERE id = _current_parent;
    _depth := _depth + 1;
  END LOOP;

  IF _depth >= 10 THEN
    RAISE EXCEPTION 'Cost center hierarchy exceeds maximum depth of 10';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cost_centers') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_prevent_circular_cost_center ON public.cost_centers';
    EXECUTE 'CREATE TRIGGER trg_prevent_circular_cost_center
      BEFORE INSERT OR UPDATE ON public.cost_centers
      FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_circular_cost_center()';
  END IF;
END;
$$;
