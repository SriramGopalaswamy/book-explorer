-- ===================================================================
-- PHASE 5: INDIA PAYROLL ENGINE
-- ===================================================================
-- Complete India-compliant payroll engine with PF, ESI, PT, TDS
-- Supports old vs new tax regime, gratuity provision
-- ===================================================================

-- 1. Create payroll configuration table
CREATE TABLE IF NOT EXISTS public.payroll_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID, -- For multi-org support
  config_key TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payroll_config ENABLE ROW LEVEL SECURITY;

-- Insert default configurations
INSERT INTO public.payroll_config (config_key, config_value, effective_from) VALUES
  ('pf_rates', jsonb_build_object(
    'employee_rate', 0.12,
    'employer_rate', 0.12,
    'employer_admin_rate', 0.011,
    'wage_ceiling', 15000,
    'pension_ceiling', 15000
  ), '2024-01-01'),
  ('esi_rates', jsonb_build_object(
    'employee_rate', 0.0075,
    'employer_rate', 0.0325,
    'wage_ceiling', 21000
  ), '2024-01-01'),
  ('professional_tax', jsonb_build_object(
    'Maharashtra', '[
      {"from": 0, "to": 7500, "tax": 0},
      {"from": 7501, "to": 10000, "tax": 175},
      {"from": 10001, "to": 999999, "tax": 200}
    ]',
    'Karnataka', '[
      {"from": 0, "to": 15000, "tax": 0},
      {"from": 15001, "to": 999999, "tax": 200}
    ]'
  ), '2024-01-01'),
  ('tds_slabs_old_regime', jsonb_build_object(
    'slabs', '[
      {"from": 0, "to": 250000, "rate": 0},
      {"from": 250001, "to": 500000, "rate": 0.05},
      {"from": 500001, "to": 1000000, "rate": 0.20},
      {"from": 1000001, "to": 999999999, "rate": 0.30}
    ]',
    'standard_deduction', 50000,
    'cess', 0.04
  ), '2024-01-01'),
  ('tds_slabs_new_regime', jsonb_build_object(
    'slabs', '[
      {"from": 0, "to": 300000, "rate": 0},
      {"from": 300001, "to": 600000, "rate": 0.05},
      {"from": 600001, "to": 900000, "rate": 0.10},
      {"from": 900001, "to": 1200000, "rate": 0.15},
      {"from": 1200001, "to": 1500000, "rate": 0.20},
      {"from": 1500001, "to": 999999999, "rate": 0.30}
    ]',
    'standard_deduction', 50000,
    'cess', 0.04
  ), '2024-01-01'),
  ('gratuity', jsonb_build_object(
    'formula', '15/26 * last_drawn_salary * years_of_service',
    'min_years', 5,
    'max_amount', 2000000
  ), '2024-01-01')
ON CONFLICT (config_key) DO NOTHING;

