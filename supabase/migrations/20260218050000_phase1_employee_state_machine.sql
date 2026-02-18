-- ===================================================================
-- PHASE 1: EMPLOYEE LIFECYCLE STATE MACHINE
-- ===================================================================
-- Implements formal state machine for employee lifecycle with
-- transition guards and audit trail
-- ===================================================================

-- 1. Create employee state ENUM
CREATE TYPE public.employee_state AS ENUM (
  'draft',
  'offer_accepted',
  'scheduled',
  'active',
  'on_probation',
  'confirmed',
  'resigned',
  'notice_period',
  'exited',
  'fnf_pending',
  'fnf_completed',
  'archived',
  'anonymized'
);

-- 2. Add state tracking columns to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS current_state employee_state DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS previous_state employee_state,
  ADD COLUMN IF NOT EXISTS state_entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS date_of_exit DATE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 3. Create state transition history table
CREATE TABLE IF NOT EXISTS public.state_transition_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_state employee_state,
  to_state employee_state NOT NULL,
  transitioned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  transitioned_by UUID REFERENCES auth.users(id),
  reason TEXT,
  metadata JSONB,
  is_valid BOOLEAN DEFAULT TRUE,
  validation_errors TEXT[]
);

-- Enable RLS
ALTER TABLE public.state_transition_history ENABLE ROW LEVEL SECURITY;

-- Create index for performance
CREATE INDEX idx_state_transition_profile ON public.state_transition_history(profile_id, transitioned_at DESC);
CREATE INDEX idx_profiles_current_state ON public.profiles(current_state);
CREATE INDEX idx_profiles_manager ON public.profiles(manager_id) WHERE manager_id IS NOT NULL;

-- 4. Prevent hard deletion of profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Direct deletion of employee profiles is not allowed. Use soft delete by setting is_deleted=true';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_profile_hard_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_deletion();

-- 5. Create state transition validation function
CREATE OR REPLACE FUNCTION public.validate_state_transition(
  p_profile_id UUID,
  p_new_state employee_state
)
RETURNS TABLE (
  is_valid BOOLEAN,
  errors TEXT[]
) AS $$
DECLARE
  v_current_state employee_state;
  v_manager_id UUID;
  v_has_direct_reports BOOLEAN;
  v_errors TEXT[] := '{}';
BEGIN
  -- Get current state and manager
  SELECT current_state, manager_id INTO v_current_state, v_manager_id
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Validate transition rules based on current state
  CASE v_current_state
    WHEN 'draft' THEN
      IF p_new_state NOT IN ('offer_accepted', 'archived') THEN
        v_errors := array_append(v_errors, 'From draft, can only transition to offer_accepted or archived');
      END IF;
    
    WHEN 'offer_accepted' THEN
      IF p_new_state NOT IN ('scheduled', 'archived') THEN
        v_errors := array_append(v_errors, 'From offer_accepted, can only transition to scheduled or archived');
      END IF;
    
    WHEN 'scheduled' THEN
      IF p_new_state NOT IN ('active', 'on_probation', 'archived') THEN
        v_errors := array_append(v_errors, 'From scheduled, can only transition to active, on_probation, or archived');
      END IF;
    
    WHEN 'on_probation' THEN
      IF p_new_state NOT IN ('confirmed', 'exited') THEN
        v_errors := array_append(v_errors, 'From on_probation, can only transition to confirmed or exited');
      END IF;
    
    WHEN 'active', 'confirmed' THEN
      IF p_new_state NOT IN ('resigned', 'exited', 'on_probation') THEN
        v_errors := array_append(v_errors, 'From active/confirmed, can only transition to resigned, exited, or on_probation');
      END IF;
    
    WHEN 'resigned' THEN
      IF p_new_state NOT IN ('notice_period', 'active') THEN
        v_errors := array_append(v_errors, 'From resigned, can only transition to notice_period or back to active (resignation withdrawal)');
      END IF;
    
    WHEN 'notice_period' THEN
      IF p_new_state NOT IN ('exited') THEN
        v_errors := array_append(v_errors, 'From notice_period, can only transition to exited');
      END IF;
    
    WHEN 'exited' THEN
      IF p_new_state NOT IN ('fnf_pending', 'active') THEN
        v_errors := array_append(v_errors, 'From exited, can only transition to fnf_pending or back to active (rehire)');
      END IF;
    
    WHEN 'fnf_pending' THEN
      IF p_new_state NOT IN ('fnf_completed') THEN
        v_errors := array_append(v_errors, 'From fnf_pending, can only transition to fnf_completed');
      END IF;
    
    WHEN 'fnf_completed' THEN
      IF p_new_state NOT IN ('archived') THEN
        v_errors := array_append(v_errors, 'From fnf_completed, can only transition to archived');
      END IF;
    
    WHEN 'archived' THEN
      IF p_new_state NOT IN ('anonymized') THEN
        v_errors := array_append(v_errors, 'From archived, can only transition to anonymized');
      END IF;
    
    WHEN 'anonymized' THEN
      v_errors := array_append(v_errors, 'Cannot transition from anonymized state');
    
    ELSE
      v_errors := array_append(v_errors, 'Unknown current state');
  END CASE;

  -- Check if employee is a manager with unassigned direct reports (for exit transitions)
  IF p_new_state IN ('exited', 'notice_period', 'resigned') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE manager_id = p_profile_id 
        AND is_deleted = FALSE
        AND current_state NOT IN ('exited', 'fnf_completed', 'archived', 'anonymized')
    ) INTO v_has_direct_reports;
    
    IF v_has_direct_reports THEN
      v_errors := array_append(v_errors, 'Cannot exit: employee has active direct reports. Please reassign them first');
    END IF;
  END IF;

  -- Return validation result
  RETURN QUERY SELECT 
    array_length(v_errors, 1) IS NULL OR array_length(v_errors, 1) = 0,
    v_errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create state transition function
