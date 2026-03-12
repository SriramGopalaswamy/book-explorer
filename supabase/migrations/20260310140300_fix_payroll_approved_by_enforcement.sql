-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Payroll maker-checker enforcement — approved_by NOT NULL
--
-- The existing enforce_payroll_state_transition trigger auto-sets
-- approved_by = auth.uid() when status transitions to 'approved'.
-- However, it only runs on UPDATE (not INSERT), and only when auth.uid()
-- is available. Direct inserts with status='approved' bypass this.
--
-- This adds a BEFORE INSERT/UPDATE trigger that explicitly blocks:
--   - INSERT with status in ('approved','locked','completed','finalized')
--     and approved_by IS NULL
--   - UPDATE that sets status to 'approved'/'locked' without approved_by
--
-- TI-026 (integrity audit) detects this retroactively; this trigger
-- prevents it from happening in the first place.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_payroll_approval_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A payroll run cannot enter approved/locked/terminal state without an approver.
  -- The enforce_payroll_state_transition trigger sets approved_by = auth.uid()
  -- automatically on transition, so this only catches direct INSERT bypasses.
  IF NEW.status IN ('approved', 'locked', 'completed', 'finalized') THEN
    IF NEW.approved_by IS NULL THEN
      -- Try to set approved_by from current session if available
      IF auth.uid() IS NOT NULL THEN
        NEW.approved_by := auth.uid();
        NEW.approved_at := COALESCE(NEW.approved_at, now());
      ELSE
        RAISE EXCEPTION
          'payroll_runs: status "%" requires approved_by to be set (maker-checker policy). Set approved_by explicitly or use the approval workflow.',
          NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_approval_integrity ON public.payroll_runs;
CREATE TRIGGER trg_payroll_approval_integrity
  BEFORE INSERT OR UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payroll_approval_integrity();

-- Similarly, payroll_records locked to a locked run should be immutable
-- (already enforced by record_locking migration, but add explicit check)
CREATE OR REPLACE FUNCTION public.enforce_payroll_record_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payroll_runs
    WHERE id = OLD.payroll_run_id
      AND status = 'locked'
  ) THEN
    RAISE EXCEPTION
      'Cannot modify payroll_record (id: %) — parent payroll run is locked.',
      OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_record_lock ON public.payroll_records;
CREATE TRIGGER trg_payroll_record_lock
  BEFORE UPDATE OR DELETE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payroll_record_lock();
