-- ===================================================================
-- PHASE 4: FINAL & FULL SETTLEMENT (F&F) ENGINE
-- ===================================================================
-- Formula-driven F&F calculation service for India compliance
-- Includes salary proration, leave encashment, gratuity, recoveries
-- ===================================================================

-- 1. Function to calculate working days in a month
CREATE OR REPLACE FUNCTION public.calculate_working_days(
  p_start_date DATE,
  p_end_date DATE,
  p_working_week_policy TEXT DEFAULT '5_days'
)
RETURNS NUMERIC AS $$
DECLARE
  v_total_days NUMERIC;
  v_working_days_per_week NUMERIC;
BEGIN
  v_working_days_per_week := CASE 
    WHEN p_working_week_policy = '6_days' THEN 6
    ELSE 5
  END;
  
  -- Simple calculation: (total days / 7) * working days per week
  v_total_days := p_end_date - p_start_date + 1;
  RETURN (v_total_days / 7.0) * v_working_days_per_week;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Function to calculate salary proration
CREATE OR REPLACE FUNCTION public.calculate_salary_proration(
  p_profile_id UUID,
  p_exit_date DATE,
  p_last_working_day DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_salary_structure RECORD;
  v_working_week_policy TEXT;
  v_last_day DATE;
  v_month_start DATE;
  v_month_end DATE;
  v_working_days NUMERIC;
  v_total_working_days NUMERIC;
  v_prorated_amount NUMERIC;
  v_result JSONB;
BEGIN
  -- Get working week policy
  SELECT working_week_policy INTO v_working_week_policy
  FROM public.profiles
  WHERE id = p_profile_id;
  
  v_working_week_policy := COALESCE(v_working_week_policy, '5_days');
  
  -- Get current salary structure
  SELECT * INTO v_salary_structure
  FROM public.salary_structures
  WHERE profile_id = p_profile_id
    AND is_current = TRUE
    AND status = 'active'
  LIMIT 1;

  IF v_salary_structure IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No active salary structure found',
      'prorated_amount', 0
    );
  END IF;

  -- Determine last working day
  v_last_day := COALESCE(p_last_working_day, p_exit_date);
  
  -- Calculate for the exit month
  v_month_start := date_trunc('month', v_last_day)::DATE;
  v_month_end := (date_trunc('month', v_last_day) + interval '1 month' - interval '1 day')::DATE;
  
  -- Calculate working days
  v_total_working_days := public.calculate_working_days(v_month_start, v_month_end, v_working_week_policy);
  v_working_days := public.calculate_working_days(v_month_start, v_last_day, v_working_week_policy);
  
  -- Prorate salary
  v_prorated_amount := ROUND((v_salary_structure.monthly_gross / v_total_working_days) * v_working_days, 2);
  
  v_result := jsonb_build_object(
    'monthly_gross', v_salary_structure.monthly_gross,
    'month', to_char(v_last_day, 'YYYY-MM'),
    'total_working_days', v_total_working_days,
    'worked_days', v_working_days,
    'prorated_amount', v_prorated_amount,
    'working_week_policy', v_working_week_policy
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to calculate leave encashment
CREATE OR REPLACE FUNCTION public.calculate_leave_encashment(
  p_profile_id UUID,
  p_exit_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_leave_balance RECORD;
  v_monthly_gross NUMERIC;
  v_per_day_salary NUMERIC;
  v_total_encashment NUMERIC := 0;
  v_details JSONB := '[]'::JSONB;
  v_working_week_policy TEXT;
  v_working_days_per_month NUMERIC;
BEGIN
  -- Get salary and working week policy
  SELECT ss.monthly_gross, p.working_week_policy
  INTO v_monthly_gross, v_working_week_policy
  FROM public.salary_structures ss
  JOIN public.profiles p ON p.id = ss.profile_id
  WHERE ss.profile_id = p_profile_id
    AND ss.is_current = TRUE
    AND ss.status = 'active'
  LIMIT 1;

  IF v_monthly_gross IS NULL THEN
    RETURN jsonb_build_object('error', 'No active salary structure found');
  END IF;

  -- Calculate per day salary
  v_working_days_per_month := CASE 
    WHEN v_working_week_policy = '6_days' THEN 26
    ELSE 22
  END;
  
  v_per_day_salary := ROUND(v_monthly_gross / v_working_days_per_month, 2);

  -- Calculate encashment for each leave type
  FOR v_leave_balance IN
    SELECT 
      leave_type,
      total_days,
      used_days,
      (total_days - used_days) AS balance
    FROM public.leave_balances
    WHERE profile_id = p_profile_id
      AND year = EXTRACT(YEAR FROM p_exit_date)
      AND leave_type IN ('casual', 'earned') -- Only these are encashable
  LOOP
    IF v_leave_balance.balance > 0 THEN
      v_total_encashment := v_total_encashment + (v_leave_balance.balance * v_per_day_salary);
      v_details := v_details || jsonb_build_object(
        'leave_type', v_leave_balance.leave_type,
        'balance_days', v_leave_balance.balance,
        'per_day_salary', v_per_day_salary,
        'encashment_amount', ROUND(v_leave_balance.balance * v_per_day_salary, 2)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_encashment', ROUND(v_total_encashment, 2),
    'per_day_salary', v_per_day_salary,
    'working_days_per_month', v_working_days_per_month,
    'details', v_details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to calculate gratuity (India rules)
CREATE OR REPLACE FUNCTION public.calculate_gratuity(
  p_profile_id UUID,
  p_exit_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_date_of_joining DATE;
  v_last_drawn_salary NUMERIC;
  v_years_of_service NUMERIC;
  v_gratuity_amount NUMERIC := 0;
  v_is_eligible BOOLEAN := FALSE;
BEGIN
  -- Get joining date and current salary
  SELECT 
    p.date_of_joining,
    ss.monthly_gross
  INTO v_date_of_joining, v_last_drawn_salary
  FROM public.profiles p
  LEFT JOIN public.salary_structures ss ON ss.profile_id = p.id AND ss.is_current = TRUE
  WHERE p.id = p_profile_id;

  IF v_date_of_joining IS NULL THEN
    RETURN jsonb_build_object('error', 'Date of joining not found');
  END IF;

  -- Calculate years of service
  v_years_of_service := ROUND((p_exit_date - v_date_of_joining) / 365.0, 2);
  
  -- Gratuity is eligible after 5 years of continuous service
  v_is_eligible := v_years_of_service >= 5;
  
  IF v_is_eligible THEN
    -- Formula: (15 days salary / 26 days) * years of service
    -- 15 days salary = (monthly_gross / 26) * 15
    v_gratuity_amount := ROUND(((v_last_drawn_salary / 26.0) * 15) * v_years_of_service, 2);
    
    -- Cap at Rs. 20,00,000 as per Payment of Gratuity Act
    IF v_gratuity_amount > 2000000 THEN
      v_gratuity_amount := 2000000;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_eligible', v_is_eligible,
    'years_of_service', v_years_of_service,
    'last_drawn_salary', v_last_drawn_salary,
    'gratuity_amount', v_gratuity_amount,
    'formula', '(15/26 * monthly_gross) * years_of_service',
    'max_cap', 2000000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to calculate notice recovery
CREATE OR REPLACE FUNCTION public.calculate_notice_recovery(
  p_profile_id UUID,
  p_resignation_date DATE,
  p_last_working_day DATE,
  p_notice_period_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  v_actual_notice_days INTEGER;
  v_shortfall_days INTEGER;
  v_monthly_gross NUMERIC;
  v_per_day_salary NUMERIC;
  v_recovery_amount NUMERIC := 0;
  v_working_week_policy TEXT;
  v_working_days_per_month NUMERIC;
BEGIN
  -- Calculate actual notice days given
  v_actual_notice_days := p_last_working_day - p_resignation_date;
  v_shortfall_days := p_notice_period_days - v_actual_notice_days;
  
  IF v_shortfall_days <= 0 THEN
    RETURN jsonb_build_object(
      'notice_period_required', p_notice_period_days,
      'notice_period_served', v_actual_notice_days,
      'shortfall_days', 0,
      'recovery_amount', 0,
      'is_recovery_required', FALSE
    );
  END IF;

  -- Get salary and working week policy
  SELECT ss.monthly_gross, p.working_week_policy
  INTO v_monthly_gross, v_working_week_policy
  FROM public.salary_structures ss
  JOIN public.profiles p ON p.id = ss.profile_id
  WHERE ss.profile_id = p_profile_id
    AND ss.is_current = TRUE
  LIMIT 1;

  -- Calculate per day salary
  v_working_days_per_month := CASE 
    WHEN v_working_week_policy = '6_days' THEN 26
    ELSE 22
  END;
  
  v_per_day_salary := ROUND(v_monthly_gross / v_working_days_per_month, 2);
  v_recovery_amount := ROUND(v_shortfall_days * v_per_day_salary, 2);

  RETURN jsonb_build_object(
    'notice_period_required', p_notice_period_days,
    'notice_period_served', v_actual_notice_days,
    'shortfall_days', v_shortfall_days,
    'per_day_salary', v_per_day_salary,
    'recovery_amount', v_recovery_amount,
    'is_recovery_required', TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to calculate asset recovery
CREATE OR REPLACE FUNCTION public.calculate_asset_recovery(
  p_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_total_recovery NUMERIC := 0;
  v_assets JSONB := '[]'::JSONB;
  v_asset RECORD;
BEGIN
  FOR v_asset IN
    SELECT 
      id,
      asset_type,
      asset_name,
      serial_number,
      status,
      recovery_amount,
      recovery_status
    FROM public.employee_assets
    WHERE profile_id = p_profile_id
      AND status IN ('assigned', 'in_use', 'lost', 'damaged')
      AND recovery_status IN ('pending', 'not_applicable')
  LOOP
    v_total_recovery := v_total_recovery + COALESCE(v_asset.recovery_amount, 0);
    v_assets := v_assets || jsonb_build_object(
      'asset_id', v_asset.id,
      'asset_type', v_asset.asset_type,
      'asset_name', v_asset.asset_name,
      'serial_number', v_asset.serial_number,
      'status', v_asset.status,
      'recovery_amount', v_asset.recovery_amount
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total_recovery', v_total_recovery,
    'assets_pending', v_assets
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Master F&F Calculation Function
CREATE OR REPLACE FUNCTION public.calculate_fnf(
  p_profile_id UUID,
  p_exit_date DATE,
  p_last_working_day DATE DEFAULT NULL,
  p_resignation_date DATE DEFAULT NULL,
  p_notice_period_days INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  v_fnf_id UUID;
  v_last_day DATE;
  v_salary_proration JSONB;
  v_leave_encashment JSONB;
  v_gratuity JSONB;
  v_notice_recovery JSONB;
  v_asset_recovery JSONB;
  v_loan_deduction NUMERIC := 0; -- TODO: Integrate with loan management
  v_tds_deduction NUMERIC := 0; -- TODO: Integrate with TDS calculation
  
  v_gross_earnings NUMERIC := 0;
  v_total_deductions NUMERIC := 0;
  v_net_payable NUMERIC := 0;
  v_metadata JSONB;
BEGIN
  v_last_day := COALESCE(p_last_working_day, p_exit_date);
  
  -- Calculate all components
  v_salary_proration := public.calculate_salary_proration(p_profile_id, p_exit_date, v_last_day);
  v_leave_encashment := public.calculate_leave_encashment(p_profile_id, p_exit_date);
  v_gratuity := public.calculate_gratuity(p_profile_id, p_exit_date);
  v_asset_recovery := public.calculate_asset_recovery(p_profile_id);
  
  -- Calculate notice recovery if resignation date provided
  IF p_resignation_date IS NOT NULL THEN
    v_notice_recovery := public.calculate_notice_recovery(
      p_profile_id, 
      p_resignation_date, 
      v_last_day, 
      p_notice_period_days
    );
  ELSE
    v_notice_recovery := jsonb_build_object('recovery_amount', 0);
  END IF;

  -- Sum up earnings
  v_gross_earnings := 
    COALESCE((v_salary_proration->>'prorated_amount')::NUMERIC, 0) +
    COALESCE((v_leave_encashment->>'total_encashment')::NUMERIC, 0) +
    COALESCE((v_gratuity->>'gratuity_amount')::NUMERIC, 0);
  
  -- Sum up deductions
  v_total_deductions := 
    COALESCE((v_notice_recovery->>'recovery_amount')::NUMERIC, 0) +
    COALESCE((v_asset_recovery->>'total_recovery')::NUMERIC, 0) +
    v_loan_deduction +
    v_tds_deduction;
  
  -- Calculate net
  v_net_payable := v_gross_earnings - v_total_deductions;

  -- Build metadata
  v_metadata := jsonb_build_object(
    'salary_proration', v_salary_proration,
    'leave_encashment', v_leave_encashment,
    'gratuity', v_gratuity,
    'notice_recovery', v_notice_recovery,
    'asset_recovery', v_asset_recovery,
    'loan_deduction', v_loan_deduction,
    'tds_deduction', v_tds_deduction
  );

  -- Insert or update F&F record
  INSERT INTO public.final_settlements (
    profile_id,
    exit_date,
    calculation_date,
    gross_earnings,
    salary_proration,
    leave_encashment,
    gratuity,
    total_deductions,
    notice_recovery,
    asset_recovery,
    loan_deduction,
    tds_deduction,
    net_payable,
    status,
    calculated_by,
    calculation_metadata
  ) VALUES (
    p_profile_id,
    p_exit_date,
    CURRENT_DATE,
    v_gross_earnings,
    COALESCE((v_salary_proration->>'prorated_amount')::NUMERIC, 0),
    COALESCE((v_leave_encashment->>'total_encashment')::NUMERIC, 0),
    COALESCE((v_gratuity->>'gratuity_amount')::NUMERIC, 0),
    v_total_deductions,
    COALESCE((v_notice_recovery->>'recovery_amount')::NUMERIC, 0),
    COALESCE((v_asset_recovery->>'total_recovery')::NUMERIC, 0),
    v_loan_deduction,
    v_tds_deduction,
    v_net_payable,
    'calculated',
    auth.uid(),
    v_metadata
  )
  ON CONFLICT (profile_id, exit_date)
  DO UPDATE SET
    calculation_date = CURRENT_DATE,
    gross_earnings = EXCLUDED.gross_earnings,
    salary_proration = EXCLUDED.salary_proration,
    leave_encashment = EXCLUDED.leave_encashment,
    gratuity = EXCLUDED.gratuity,
    total_deductions = EXCLUDED.total_deductions,
    notice_recovery = EXCLUDED.notice_recovery,
    asset_recovery = EXCLUDED.asset_recovery,
    loan_deduction = EXCLUDED.loan_deduction,
    tds_deduction = EXCLUDED.tds_deduction,
    net_payable = EXCLUDED.net_payable,
    calculated_by = EXCLUDED.calculated_by,
    calculation_metadata = EXCLUDED.calculation_metadata,
    updated_at = NOW()
  WHERE public.final_settlements.is_locked = FALSE -- Only update if not locked
  RETURNING id INTO v_fnf_id;

  -- Publish event
  PERFORM public.publish_hr_event(
    'FnFCalculated',
    'final_settlement',
    v_fnf_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'exit_date', p_exit_date,
      'gross_earnings', v_gross_earnings,
      'total_deductions', v_total_deductions,
      'net_payable', v_net_payable
    ),
    format('fnf_calculated_%s_%s', p_profile_id, p_exit_date),
    gen_random_uuid()
  );

  RETURN v_fnf_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to approve F&F
CREATE OR REPLACE FUNCTION public.approve_fnf(
  p_fnf_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Check if F&F is in correct status
  IF NOT EXISTS (
    SELECT 1 FROM public.final_settlements
    WHERE id = p_fnf_id
      AND status IN ('calculated', 'pending_approval')
      AND is_locked = FALSE
  ) THEN
    RAISE EXCEPTION 'F&F cannot be approved - invalid status or locked';
  END IF;

  -- Update status
  UPDATE public.final_settlements
  SET 
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = NOW(),
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_fnf_id
  RETURNING profile_id INTO v_profile_id;

  -- Publish event
  PERFORM public.publish_hr_event(
    'FnFApproved',
    'final_settlement',
    p_fnf_id,
    jsonb_build_object(
      'fnf_id', p_fnf_id,
      'profile_id', v_profile_id,
      'approved_by', auth.uid(),
      'approved_at', NOW()
    ),
    format('fnf_approved_%s', p_fnf_id),
    gen_random_uuid()
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_fnf TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_fnf TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_salary_proration TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_leave_encashment TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_gratuity TO authenticated;

-- Add comments
COMMENT ON FUNCTION calculate_fnf IS 'Master F&F calculation engine with all India compliance components';
COMMENT ON FUNCTION calculate_gratuity IS 'Calculates gratuity as per Payment of Gratuity Act, 1972 (15/26 * last drawn salary * years)';
COMMENT ON FUNCTION calculate_leave_encashment IS 'Calculates leave encashment for casual and earned leaves';
COMMENT ON FUNCTION approve_fnf IS 'Approves F&F settlement and publishes event for downstream processing';