CREATE OR REPLACE FUNCTION public.transition_employee_state(
  p_profile_id UUID,
  p_new_state employee_state,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  new_state employee_state,
  errors TEXT[]
) AS $$
DECLARE
  v_current_state employee_state;
  v_is_valid BOOLEAN;
  v_errors TEXT[];
  v_transitioned_by UUID;
BEGIN
  -- Get current user
  v_transitioned_by := auth.uid();
  
  -- Get current state
  SELECT current_state INTO v_current_state
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Check if profile exists
  IF v_current_state IS NULL THEN
    RETURN QUERY SELECT 
      FALSE,
      'Employee profile not found',
      NULL::employee_state,
      ARRAY['Profile does not exist']::TEXT[];
    RETURN;
  END IF;

  -- Validate transition
  SELECT is_valid, validate_state_transition.errors 
  INTO v_is_valid, v_errors
  FROM public.validate_state_transition(p_profile_id, p_new_state);

  -- If validation fails, return errors
  IF NOT v_is_valid THEN
    -- Log failed transition attempt
    INSERT INTO public.state_transition_history (
      profile_id, from_state, to_state, transitioned_by, 
      reason, metadata, is_valid, validation_errors
    ) VALUES (
      p_profile_id, v_current_state, p_new_state, v_transitioned_by,
      p_reason, p_metadata, FALSE, v_errors
    );
    
    RETURN QUERY SELECT 
      FALSE,
      'State transition validation failed',
      v_current_state,
      v_errors;
    RETURN;
  END IF;

  -- Perform the transition
  UPDATE public.profiles
  SET 
    previous_state = current_state,
    current_state = p_new_state,
    state_entered_at = NOW(),
    updated_at = NOW(),
    -- Set dates based on transition
    date_of_joining = CASE 
      WHEN p_new_state IN ('active', 'on_probation') AND date_of_joining IS NULL 
      THEN CURRENT_DATE 
      ELSE date_of_joining 
    END,
    date_of_exit = CASE 
      WHEN p_new_state = 'exited' AND date_of_exit IS NULL 
      THEN CURRENT_DATE 
      ELSE date_of_exit 
    END
  WHERE id = p_profile_id;

  -- Log successful transition
  INSERT INTO public.state_transition_history (
    profile_id, from_state, to_state, transitioned_by,
    reason, metadata, is_valid, validation_errors
  ) VALUES (
    p_profile_id, v_current_state, p_new_state, v_transitioned_by,
    p_reason, p_metadata, TRUE, NULL
  );

  RETURN QUERY SELECT 
    TRUE,
    format('Successfully transitioned from %s to %s', v_current_state, p_new_state),
    p_new_state,
    NULL::TEXT[];
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.validate_state_transition TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_employee_state TO authenticated;

-- RLS Policies for state_transition_history
CREATE POLICY "Users can view their own state history"
  ON public.state_transition_history FOR SELECT
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins and HR can view all state history"
  ON public.state_transition_history FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can insert state history"
  ON public.state_transition_history FOR INSERT
  WITH CHECK (public.is_admin_or_hr(auth.uid()));

-- Add comments
COMMENT ON TYPE employee_state IS 'Employee lifecycle states for the HR system state machine';
COMMENT ON TABLE state_transition_history IS 'Audit trail for all employee state transitions with validation results';
COMMENT ON FUNCTION validate_state_transition IS 'Validates whether a state transition is allowed based on business rules';
COMMENT ON FUNCTION transition_employee_state IS 'Performs validated state transition with full audit trail';
COMMENT ON TRIGGER prevent_profile_hard_delete ON public.profiles IS 'Prevents hard deletion of employee records, enforcing soft delete only';
