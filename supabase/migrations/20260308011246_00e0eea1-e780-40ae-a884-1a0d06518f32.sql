
-- ═══════════════════════════════════════════════════════════════
-- POST 5: Payment of Wages Act + State Leave Rules + Data Export
-- ═══════════════════════════════════════════════════════════════

-- 1) Wage Payment Deadline Tracker (Payment of Wages Act, 1936 §5)
-- Establishments with <1000 employees: wages by 7th of following month
-- Establishments with ≥1000 employees: wages by 10th of following month
CREATE TABLE IF NOT EXISTS public.wage_payment_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  pay_period text NOT NULL,            -- e.g. '2026-03'
  employee_threshold int NOT NULL DEFAULT 1000,
  employee_count int NOT NULL DEFAULT 0,
  deadline_date date NOT NULL,
  actual_payment_date date,
  status text NOT NULL DEFAULT 'pending',  -- pending, compliant, overdue, paid_late
  penalty_applicable boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, pay_period)
);

ALTER TABLE public.wage_payment_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wage_deadlines_org_read" ON public.wage_payment_deadlines
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "wage_deadlines_org_insert" ON public.wage_payment_deadlines
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "wage_deadlines_org_update" ON public.wage_payment_deadlines
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- Auto-set org trigger
CREATE TRIGGER trg_wage_deadlines_org
  BEFORE INSERT ON public.wage_payment_deadlines
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_organization_id();

-- 2) State-specific leave configuration table
-- Shops & Establishments Act varies by state
CREATE TABLE IF NOT EXISTS public.state_leave_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  state_code text NOT NULL,           -- e.g. 'MH', 'KA', 'DL'
  state_name text NOT NULL,
  casual_leave_days int NOT NULL DEFAULT 7,
  sick_leave_days int NOT NULL DEFAULT 7,
  earned_leave_days int NOT NULL DEFAULT 15,
  maternity_leave_days int NOT NULL DEFAULT 182,  -- Maternity Benefit Act 2017
  paternity_leave_days int NOT NULL DEFAULT 15,
  carry_forward_allowed boolean DEFAULT true,
  max_carry_forward_days int DEFAULT 30,
  min_days_for_el_accrual int DEFAULT 240,  -- Min working days to earn EL
  weekly_off_count int DEFAULT 1,     -- 1 or 2 weekly offs
  max_work_hours_per_week int DEFAULT 48,  -- Factories Act
  overtime_rate_multiplier numeric(3,1) DEFAULT 2.0,  -- 2x for OT
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, state_code)
);

ALTER TABLE public.state_leave_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "state_leave_rules_org_read" ON public.state_leave_rules
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "state_leave_rules_org_write" ON public.state_leave_rules
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE TRIGGER trg_state_leave_rules_org
  BEFORE INSERT ON public.state_leave_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_organization_id();

-- 3) Personal data export request table (DPDPA 2023 - Right to Access)
CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  request_type text NOT NULL DEFAULT 'full_export',  -- full_export, partial
  data_categories text[] DEFAULT ARRAY['profile','attendance','leaves','payroll','documents'],
  status text NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
  file_url text,
  requested_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,  -- Link expires after 7 days
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_export_own_read" ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "data_export_own_insert" ON public.data_export_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "data_export_own_update" ON public.data_export_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_data_export_org
  BEFORE INSERT ON public.data_export_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_organization_id();

-- 4) Ind AS compliance metadata on financial_records
-- Add revenue recognition method tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'financial_records' AND column_name = 'ind_as_category'
  ) THEN
    ALTER TABLE public.financial_records ADD COLUMN ind_as_category text;
    ALTER TABLE public.financial_records ADD COLUMN recognition_method text DEFAULT 'point_in_time';
    ALTER TABLE public.financial_records ADD COLUMN performance_obligation text;
    COMMENT ON COLUMN public.financial_records.ind_as_category IS 'Ind AS 115 category: goods_transfer, service_over_time, license, royalty';
    COMMENT ON COLUMN public.financial_records.recognition_method IS 'point_in_time or over_time per Ind AS 115';
  END IF;
END $$;
