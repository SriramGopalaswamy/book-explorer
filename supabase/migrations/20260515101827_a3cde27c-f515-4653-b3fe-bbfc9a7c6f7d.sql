-- GBC-118 / GBC-119: prevent double-approval race conditions at DB layer.
-- Any update that changes status MUST start from 'pending'. If a concurrent
-- transaction already approved/rejected the row, this trigger raises and the
-- second action fails atomically.

CREATE OR REPLACE FUNCTION public.enforce_pending_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION
      'Cannot transition % from % to %: request was already actioned',
      TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_requests_pending_guard ON public.leave_requests;
CREATE TRIGGER trg_leave_requests_pending_guard
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pending_status_transition();

DROP TRIGGER IF EXISTS trg_attendance_correction_pending_guard ON public.attendance_correction_requests;
CREATE TRIGGER trg_attendance_correction_pending_guard
  BEFORE UPDATE ON public.attendance_correction_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pending_status_transition();