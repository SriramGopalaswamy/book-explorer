-- ===================================================================
-- PHASE 3: DATABASE EXPANSION
-- ===================================================================
-- Creates additional tables for employment history, salary structures,
-- final settlements, and asset management
-- ===================================================================

-- 1. Employment Periods Table (tracks all employment periods including rehires)
CREATE TABLE IF NOT EXISTS public.employment_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL, -- 1 for first employment, 2 for first rehire, etc.
  start_date DATE NOT NULL,
  end_date DATE,
  position TEXT,
  department TEXT,
  salary_grade TEXT,
  employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern')),
  probation_end_date DATE,
  is_current BOOLEAN DEFAULT TRUE,
  termination_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (profile_id, period_number)
);

CREATE INDEX idx_employment_periods_profile ON public.employment_periods(profile_id, period_number DESC);
CREATE INDEX idx_employment_periods_current ON public.employment_periods(profile_id) WHERE is_current = TRUE;

-- Enable RLS
ALTER TABLE public.employment_periods ENABLE ROW LEVEL SECURITY;

-- 2. Employee Manager History (tracks all manager relationships)
CREATE TABLE IF NOT EXISTS public.employee_manager_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES public.profiles(id),
  effective_from DATE NOT NULL,
  effective_to DATE,
  source_of_truth TEXT DEFAULT 'hrms' CHECK (source_of_truth IN ('hrms', 'ms_graph', 'manual')),
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed', 'conflict')),
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_manager_history_profile ON public.employee_manager_history(profile_id, effective_from DESC);
CREATE INDEX idx_manager_history_manager ON public.employee_manager_history(manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX idx_manager_history_current ON public.employee_manager_history(profile_id) WHERE is_current = TRUE;

-- Enable RLS
ALTER TABLE public.employee_manager_history ENABLE ROW LEVEL SECURITY;

-- 3. Salary Structures (master salary structure for each employee)
CREATE TABLE IF NOT EXISTS public.salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  annual_ctc NUMERIC(12, 2) NOT NULL,
  monthly_gross NUMERIC(12, 2) NOT NULL,
  structure_json JSONB NOT NULL, -- Full breakdown
  is_current BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'superseded', 'terminated')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  is_locked BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (profile_id, effective_from)
);

CREATE INDEX idx_salary_structures_profile ON public.salary_structures(profile_id, effective_from DESC);
CREATE INDEX idx_salary_structures_current ON public.salary_structures(profile_id) WHERE is_current = TRUE;
CREATE INDEX idx_salary_structures_locked ON public.salary_structures(is_locked) WHERE is_locked = TRUE;

-- Enable RLS
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;

-- 4. Salary Components (detailed components of salary structure)
CREATE TABLE IF NOT EXISTS public.salary_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id UUID NOT NULL REFERENCES public.salary_structures(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'basic', 'hra', 'transport', 'medical', 'special_allowance', 'bonus',
    'pf_employee', 'pf_employer', 'esi_employee', 'esi_employer',
    'professional_tax', 'tds', 'loan_deduction', 'other_deduction'
  )),
  component_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  is_taxable BOOLEAN DEFAULT TRUE,
  is_pf_eligible BOOLEAN DEFAULT FALSE,
  is_esi_eligible BOOLEAN DEFAULT FALSE,
  calculation_formula TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_salary_components_structure ON public.salary_components(structure_id);

-- Enable RLS
ALTER TABLE public.salary_components ENABLE ROW LEVEL SECURITY;

-- 5. Final Settlements (F&F calculations)
CREATE TABLE IF NOT EXISTS public.final_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employment_period_id UUID REFERENCES public.employment_periods(id),
  exit_date DATE NOT NULL,
  calculation_date DATE NOT NULL,
  
  -- Earnings
  gross_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  salary_proration NUMERIC(12, 2) DEFAULT 0,
  leave_encashment NUMERIC(12, 2) DEFAULT 0,
  gratuity NUMERIC(12, 2) DEFAULT 0,
  bonus_pending NUMERIC(12, 2) DEFAULT 0,
  other_earnings NUMERIC(12, 2) DEFAULT 0,
  
  -- Deductions
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notice_recovery NUMERIC(12, 2) DEFAULT 0,
  asset_recovery NUMERIC(12, 2) DEFAULT 0,
  loan_deduction NUMERIC(12, 2) DEFAULT 0,
  tds_deduction NUMERIC(12, 2) DEFAULT 0,
  other_deductions NUMERIC(12, 2) DEFAULT 0,
  
  -- Net
  net_payable NUMERIC(12, 2) NOT NULL,
  
  -- Status and approval
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'pending_approval', 'approved', 'paid', 'rejected')),
  calculated_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_reference TEXT,
  
  -- Locking
  is_locked BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES auth.users(id),
  
  -- Metadata
  calculation_metadata JSONB, -- Detailed breakdown
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (profile_id, exit_date)
);

