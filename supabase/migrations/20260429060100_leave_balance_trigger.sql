-- Leave balance sync trigger (item P0).
--
-- Problem: leave_balances.used_days was being updated by application code in
-- useLeaves.ts with an employee-role RLS policy that EXCLUDES the manager role.
-- Manager approvals therefore silently failed to decrement balances.
--
-- Fix: Move balance updates into SECURITY DEFINER triggers on leave_requests so
-- they execute as the trigger owner (bypassing RLS) regardless of the caller's role.
--
-- Two triggers are needed because cancellation uses DELETE, not status update:
--   1. trg_leave_balance_on_status — AFTER UPDATE OF status: handles approval
--      (pending → approved: decrement) and un-approval (approved → rejected:
--      restore).
--   2. trg_leave_balance_on_delete — AFTER DELETE: restores balance when an
--      approved leave is hard-deleted (the cancel flow in useDeleteLeaveRequest).
--
-- leave_balances is looked up by (profile_id, leave_type, year) which has a
-- UNIQUE constraint, so the match is always at most one row.

CREATE OR REPLACE FUNCTION public.trg_fn_leave_balance_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   INTEGER;
  v_delta  INTEGER;
BEGIN
  -- Only act when status actually changed and involves 'approved'
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.from_date, OLD.from_date))::INTEGER;

  IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN
    -- Approval: increment used_days
    v_delta := NEW.days;
  ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    -- Un-approval (rejection / cancellation via status update): restore
    v_delta := -(OLD.days);
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.leave_balances
  SET
    used_days  = GREATEST(0, used_days + v_delta),
    updated_at = now()
  WHERE profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND leave_type = COALESCE(NEW.leave_type, OLD.leave_type)
    AND year       = v_year;

  IF NOT FOUND THEN
    RAISE WARNING 'leave_balances row not found for profile_id=%, leave_type=%, year=% — balance not updated on leave status change',
      COALESCE(NEW.profile_id, OLD.profile_id),
      COALESCE(NEW.leave_type, OLD.leave_type),
      v_year;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance_on_status ON public.leave_requests;
CREATE TRIGGER trg_leave_balance_on_status
  AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_leave_balance_on_status();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_leave_balance_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  -- Only restore balance when an APPROVED leave is deleted
  IF OLD.status <> 'approved' THEN
    RETURN OLD;
  END IF;

  v_year := EXTRACT(YEAR FROM OLD.from_date)::INTEGER;

  UPDATE public.leave_balances
  SET
    used_days  = GREATEST(0, used_days - OLD.days),
    updated_at = now()
  WHERE profile_id = OLD.profile_id
    AND leave_type = OLD.leave_type
    AND year       = v_year;

  IF NOT FOUND THEN
    RAISE WARNING 'leave_balances row not found for profile_id=%, leave_type=%, year=% — balance not restored on leave delete',
      OLD.profile_id,
      OLD.leave_type,
      v_year;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance_on_delete ON public.leave_requests;
CREATE TRIGGER trg_leave_balance_on_delete
  AFTER DELETE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_leave_balance_on_delete();
