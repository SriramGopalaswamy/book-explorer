-- Step 1: Add location column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text;

-- Step 2: Drop and recreate the view with the new column
DROP VIEW IF EXISTS public.employee_full_profiles;

CREATE VIEW public.employee_full_profiles
WITH (security_invoker = on) AS
SELECT
  p.id, p.user_id, p.organization_id, p.full_name, p.email,
  p.avatar_url, p.job_title, p.department, p.status,
  p.join_date, p.phone, p.manager_id,
  p.employee_id, p.location, p.created_at, p.updated_at,
  ed.gender,
  ed.date_of_birth,
  ed.blood_group, ed.marital_status, ed.nationality,
  ed.address_line1, ed.address_line2, ed.city, ed.state,
  ed.pincode, ed.country, ed.emergency_contact_name,
  ed.emergency_contact_relation, ed.emergency_contact_phone,
  ed.bank_name, ed.bank_account_number, ed.bank_ifsc, ed.bank_branch,
  ed.employee_id_number, ed.pan_number, ed.aadhaar_last_four,
  ed.uan_number, ed.esi_number
FROM public.profiles p
LEFT JOIN public.employee_details ed ON ed.profile_id = p.id;