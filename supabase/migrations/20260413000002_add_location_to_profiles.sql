
-- Add location column to profiles table.
-- This powers the Location field on payslips (PaySlipDialog reads r.profiles?.location)
-- and can be populated via the "Update Employee Details" bulk upload.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text;
