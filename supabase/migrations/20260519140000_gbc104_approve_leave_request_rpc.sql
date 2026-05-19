-- GBC-104: approve_leave_request RPC with balance recheck + row lock
--
-- Bug: two concurrent approvals of leave requests against the same
-- (profile_id, leave_type, year) bucket could both pass the creation-time
-- balance check, then both approve, pushing used_days past total_days. The
-- existing trg_leave_balance_on_status trigger only RAISES WARNING (not
-- exception) when the balance row is missing, and applies GREATEST(0, ...)
-- in the cancellation path — neither guards against capacity overflow at
-- approval.
--
-- Fix: wrap the approval in a SECURITY DEFINER RPC that:
--   1. SELECT … FOR UPDATE on the leave_requests row (blocks duplicate approves).
--   2. SELECT … FOR UPDATE on the leave_balances row (serialises capacity check
--      with the trigger that fires when status flips).
--   3. Validates (total_days - used_days) >= days. RAISES if insufficient.
--   4. UPDATEs the request status — the existing trigger fires inside the
--      same transaction, under both locks, and decrements used_days atomically.
--
-- After this lands, two parallel approvals of overlapping requests cannot both
-- succeed: the second one blocks on the FOR UPDATE, then fails the recheck.

CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id uuid)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_req      public.leave_requests%ROWTYPE;
  v_bal      public.leave_balances%ROWTYPE;
  v_year     INTEGER;
  v_org      UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller org for tenant scoping
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = v_actor;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organization for caller' USING ERRCODE = '42501';
  END IF;

  -- (1) Lock the request row. The FOR UPDATE serialises duplicate approve
  -- attempts: only the first wins; the rest see the new status and fail.
  SELECT * INTO v_req
  FROM public.leave_requests
  WHERE id = p_request_id AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This leave request has already been reviewed (status=%)', v_req.status
      USING ERRCODE = '22023';
  END IF;
  IF v_req.user_id = v_actor THEN
    RAISE EXCEPTION 'You cannot approve your own leave request.'
      USING ERRCODE = '42501';
  END IF;

  v_year := EXTRACT(YEAR FROM v_req.from_date)::INTEGER;

  -- (2) Lock the balance row. This must happen BEFORE the status update so
  -- the trigger fires under our held lock; otherwise the trigger could
  -- grab a stale row from a concurrent transaction.
  SELECT * INTO v_bal
  FROM public.leave_balances
  WHERE profile_id = v_req.profile_id
    AND leave_type = v_req.leave_type
    AND year       = v_year
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No leave balance row for profile_id=%, leave_type=%, year=% — HR must seed a balance before approving.',
      v_req.profile_id, v_req.leave_type, v_year
      USING ERRCODE = 'P0002';
  END IF;

  -- (3) Capacity recheck. v_req.days is set at request creation.
  IF (v_bal.total_days - v_bal.used_days) < v_req.days THEN
    RAISE EXCEPTION 'Insufficient leave balance: % days requested, % available (allocated %, used %)',
      v_req.days,
      (v_bal.total_days - v_bal.used_days),
      v_bal.total_days,
      v_bal.used_days
      USING ERRCODE = '22023';
  END IF;

  -- (4) Status flip. trg_fn_leave_balance_on_status fires here under both
  -- locks and decrements used_days. Returns the updated row.
  UPDATE public.leave_requests
  SET status      = 'approved',
      reviewed_by = v_actor,
      reviewed_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  RETURN v_req;
END;
$$;

COMMENT ON FUNCTION public.approve_leave_request(uuid) IS
  'GBC-104: Approve a leave request with balance recheck under FOR UPDATE locks. Prevents the concurrent-double-approve race that lets used_days exceed total_days.';

-- RLS note: the function is SECURITY DEFINER and resolves org from the
-- caller's profile, so it bypasses leave_requests RLS while still enforcing
-- tenant boundaries via the explicit organization_id filter on the lock.