CREATE INDEX idx_final_settlements_profile ON public.final_settlements(profile_id);
CREATE INDEX idx_final_settlements_status ON public.final_settlements(status);
CREATE INDEX idx_final_settlements_locked ON public.final_settlements(is_locked) WHERE is_locked = TRUE;

-- Enable RLS
ALTER TABLE public.final_settlements ENABLE ROW LEVEL SECURITY;

-- 6. Employee Assets
CREATE TABLE IF NOT EXISTS public.employee_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'laptop', 'mobile', 'tablet', 'monitor', 'keyboard', 'mouse',
    'headset', 'chair', 'desk', 'access_card', 'other'
  )),
  asset_name TEXT NOT NULL,
  serial_number TEXT,
  purchase_value NUMERIC(12, 2),
  current_value NUMERIC(12, 2),
  assigned_date DATE NOT NULL,
  expected_return_date DATE,
  returned_date DATE,
  status TEXT DEFAULT 'assigned' CHECK (status IN (
    'assigned', 'in_use', 'returned', 'damaged', 'lost', 'recovery_pending'
  )),
  recovery_amount NUMERIC(12, 2) DEFAULT 0,
  recovery_status TEXT DEFAULT 'not_applicable' CHECK (recovery_status IN (
    'not_applicable', 'pending', 'deducted', 'waived'
  )),
  condition_at_return TEXT,
  notes TEXT,
  assigned_by UUID REFERENCES auth.users(id),
  returned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_employee_assets_profile ON public.employee_assets(profile_id, assigned_date DESC);
CREATE INDEX idx_employee_assets_status ON public.employee_assets(status);
CREATE INDEX idx_employee_assets_recovery ON public.employee_assets(recovery_status) WHERE recovery_status = 'pending';

-- Enable RLS
ALTER TABLE public.employee_assets ENABLE ROW LEVEL SECURITY;

-- 7. Add locking columns to payroll_records (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payroll_records' AND column_name = 'is_locked') THEN
    ALTER TABLE public.payroll_records
      ADD COLUMN is_locked BOOLEAN DEFAULT FALSE,
      ADD COLUMN locked_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN locked_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 8. Add locking columns to attendance_records (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance_records' AND column_name = 'is_locked') THEN
    ALTER TABLE public.attendance_records
      ADD COLUMN is_locked BOOLEAN DEFAULT FALSE,
      ADD COLUMN locked_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN locked_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 9. RLS Policies for employment_periods
CREATE POLICY "Users can view own employment periods"
  ON public.employment_periods FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and HR can view all employment periods"
  ON public.employment_periods FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage employment periods"
  ON public.employment_periods FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- 10. RLS Policies for employee_manager_history
CREATE POLICY "Users can view own manager history"
  ON public.employee_manager_history FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and HR can view all manager history"
  ON public.employee_manager_history FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage manager history"
  ON public.employee_manager_history FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- 11. RLS Policies for salary_structures
CREATE POLICY "Users can view own salary structures"
  ON public.salary_structures FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and HR can view all salary structures"
  ON public.salary_structures FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage salary structures"
  ON public.salary_structures FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- 12. RLS Policies for salary_components
CREATE POLICY "Users can view own salary components"
  ON public.salary_components FOR SELECT
  USING (
    structure_id IN (
      SELECT id FROM public.salary_structures 
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Admins and HR can view all salary components"
  ON public.salary_components FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage salary components"
  ON public.salary_components FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- 13. RLS Policies for final_settlements
CREATE POLICY "Users can view own final settlements"
  ON public.final_settlements FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and HR can view all final settlements"
  ON public.final_settlements FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage final settlements"
  ON public.final_settlements FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- 14. RLS Policies for employee_assets
CREATE POLICY "Users can view own assets"
  ON public.employee_assets FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and HR can view all assets"
  ON public.employee_assets FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins and HR can manage assets"
  ON public.employee_assets FOR ALL
  USING (public.is_admin_or_hr(auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_employment_periods_updated_at
BEFORE UPDATE ON public.employment_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_manager_history_updated_at
BEFORE UPDATE ON public.employee_manager_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_salary_structures_updated_at
BEFORE UPDATE ON public.salary_structures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_final_settlements_updated_at
BEFORE UPDATE ON public.final_settlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_assets_updated_at
BEFORE UPDATE ON public.employee_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE employment_periods IS 'Tracks all employment periods for each employee including rehires';
COMMENT ON TABLE employee_manager_history IS 'Complete audit trail of manager relationships with MS Graph sync support';
COMMENT ON TABLE salary_structures IS 'Master salary structures with locking support for compliance';
COMMENT ON TABLE salary_components IS 'Detailed breakdown of salary components with tax and statutory flags';
COMMENT ON TABLE final_settlements IS 'Final & Full settlement calculations for exiting employees';
COMMENT ON TABLE employee_assets IS 'Asset lifecycle management with recovery tracking';
