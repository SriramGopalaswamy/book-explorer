
-- Add location column to profiles table.
-- This powers the Location field on payslips (PaySlipDialog reads r.profiles?.location)
-- and can be populated via the "Update Employee Details" bulk upload.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text;

-- Rebuild the view now that profiles.location exists so the column is exposed
-- through employee_full_profiles.  Runs AFTER the ALTER TABLE above.
-- Use DROP + CREATE (not CREATE OR REPLACE) so that PostgreSQL does not reject
-- the new column being inserted mid-list; CREATE OR REPLACE only allows appending.

DROP VIEW IF EXISTS public.employee_full_profiles;

CREATE VIEW public.employee_full_profiles
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.user_id,
  p.organization_id,
  p.full_name,
  p.email,
  p.avatar_url,
  p.job_title,
  p.department,
  p.status,
  p.join_date,
  p.date_of_joining,
  p.phone,
  p.manager_id,
  p.employee_id,
  p.location,
  p.created_at,
  p.updated_at,
  -- employee_details fields (all nullable — LEFT JOIN)
  ed.gender,
  -- Prefer employee_details.date_of_birth; fall back to profiles.date_of_birth
  -- (profiles gained date_of_birth via the state-machine migration)
  COALESCE(ed.date_of_birth, p.date_of_birth) AS date_of_birth,
  ed.blood_group,
  ed.marital_status,
  ed.nationality,
  ed.address_line1,
  ed.address_line2,
  ed.city,
  ed.state,
  ed.pincode,
  ed.country,
  ed.emergency_contact_name,
  ed.emergency_contact_relation,
  ed.emergency_contact_phone,
  ed.bank_name,
  ed.bank_account_number,
  ed.bank_ifsc,
  ed.bank_branch,
  ed.employee_id_number,
  ed.pan_number,
  ed.aadhaar_last_four,
  ed.uan_number,
  ed.esi_number
FROM public.profiles p
LEFT JOIN public.employee_details ed ON ed.profile_id = p.id;
