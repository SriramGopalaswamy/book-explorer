-- Add misc_deductions column to payroll_records for "Other Deductions" support.
-- This captures deductions that are not PF, Professional Tax, TDS, or LOP —
-- e.g. salary advances recovered, gratuity, canteen, welfare fund, etc.
-- Displayed as "Other Deductions" on the payslip.

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS misc_deductions NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_records.misc_deductions IS 'Miscellaneous / other deductions not covered by PF, Professional Tax, TDS, or LOP. Shown as "Other Deductions" on payslip.';
