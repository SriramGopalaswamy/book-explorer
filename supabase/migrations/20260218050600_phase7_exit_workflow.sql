-- ===================================================================
-- PHASE 7: EXIT WORKFLOW
-- ===================================================================
-- Complete employee exit workflow with automation
-- Handles resignation, notice period, exit finalization, and F&F
-- ===================================================================

-- 1. Create exit workflow table
CREATE TABLE IF NOT EXISTS public.exit_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  resignation_date DATE,
  last_working_day DATE,
  notice_period_days INTEGER DEFAULT 30,
  actual_notice_days INTEGER,
  exit_reason TEXT,
  exit_type TEXT CHECK (exit_type IN ('resignation', 'termination', 'retirement', 'absconding', 'end_of_contract')),
  
  -- Workflow stages
  current_stage TEXT DEFAULT 'not_started' CHECK (current_stage IN (
    'not_started',
    'exit_initiated',
    'notice_period',
    'exit_finalized',
    'fnf_calculated',
    'fnf_approved',
    'fnf_completed',
    'archived'
  )),
  
  -- Timestamps
  initiated_at TIMESTAMP WITH TIME ZONE,
  notice_period_started_at TIMESTAMP WITH TIME ZONE,
  exit_finalized_at TIMESTAMP WITH TIME ZONE,
  fnf_calculated_at TIMESTAMP WITH TIME ZONE,
  fnf_approved_at TIMESTAMP WITH TIME ZONE,
  fnf_completed_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  
  -- Checklist
  assets_returned BOOLEAN DEFAULT FALSE,
  handover_completed BOOLEAN DEFAULT FALSE,
  clearance_obtained BOOLEAN DEFAULT FALSE,
  login_revoked BOOLEAN DEFAULT FALSE,
  tasks_reassigned BOOLEAN DEFAULT FALSE,
  
  -- References
  fnf_settlement_id UUID REFERENCES public.final_settlements(id),
  approved_by UUID REFERENCES auth.users(id),
  
  -- Metadata
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_exit_workflow_profile ON public.exit_workflow(profile_id);
CREATE INDEX idx_exit_workflow_stage ON public.exit_workflow(current_stage);

-- Enable RLS
ALTER TABLE public.exit_workflow ENABLE ROW LEVEL SECURITY;

