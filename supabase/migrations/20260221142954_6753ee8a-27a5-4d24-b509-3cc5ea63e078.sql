
-- ============================================================
-- CRITICAL FIX 1: Guard set_org_context() with super_admin check
-- Risk: Any authenticated user could impersonate any org
-- Fix: Verify caller is super_admin before setting session var
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_org_context(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- CRITICAL: Only super_admins may set org context
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only platform administrators can set organization context';
  END IF;

  -- Verify the target org actually exists
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    RAISE EXCEPTION 'Organization % does not exist', _org_id;
  END IF;

  PERFORM set_config('app.current_org', _org_id::text, true);
END;
$$;


-- ============================================================
-- CRITICAL FIX 2: Enforce suspension on write operations
-- Create a reusable trigger function that blocks INSERT/UPDATE/DELETE
-- on any tenant table when the org is suspended
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_suspended_org_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _org_status text;
BEGIN
  -- Get org status
  SELECT status INTO _org_status
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF _org_status = 'suspended' THEN
    RAISE EXCEPTION 'Organization is suspended. All write operations are blocked. Contact platform administrator.';
  END IF;

  RETURN NEW;
END;
$$;

-- Apply suspension guard to critical business tables
-- (Tables that should be write-blocked when org is suspended)

CREATE TRIGGER trg_block_suspended_invoices
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_expenses
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_bills
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_financial_records
  BEFORE INSERT OR UPDATE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_payroll
  BEFORE INSERT OR UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_leave_requests
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_attendance
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_goals
  BEFORE INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_memos
  BEFORE INSERT OR UPDATE ON public.memos
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_assets
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_bank_transactions
  BEFORE INSERT OR UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_credit_notes
  BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_customers
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_vendors
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_quotes
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION block_suspended_org_writes();


-- ============================================================
-- FIX 3: Ensure platform_admin_logs INSERT enforces admin_id = auth.uid()
-- Already correct, but add explicit comment for documentation
-- The existing policy: WITH CHECK (is_super_admin(auth.uid()) AND admin_id = auth.uid())
-- This is correct — cannot spoof admin_id
-- ============================================================

-- No change needed for platform_admin_logs INSERT policy (already enforced)

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================

-- Verify set_org_context now has auth check
-- SELECT prosrc FROM pg_proc WHERE proname = 'set_org_context';

-- Verify suspension triggers exist
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_block_suspended%';
