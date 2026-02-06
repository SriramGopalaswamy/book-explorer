
-- Create payroll_records table for salary management
CREATE TABLE public.payroll_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_period TEXT NOT NULL, -- e.g. '2026-02' for Feb 2026
  basic_salary NUMERIC NOT NULL DEFAULT 0,
  hra NUMERIC NOT NULL DEFAULT 0,
  transport_allowance NUMERIC NOT NULL DEFAULT 0,
  other_allowances NUMERIC NOT NULL DEFAULT 0,
  pf_deduction NUMERIC NOT NULL DEFAULT 0,
  tax_deduction NUMERIC NOT NULL DEFAULT 0,
  other_deductions NUMERIC NOT NULL DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  processed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- Admins and HR can do everything
CREATE POLICY "Admins and HR can manage all payroll"
  ON public.payroll_records FOR ALL
  USING (is_admin_or_hr(auth.uid()));

-- Managers can view payroll
CREATE POLICY "Managers can view payroll"
  ON public.payroll_records FOR SELECT
  USING (is_admin_hr_or_manager(auth.uid()));

-- Employees can view their own payroll
CREATE POLICY "Users can view own payroll"
  ON public.payroll_records FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_payroll_records_profile_period ON public.payroll_records(profile_id, pay_period);
CREATE INDEX idx_payroll_records_user_id ON public.payroll_records(user_id);
