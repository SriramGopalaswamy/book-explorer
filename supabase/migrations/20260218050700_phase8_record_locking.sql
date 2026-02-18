-- ===================================================================
-- PHASE 8: RECORD LOCKING
-- ===================================================================
-- Implements record locking after F&F completion
-- Ensures data integrity and compliance with audit requirements
-- ===================================================================

-- 1. Function to lock records after F&F completion
CREATE OR REPLACE FUNCTION public.lock_records_after_fnf(
  p_profile_id UUID,
  p_fnf_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_locked_count JSONB;
  v_salary_count INTEGER;
  v_payroll_count INTEGER;
  v_attendance_count INTEGER;
  v_asset_count INTEGER;
BEGIN
  -- Lock F&F record itself
  UPDATE public.final_settlements
  SET 
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = auth.uid()
  WHERE id = p_fnf_id
    AND is_locked = FALSE;

  -- Lock all salary structures
  UPDATE public.salary_structures
  SET 
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = auth.uid()
  WHERE profile_id = p_profile_id
    AND is_locked = FALSE;
  
  GET DIAGNOSTICS v_salary_count = ROW_COUNT;

  -- Lock all payroll records
  UPDATE public.payroll_records
  SET 
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = auth.uid()
  WHERE profile_id = p_profile_id
    AND is_locked = FALSE;
  
  GET DIAGNOSTICS v_payroll_count = ROW_COUNT;

  -- Lock all attendance records
  UPDATE public.attendance_records
  SET 
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = auth.uid()
  WHERE profile_id = p_profile_id
    AND is_locked = FALSE;
  
  GET DIAGNOSTICS v_attendance_count = ROW_COUNT;

  -- Lock all employee assets (mark as read-only)
  UPDATE public.employee_assets
  SET updated_at = NOW() -- Just to trigger audit if needed
  WHERE profile_id = p_profile_id
    AND status IN ('returned', 'lost', 'damaged');
  
  GET DIAGNOSTICS v_asset_count = ROW_COUNT;

  v_locked_count := jsonb_build_object(
    'fnf_locked', TRUE,
    'salary_structures_locked', v_salary_count,
    'payroll_records_locked', v_payroll_count,
    'attendance_records_locked', v_attendance_count,
    'assets_processed', v_asset_count,
    'locked_at', NOW(),
    'locked_by', auth.uid()
  );

  RETURN v_locked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger to auto-lock records when F&F is completed
CREATE OR REPLACE FUNCTION public.auto_lock_on_fnf_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_result JSONB;
BEGIN
  -- Only lock when status changes to 'paid' or 'approved'
  IF NEW.status IN ('paid', 'approved') AND OLD.status != NEW.status THEN
    v_lock_result := public.lock_records_after_fnf(NEW.profile_id, NEW.id);
    
    -- Log the locking
    INSERT INTO public.audit_log (
      table_name,
      record_id,
      action,
      performed_by,
      details
    ) VALUES (
      'final_settlements',
      NEW.id::TEXT,
      'LOCKED',
      auth.uid(),
      jsonb_build_object(
        'trigger', 'auto_lock_on_fnf_completion',
        'lock_result', v_lock_result
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_lock_records_on_fnf
AFTER UPDATE ON public.final_settlements
FOR EACH ROW
WHEN (NEW.status IN ('paid', 'approved'))
EXECUTE FUNCTION public.auto_lock_on_fnf_completion();

-- 3. Function to prevent updates to locked records (salary_structures)
CREATE OR REPLACE FUNCTION public.prevent_locked_salary_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = TRUE THEN
    RAISE EXCEPTION 'Cannot update locked salary structure. Record locked at % by %', 
      OLD.locked_at, OLD.locked_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_salary_structure_update
BEFORE UPDATE ON public.salary_structures
FOR EACH ROW
WHEN (OLD.is_locked = TRUE)
EXECUTE FUNCTION public.prevent_locked_salary_update();

-- 4. Function to prevent updates to locked payroll records
CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = TRUE THEN
    RAISE EXCEPTION 'Cannot update locked payroll record. Record locked at % by %', 
      OLD.locked_at, OLD.locked_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_payroll_record_update
BEFORE UPDATE ON public.payroll_records
FOR EACH ROW
WHEN (OLD.is_locked = TRUE)
EXECUTE FUNCTION public.prevent_locked_payroll_update();

-- 5. Function to prevent updates to locked attendance records
CREATE OR REPLACE FUNCTION public.prevent_locked_attendance_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = TRUE THEN
    RAISE EXCEPTION 'Cannot update locked attendance record. Record locked at % by %', 
      OLD.locked_at, OLD.locked_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_attendance_record_update
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW
WHEN (OLD.is_locked = TRUE)
EXECUTE FUNCTION public.prevent_locked_attendance_update();

-- 6. Function to prevent updates to locked F&F records
CREATE OR REPLACE FUNCTION public.prevent_locked_fnf_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_locked = TRUE THEN
    RAISE EXCEPTION 'Cannot update locked F&F settlement. Record locked at % by %', 
      OLD.locked_at, OLD.locked_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_fnf_settlement_update
BEFORE UPDATE ON public.final_settlements
FOR EACH ROW
WHEN (OLD.is_locked = TRUE AND OLD.id = NEW.id)
EXECUTE FUNCTION public.prevent_locked_fnf_update();

-- 7. Emergency unlock function (admin only)
CREATE OR REPLACE FUNCTION public.emergency_unlock_record(
  p_table_name TEXT,
  p_record_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Verify admin access
  v_is_admin := public.has_role(auth.uid(), 'admin');
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can unlock records';
  END IF;

  -- Unlock based on table
  CASE p_table_name
    WHEN 'salary_structures' THEN
      UPDATE public.salary_structures
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE id = p_record_id;
    
    WHEN 'payroll_records' THEN
      UPDATE public.payroll_records
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
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
      RAISE EXCEPTION 'Table % not supported for unlocking', p_table_name;
  END CASE;

  -- Log the unlock
  INSERT INTO public.audit_log (
    table_name,
    record_id,
    action,
    performed_by,
    details
  ) VALUES (
    p_table_name,
    p_record_id::TEXT,
    'EMERGENCY_UNLOCK',
    auth.uid(),
    jsonb_build_object(
      'reason', p_reason,
      'unlocked_at', NOW()
    )
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to get lock status for a profile
CREATE OR REPLACE FUNCTION public.get_lock_status(
  p_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'salary_structures', jsonb_build_object(
      'total', COUNT(*),
      'locked', COUNT(*) FILTER (WHERE is_locked = TRUE)
    ),
    'payroll_records', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'locked', COUNT(*) FILTER (WHERE is_locked = TRUE)
      )
      FROM public.payroll_records
      WHERE profile_id = p_profile_id
    ),
    'attendance_records', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'locked', COUNT(*) FILTER (WHERE is_locked = TRUE)
      )
      FROM public.attendance_records
      WHERE profile_id = p_profile_id
    ),
    'final_settlements', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'locked', COUNT(*) FILTER (WHERE is_locked = TRUE)
      )
      FROM public.final_settlements
      WHERE profile_id = p_profile_id
    )
  ) INTO v_result
  FROM public.salary_structures
  WHERE profile_id = p_profile_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.lock_records_after_fnf TO authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_unlock_record TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lock_status TO authenticated;

-- Add indexes for locked records
CREATE INDEX IF NOT EXISTS idx_salary_structures_locked_profile 
  ON public.salary_structures(profile_id) WHERE is_locked = TRUE;

CREATE INDEX IF NOT EXISTS idx_payroll_records_locked_profile 
  ON public.payroll_records(profile_id) WHERE is_locked = TRUE;

CREATE INDEX IF NOT EXISTS idx_attendance_records_locked_profile 
  ON public.attendance_records(profile_id) WHERE is_locked = TRUE;

CREATE INDEX IF NOT EXISTS idx_final_settlements_locked_profile 
  ON public.final_settlements(profile_id) WHERE is_locked = TRUE;

-- Add comments
COMMENT ON FUNCTION lock_records_after_fnf IS 'Locks all financial and HR records after F&F completion for compliance';
COMMENT ON FUNCTION emergency_unlock_record IS 'Emergency unlock function for admins only with full audit trail';
COMMENT ON FUNCTION get_lock_status IS 'Returns lock status summary for an employee profile';
COMMENT ON TRIGGER auto_lock_records_on_fnf ON public.final_settlements IS 'Automatically locks all related records when F&F is approved/paid';
