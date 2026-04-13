
-- Unified read-only view joining profiles with employee_details.
-- security_invoker = on means RLS on both underlying tables is enforced
-- for whoever queries the view — no privilege escalation.
--
-- All writes continue to target profiles / employee_details directly;
-- this view is consumed by useEmployees (admin/HR branch) and is the
-- source of truth for employee cards and payslip display.

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
  -- employee_details fields (all nullable — LEFT JOIN means employees without a
  -- details row still appear in the list with NULLs for the extended columns)
  ed.gender,
  ed.date_of_birth,
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
