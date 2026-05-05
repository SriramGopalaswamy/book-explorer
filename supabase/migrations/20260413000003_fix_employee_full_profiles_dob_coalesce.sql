
-- Fix: use COALESCE for date_of_birth so employees who have it set on the
-- profiles row (via the state-machine workflow) but not yet in employee_details
-- still surface the correct value.  All other columns are unchanged.

CREATE OR REPLACE VIEW public.employee_full_profiles
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