-- 2. Function to initiate exit
CREATE OR REPLACE FUNCTION public.initiate_employee_exit(
  p_profile_id UUID,
  p_resignation_date DATE DEFAULT CURRENT_DATE,
  p_last_working_day DATE DEFAULT NULL,
  p_exit_reason TEXT DEFAULT NULL,
  p_exit_type TEXT DEFAULT 'resignation',
  p_notice_period_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  v_exit_workflow_id UUID;
  v_has_direct_reports BOOLEAN;
  v_calculated_lwd DATE;
  v_actual_notice_days INTEGER;
BEGIN
  -- Check if employee has direct reports
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE manager_id = p_profile_id
      AND is_deleted = FALSE
      AND current_state NOT IN ('exited', 'fnf_completed', 'archived', 'anonymized')
  ) INTO v_has_direct_reports;

  IF v_has_direct_reports THEN
    RAISE EXCEPTION 'Cannot initiate exit: Employee has active direct reports. Please reassign them first.';
  END IF;

  -- Calculate last working day if not provided
  v_calculated_lwd := COALESCE(
    p_last_working_day,
    p_resignation_date + (p_notice_period_days || ' days')::INTERVAL
  )::DATE;

  v_actual_notice_days := v_calculated_lwd - p_resignation_date;

  -- Create exit workflow
  INSERT INTO public.exit_workflow (
    profile_id,
    resignation_date,
    last_working_day,
    notice_period_days,
    actual_notice_days,
    exit_reason,
    exit_type,
    current_stage,
    initiated_at
  ) VALUES (
    p_profile_id,
    p_resignation_date,
    v_calculated_lwd,
    p_notice_period_days,
    v_actual_notice_days,
    p_exit_reason,
    p_exit_type,
    'exit_initiated',
    NOW()
  )
  ON CONFLICT (profile_id)
  DO UPDATE SET
    resignation_date = EXCLUDED.resignation_date,
    last_working_day = EXCLUDED.last_working_day,
    notice_period_days = EXCLUDED.notice_period_days,
    actual_notice_days = EXCLUDED.actual_notice_days,
    exit_reason = EXCLUDED.exit_reason,
    exit_type = EXCLUDED.exit_type,
    initiated_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_exit_workflow_id;

  -- Transition employee to 'resigned' state
  PERFORM public.transition_employee_state(
    p_profile_id,
    'resigned'::employee_state,
    format('Exit initiated: %s', p_exit_reason)
  );

  -- Publish event
  PERFORM public.publish_hr_event(
    'ExitInitiated',
    'exit_workflow',
    v_exit_workflow_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'resignation_date', p_resignation_date,
      'last_working_day', v_calculated_lwd,
      'exit_type', p_exit_type,
      'notice_period_days', p_notice_period_days
    ),
    format('exit_initiated_%s', p_profile_id),
    gen_random_uuid()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'exit_workflow_id', v_exit_workflow_id,
    'resignation_date', p_resignation_date,
    'last_working_day', v_calculated_lwd,
    'notice_period_days', p_notice_period_days,
    'actual_notice_days', v_actual_notice_days
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to start notice period
CREATE OR REPLACE FUNCTION public.start_notice_period(
  p_profile_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update workflow
  UPDATE public.exit_workflow
  SET 
    current_stage = 'notice_period',
    notice_period_started_at = NOW(),
    updated_at = NOW()
  WHERE profile_id = p_profile_id
    AND current_stage = 'exit_initiated';

  -- Transition state
  PERFORM public.transition_employee_state(
    p_profile_id,
    'notice_period'::employee_state,
    'Notice period started'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to finalize exit
CREATE OR REPLACE FUNCTION public.finalize_employee_exit(
  p_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_exit_workflow RECORD;
  v_fnf_id UUID;
BEGIN
  -- Get exit workflow
  SELECT * INTO v_exit_workflow
  FROM public.exit_workflow
  WHERE profile_id = p_profile_id;

  IF v_exit_workflow IS NULL THEN
    RAISE EXCEPTION 'No exit workflow found for employee';
  END IF;

  -- Verify checklist
  IF NOT v_exit_workflow.assets_returned THEN
    RAISE EXCEPTION 'Cannot finalize exit: Assets not returned';
  END IF;

  IF NOT v_exit_workflow.handover_completed THEN
    RAISE EXCEPTION 'Cannot finalize exit: Handover not completed';
  END IF;

  -- Update workflow
  UPDATE public.exit_workflow
  SET 
    current_stage = 'exit_finalized',
    exit_finalized_at = NOW(),
    updated_at = NOW()
  WHERE profile_id = p_profile_id;

  -- Transition to exited state
  PERFORM public.transition_employee_state(
    p_profile_id,
    'exited'::employee_state,
    'Exit finalized'
  );

  -- Revoke login
  PERFORM public.revoke_employee_login(p_profile_id);

  -- Auto-calculate F&F
  v_fnf_id := public.calculate_fnf(
    p_profile_id,
    v_exit_workflow.last_working_day,
    v_exit_workflow.last_working_day,
    v_exit_workflow.resignation_date,
    v_exit_workflow.notice_period_days
  );

  -- Update workflow with F&F reference
  UPDATE public.exit_workflow
  SET 
    fnf_settlement_id = v_fnf_id,
    fnf_calculated_at = NOW(),
    current_stage = 'fnf_calculated'
  WHERE profile_id = p_profile_id;

  -- Publish event
  PERFORM public.publish_hr_event(
    'ExitFinalized',
    'exit_workflow',
    v_exit_workflow.id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'last_working_day', v_exit_workflow.last_working_day,
      'fnf_id', v_fnf_id
    ),
    format('exit_finalized_%s', p_profile_id),
    gen_random_uuid()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'exit_finalized_at', NOW(),
    'fnf_settlement_id', v_fnf_id,
    'login_revoked', TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to revoke employee login
CREATE OR REPLACE FUNCTION public.revoke_employee_login(
  p_profile_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user_id
  SELECT user_id INTO v_user_id
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Mark in exit workflow
  UPDATE public.exit_workflow
  SET login_revoked = TRUE
  WHERE profile_id = p_profile_id;

  -- Publish event
  PERFORM public.publish_hr_event(
    'LoginRevoked',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'user_id', v_user_id,
      'revoked_at', NOW()
    ),
    format('login_revoked_%s', p_profile_id),
    gen_random_uuid()
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to reassign tasks
CREATE OR REPLACE FUNCTION public.reassign_direct_reports(
  p_profile_id UUID,
  p_new_manager_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Reassign all direct reports
  UPDATE public.profiles
  SET 
    manager_id = p_new_manager_id,
    updated_at = NOW()
  WHERE manager_id = p_profile_id
    AND is_deleted = FALSE
    AND current_state NOT IN ('exited', 'fnf_completed', 'archived', 'anonymized');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Mark tasks reassigned
  UPDATE public.exit_workflow
  SET tasks_reassigned = TRUE
  WHERE profile_id = p_profile_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.initiate_employee_exit TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_notice_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_employee_exit TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_employee_login TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_direct_reports TO authenticated;

-- RLS policies
CREATE POLICY "Users can view own exit workflow"
  ON public.exit_workflow FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and HR can view all exit workflows"
  ON public.exit_workflow FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage exit workflows"
  ON public.exit_workflow FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_exit_workflow_updated_at
BEFORE UPDATE ON public.exit_workflow
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE exit_workflow IS 'Complete exit workflow tracking with automation and checklist';
COMMENT ON FUNCTION initiate_employee_exit IS 'Initiates employee exit with validation and event publishing';
COMMENT ON FUNCTION finalize_employee_exit IS 'Finalizes exit, revokes login, and auto-calculates F&F';
COMMENT ON FUNCTION revoke_employee_login IS 'Revokes employee login access';
