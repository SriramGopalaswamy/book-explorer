-- Item 41: Enforce LWP rule on attendance_daily.
--
-- Step 1: Expand the status CHECK to include 'lwp' (Leave Without Pay).
-- Step 2: Add a BEFORE INSERT/UPDATE trigger that raises an exception if
--   status='lwp' is set without a matching approved leave_request for
--   the same profile_id + attendance_date.

-- ─── 1. Expand status CHECK ───────────────────────────────────────────────────

ALTER TABLE public.attendance_daily
  DROP CONSTRAINT IF EXISTS attendance_daily_status_check;

ALTER TABLE public.attendance_daily
  ADD CONSTRAINT attendance_daily_status_check
  CHECK (status IN ('P', 'A', 'HD', 'MIS', 'NA', 'lwp'));

-- ─── 2. LWP enforcement trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_lwp_leave_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the new status is 'lwp'
  IF NEW.status IS DISTINCT FROM 'lwp' THEN
    RETURN NEW;
  END IF;

  -- Check for an approved leave_request covering this date
  IF NOT EXISTS (
    SELECT 1
    FROM public.leave_requests lr
    WHERE lr.profile_id   = NEW.profile_id
      AND lr.status       = 'approved'
      AND lr.from_date   <= NEW.attendance_date
      AND lr.to_date     >= NEW.attendance_date
  ) THEN
    RAISE EXCEPTION
      'attendance_daily: cannot set status=''lwp'' for profile % on % '
      'without an approved leave_request covering that date',
      NEW.profile_id, NEW.attendance_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_lwp_leave_request ON public.attendance_daily;
CREATE TRIGGER trg_enforce_lwp_leave_request
  BEFORE INSERT OR UPDATE OF status
  ON public.attendance_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_enforce_lwp_leave_request();
