
-- Add LOP (Loss of Pay) columns to payroll_records
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS lop_days NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lop_deduction NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_days NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_days NUMERIC NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.payroll_records.lop_days IS 'Number of Loss of Pay days in the pay period';
COMMENT ON COLUMN public.payroll_records.lop_deduction IS 'Amount deducted for LOP days';
COMMENT ON COLUMN public.payroll_records.working_days IS 'Total working days in the pay period';
COMMENT ON COLUMN public.payroll_records.paid_days IS 'Actual paid days (working_days - lop_days)';