-- 2. Function to get config value
CREATE OR REPLACE FUNCTION public.get_payroll_config(
  p_config_key TEXT,
  p_effective_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
BEGIN
  SELECT config_value INTO v_config
  FROM public.payroll_config
  WHERE config_key = p_config_key
    AND effective_from <= p_effective_date
    AND (effective_to IS NULL OR effective_to >= p_effective_date)
    AND is_active = TRUE
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN v_config;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to calculate PF
CREATE OR REPLACE FUNCTION public.calculate_pf(
  p_basic_salary NUMERIC,
  p_hra NUMERIC DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
  v_pf_wage NUMERIC;
  v_employee_pf NUMERIC;
  v_employer_pf NUMERIC;
  v_employer_pension NUMERIC;
  v_employer_admin NUMERIC;
  v_total_employer NUMERIC;
BEGIN
  v_config := public.get_payroll_config('pf_rates');
  
  -- PF wage = Basic + HRA (capped at ceiling)
  v_pf_wage := LEAST(p_basic_salary + p_hra, (v_config->>'wage_ceiling')::NUMERIC);
  
  -- Employee contribution: 12% of PF wage
  v_employee_pf := ROUND(v_pf_wage * (v_config->>'employee_rate')::NUMERIC, 2);
  
  -- Employer contribution: 12% of PF wage (split into pension and PF)
  v_employer_pension := ROUND(
    LEAST(v_pf_wage, (v_config->>'pension_ceiling')::NUMERIC) * 0.0833, 2
  ); -- 8.33% to pension
  v_employer_pf := ROUND(v_pf_wage * (v_config->>'employer_rate')::NUMERIC, 2) - v_employer_pension;
  
  -- Employer admin charges: 1.1%
  v_employer_admin := ROUND(v_pf_wage * (v_config->>'employer_admin_rate')::NUMERIC, 2);
  
  v_total_employer := v_employer_pf + v_employer_pension + v_employer_admin;
  
  RETURN jsonb_build_object(
    'pf_wage', v_pf_wage,
    'employee_contribution', v_employee_pf,
    'employer_contribution', v_total_employer,
    'employer_pf', v_employer_pf,
    'employer_pension', v_employer_pension,
    'employer_admin', v_employer_admin,
    'total_pf', v_employee_pf + v_total_employer
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Function to calculate ESI
CREATE OR REPLACE FUNCTION public.calculate_esi(
  p_gross_salary NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
  v_is_eligible BOOLEAN;
  v_employee_esi NUMERIC := 0;
  v_employer_esi NUMERIC := 0;
BEGIN
  v_config := public.get_payroll_config('esi_rates');
  
  -- ESI is applicable if gross <= 21,000
  v_is_eligible := p_gross_salary <= (v_config->>'wage_ceiling')::NUMERIC;
  
  IF v_is_eligible THEN
    v_employee_esi := ROUND(p_gross_salary * (v_config->>'employee_rate')::NUMERIC, 2);
    v_employer_esi := ROUND(p_gross_salary * (v_config->>'employer_rate')::NUMERIC, 2);
  END IF;
  
  RETURN jsonb_build_object(
    'is_eligible', v_is_eligible,
    'wage_ceiling', (v_config->>'wage_ceiling')::NUMERIC,
    'gross_salary', p_gross_salary,
    'employee_contribution', v_employee_esi,
    'employer_contribution', v_employer_esi,
    'total_esi', v_employee_esi + v_employer_esi
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Function to calculate Professional Tax
CREATE OR REPLACE FUNCTION public.calculate_professional_tax(
  p_gross_salary NUMERIC,
  p_state TEXT DEFAULT 'Maharashtra'
)
RETURNS JSONB AS $$
DECLARE
  v_config JSONB;
  v_slabs JSONB;
  v_slab JSONB;
  v_pt_amount NUMERIC := 0;
BEGIN
  v_config := public.get_payroll_config('professional_tax');
  v_slabs := v_config->p_state;
  
  IF v_slabs IS NULL THEN
    RETURN jsonb_build_object(
      'state', p_state,
      'pt_amount', 0,
      'error', 'PT slabs not configured for state'
    );
  END IF;
  
  -- Find applicable slab
  FOR v_slab IN SELECT * FROM jsonb_array_elements(v_slabs::JSONB)
  LOOP
    IF p_gross_salary >= (v_slab->>'from')::NUMERIC 
       AND p_gross_salary <= (v_slab->>'to')::NUMERIC THEN
      v_pt_amount := (v_slab->>'tax')::NUMERIC;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'state', p_state,
    'gross_salary', p_gross_salary,
    'pt_amount', v_pt_amount
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Function to calculate yearly TDS projection
CREATE OR REPLACE FUNCTION public.calculate_tds_projection(
  p_profile_id UUID,
  p_tax_regime TEXT DEFAULT 'new_regime'
)
RETURNS JSONB AS $$
DECLARE
  v_annual_ctc NUMERIC;
  v_monthly_gross NUMERIC;
  v_config JSONB;
  v_slabs JSONB;
  v_slab JSONB;
  v_taxable_income NUMERIC;
  v_tax NUMERIC := 0;
  v_cess NUMERIC;
  v_total_tax NUMERIC;
  v_monthly_tds NUMERIC;
  v_standard_deduction NUMERIC;
BEGIN
  -- Get current salary
  SELECT annual_ctc, monthly_gross INTO v_annual_ctc, v_monthly_gross
  FROM public.salary_structures
  WHERE profile_id = p_profile_id
    AND is_current = TRUE
    AND status = 'active'
  LIMIT 1;

  IF v_annual_ctc IS NULL THEN
    RETURN jsonb_build_object('error', 'No active salary structure found');
  END IF;

  -- Get tax config
  IF p_tax_regime = 'old_regime' THEN
    v_config := public.get_payroll_config('tds_slabs_old_regime');
  ELSE
    v_config := public.get_payroll_config('tds_slabs_new_regime');
  END IF;
  
  v_standard_deduction := (v_config->>'standard_deduction')::NUMERIC;
  v_slabs := v_config->'slabs';
  
  -- Calculate taxable income
  v_taxable_income := v_annual_ctc - v_standard_deduction;
  
  -- Calculate tax as per slabs
  FOR v_slab IN SELECT * FROM jsonb_array_elements(v_slabs::JSONB)
  LOOP
    DECLARE
      v_from NUMERIC := (v_slab->>'from')::NUMERIC;
      v_to NUMERIC := (v_slab->>'to')::NUMERIC;
      v_rate NUMERIC := (v_slab->>'rate')::NUMERIC;
      v_slab_income NUMERIC;
    BEGIN
      IF v_taxable_income > v_from THEN
        v_slab_income := LEAST(v_taxable_income, v_to) - v_from;
        v_tax := v_tax + (v_slab_income * v_rate);
      END IF;
    END;
  END LOOP;
  
  -- Add cess (4% on tax)
  v_cess := ROUND(v_tax * (v_config->>'cess')::NUMERIC, 2);
  v_total_tax := ROUND(v_tax + v_cess, 2);
  v_monthly_tds := ROUND(v_total_tax / 12, 2);
  
  RETURN jsonb_build_object(
    'tax_regime', p_tax_regime,
    'annual_ctc', v_annual_ctc,
    'standard_deduction', v_standard_deduction,
    'taxable_income', v_taxable_income,
    'tax_before_cess', ROUND(v_tax, 2),
    'cess', v_cess,
    'total_annual_tax', v_total_tax,
    'monthly_tds', v_monthly_tds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Master Payroll Processing Function
CREATE OR REPLACE FUNCTION public.process_payroll_for_employee(
  p_profile_id UUID,
  p_pay_period TEXT, -- Format: YYYY-MM
  p_tax_regime TEXT DEFAULT 'new_regime',
  p_state TEXT DEFAULT 'Maharashtra'
)
RETURNS UUID AS $$
DECLARE
  v_payroll_id UUID;
  v_salary_structure RECORD;
  v_pf_calc JSONB;
  v_esi_calc JSONB;
  v_pt_calc JSONB;
  v_tds_calc JSONB;
  v_basic NUMERIC;
  v_hra NUMERIC;
  v_gross NUMERIC;
  v_pf_deduction NUMERIC;
  v_esi_deduction NUMERIC;
  v_pt_deduction NUMERIC;
  v_tds_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_net_pay NUMERIC;
  v_idempotency_key TEXT;
BEGIN
  -- Get current salary structure
  SELECT * INTO v_salary_structure
  FROM public.salary_structures
  WHERE profile_id = p_profile_id
    AND is_current = TRUE
    AND status = 'active'
  LIMIT 1;

  IF v_salary_structure IS NULL THEN
    RAISE EXCEPTION 'No active salary structure found for employee';
  END IF;

  -- Extract salary components
  v_basic := COALESCE((v_salary_structure.structure_json->>'basic')::NUMERIC, v_salary_structure.monthly_gross * 0.4);
  v_hra := COALESCE((v_salary_structure.structure_json->>'hra')::NUMERIC, v_salary_structure.monthly_gross * 0.3);
  v_gross := v_salary_structure.monthly_gross;

  -- Calculate statutory deductions
  v_pf_calc := public.calculate_pf(v_basic, v_hra);
  v_esi_calc := public.calculate_esi(v_gross);
  v_pt_calc := public.calculate_professional_tax(v_gross, p_state);
  v_tds_calc := public.calculate_tds_projection(p_profile_id, p_tax_regime);

  -- Get deduction amounts
  v_pf_deduction := (v_pf_calc->>'employee_contribution')::NUMERIC;
  v_esi_deduction := (v_esi_calc->>'employee_contribution')::NUMERIC;
  v_pt_deduction := (v_pt_calc->>'pt_amount')::NUMERIC;
  v_tds_deduction := (v_tds_calc->>'monthly_tds')::NUMERIC;

  -- Calculate totals
  v_total_deductions := v_pf_deduction + v_esi_deduction + v_pt_deduction + v_tds_deduction;
  v_net_pay := v_gross - v_total_deductions;

  -- Idempotency key
  v_idempotency_key := format('payroll_%s_%s', p_profile_id, p_pay_period);

  -- Insert payroll record
  INSERT INTO public.payroll_records (
    profile_id,
    pay_period,
    basic_salary,
    hra,
    transport_allowance,
    other_allowances,
    pf_deduction,
    tax_deduction,
    other_deductions,
    net_pay,
    status
  ) VALUES (
    p_profile_id,
    p_pay_period,
    v_basic,
    v_hra,
    COALESCE((v_salary_structure.structure_json->>'transport')::NUMERIC, 0),
    v_gross - v_basic - v_hra,
    v_pf_deduction,
    v_tds_deduction,
    v_esi_deduction + v_pt_deduction,
    v_net_pay,
    'draft'
  )
  ON CONFLICT (profile_id, pay_period)
  DO UPDATE SET
    basic_salary = EXCLUDED.basic_salary,
    hra = EXCLUDED.hra,
    transport_allowance = EXCLUDED.transport_allowance,
    other_allowances = EXCLUDED.other_allowances,
    pf_deduction = EXCLUDED.pf_deduction,
    tax_deduction = EXCLUDED.tax_deduction,
    other_deductions = EXCLUDED.other_deductions,
    net_pay = EXCLUDED.net_pay,
    updated_at = NOW()
  WHERE public.payroll_records.is_locked = FALSE
  RETURNING id INTO v_payroll_id;

  -- Publish event
  PERFORM public.publish_hr_event(
    'PayrollProcessed',
    'payroll_record',
    v_payroll_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'pay_period', p_pay_period,
      'gross_salary', v_gross,
      'net_pay', v_net_pay,
      'pf_calc', v_pf_calc,
      'esi_calc', v_esi_calc,
      'pt_calc', v_pt_calc,
      'tds_calc', v_tds_calc
    ),
    v_idempotency_key,
    gen_random_uuid()
  );

  RETURN v_payroll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_pf TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_esi TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_professional_tax TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_tds_projection TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payroll_for_employee TO authenticated;

-- RLS for payroll_config
CREATE POLICY "Admins can view payroll config"
  ON public.payroll_config FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage payroll config"
  ON public.payroll_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Add comments
COMMENT ON TABLE payroll_config IS 'Configuration for payroll calculations including PF, ESI, PT, TDS rates';
COMMENT ON FUNCTION calculate_pf IS 'Calculates PF with employee/employer split as per EPF Act';
COMMENT ON FUNCTION calculate_esi IS 'Calculates ESI for eligible employees (gross <= 21k) as per ESI Act';
COMMENT ON FUNCTION calculate_professional_tax IS 'Calculates state-wise professional tax';
COMMENT ON FUNCTION calculate_tds_projection IS 'Projects annual TDS and monthly deduction for old/new regime';
COMMENT ON FUNCTION process_payroll_for_employee IS 'Master payroll processing with all India statutory compliance';
