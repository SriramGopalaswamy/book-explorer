-- =============================================================================
-- ENFORCE PAYROLL LOCK AT DB LEVEL
-- =============================================================================
-- Phase 8 (20260218050700) added a BEFORE UPDATE trigger on payroll_records
-- but left three gaps:
--   1. No DELETE protection on locked payroll_records.
--   2. No protection on locked payroll_runs (UPDATE or DELETE).
--   3. emergency_unlock_record() is broken: updating is_locked=FALSE on a
--      locked record fires the same exception the trigger raises, making
--      emergency unlock impossible without superuser intervention.
--
-- This migration fixes all three gaps and adds RESTRICTIVE RLS policies
-- as a defense-in-depth layer (RLS is checked before triggers for the
-- authenticated role; SECURITY DEFINER functions bypass RLS so the
-- emergency unlock path still works).
-- =============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- 1.  Fix the existing UPDATE trigger on payroll_records
--     Allow unlocking (is_locked TRUE → FALSE) while still blocking all other
--     mutations on locked records.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow the emergency-unlock path (only change allowed on a locked record
  -- is explicitly setting is_locked = FALSE, which clears the lock).
  IF OLD.is_locked = TRUE AND NEW.is_locked IS NOT DISTINCT FROM FALSE THEN
    RETURN NEW;
  END IF;
  -- Block everything else
  RAISE EXCEPTION
    'Cannot update locked payroll record (id=%). Locked at % by %.',
    OLD.id, OLD.locked_at, OLD.locked_by;
END;
$$ LANGUAGE plpgsql;

-- The trigger definition already exists; just refresh the function above.
-- Guard in case the trigger was somehow missing:
DROP TRIGGER IF EXISTS prevent_payroll_record_update ON public.payroll_records;
CREATE TRIGGER prevent_payroll_record_update
BEFORE UPDATE ON public.payroll_records
FOR EACH ROW
WHEN (OLD.is_locked = TRUE)
EXECUTE FUNCTION public.prevent_locked_payroll_update();


-- ──────────────────────────────────────────────────────────────────────────────
-- 2.  Add DELETE protection for locked payroll_records
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Cannot delete locked payroll record (id=%). Locked at % by %.',
    OLD.id, OLD.locked_at, OLD.locked_by;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_payroll_record_delete ON public.payroll_records;
CREATE TRIGGER prevent_payroll_record_delete
BEFORE DELETE ON public.payroll_records
FOR EACH ROW
WHEN (OLD.is_locked = TRUE)
EXECUTE FUNCTION public.prevent_locked_payroll_delete();


-- ──────────────────────────────────────────────────────────────────────────────
-- 3.  Protect locked payroll_runs (UPDATE and DELETE)
--     A run is considered locked when locked_at IS NOT NULL.
--     The only allowed update on a locked run is the emergency unlock path
--     (setting locked_at = NULL / locked_by = NULL).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_run_write()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow emergency-unlock: locked_at going from non-NULL to NULL
    IF OLD.locked_at IS NOT NULL AND NEW.locked_at IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Cannot modify locked payroll run (id=%, period=%). Locked at % by %.',
      OLD.id, OLD.pay_period, OLD.locked_at, OLD.locked_by;
  END IF;

  -- DELETE
  RAISE EXCEPTION
    'Cannot delete locked payroll run (id=%, period=%). Locked at % by %.',
    OLD.id, OLD.pay_period, OLD.locked_at, OLD.locked_by;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_payroll_run_update ON public.payroll_runs;
CREATE TRIGGER prevent_payroll_run_update
BEFORE UPDATE ON public.payroll_runs
FOR EACH ROW
WHEN (OLD.locked_at IS NOT NULL)
EXECUTE FUNCTION public.prevent_locked_payroll_run_write();

DROP TRIGGER IF EXISTS prevent_payroll_run_delete ON public.payroll_runs;
CREATE TRIGGER prevent_payroll_run_delete
BEFORE DELETE ON public.payroll_runs
FOR EACH ROW
WHEN (OLD.locked_at IS NOT NULL)
EXECUTE FUNCTION public.prevent_locked_payroll_run_write();


-- ──────────────────────────────────────────────────────────────────────────────
-- 4.  RESTRICTIVE RLS policies — defense-in-depth layer
--     These are checked BEFORE triggers for the authenticated role and ensure
--     that even a misbehaving application can't write to locked records.
--     SECURITY DEFINER functions (emergency_unlock_record) bypass RLS and still
--     reach the triggers, which allow the unlock path.
-- ──────────────────────────────────────────────────────────────────────────────

-- payroll_records
DROP POLICY IF EXISTS "block_locked_payroll_record_update" ON public.payroll_records;
CREATE POLICY "block_locked_payroll_record_update"
ON public.payroll_records
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (is_locked IS NOT TRUE);

DROP POLICY IF EXISTS "block_locked_payroll_record_delete" ON public.payroll_records;
CREATE POLICY "block_locked_payroll_record_delete"
ON public.payroll_records
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (is_locked IS NOT TRUE);

-- payroll_runs
DROP POLICY IF EXISTS "block_locked_payroll_run_update" ON public.payroll_runs;
CREATE POLICY "block_locked_payroll_run_update"
ON public.payroll_runs
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (locked_at IS NULL);

DROP POLICY IF EXISTS "block_locked_payroll_run_delete" ON public.payroll_runs;
CREATE POLICY "block_locked_payroll_run_delete"
ON public.payroll_runs
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (locked_at IS NULL);


-- ──────────────────────────────────────────────────────────────────────────────
-- 5.  Extend emergency_unlock_record() to support payroll_runs
--     The original function in phase 8 omitted payroll_runs from the CASE.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emergency_unlock_record(
  p_table_name TEXT,
  p_record_id  UUID,
  p_reason     TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can unlock records';
  END IF;

  CASE p_table_name
    WHEN 'salary_structures' THEN
      UPDATE public.salary_structures
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE id = p_record_id;

    WHEN 'payroll_records' THEN
      UPDATE public.payroll_records
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE id = p_record_id;

    WHEN 'payroll_runs' THEN
      UPDATE public.payroll_runs
      SET locked_at = NULL, locked_by = NULL
      WHERE id = p_record_id;

    WHEN 'attendance_records' THEN
      UPDATE public.attendance_records
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE id = p_record_id;

    WHEN 'final_settlements' THEN
      UPDATE public.final_settlements
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE id = p_record_id;

    ELSE
      RAISE EXCEPTION 'Table % not supported for emergency unlock', p_table_name;
  END CASE;

  INSERT INTO public.audit_log (
    table_name, record_id, action, performed_by, details
  ) VALUES (
    p_table_name,
    p_record_id::TEXT,
    'EMERGENCY_UNLOCK',
    auth.uid(),
    jsonb_build_object(
      'reason',       p_reason,
      'unlocked_at',  NOW()
    )
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.emergency_unlock_record TO authenticated;

COMMENT ON FUNCTION public.emergency_unlock_record IS
  'Admin-only emergency unlock. Audited. Bypasses RLS so the unlock can reach locked rows; trigger allows the unlock path when locked_at → NULL or is_locked → FALSE.';
