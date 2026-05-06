ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.reimbursement_requests ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE public.attendance_records ar SET user_id = p.user_id
  FROM public.profiles p WHERE p.id = ar.profile_id AND ar.user_id IS NULL;
UPDATE public.expenses e SET user_id = p.user_id
  FROM public.profiles p WHERE p.id = e.profile_id AND e.user_id IS NULL;
UPDATE public.payroll_records pr SET user_id = p.user_id
  FROM public.profiles p WHERE p.id = pr.profile_id AND pr.user_id IS NULL;
UPDATE public.reimbursement_requests rr SET user_id = p.user_id
  FROM public.profiles p WHERE p.id = rr.profile_id AND rr.user_id IS NULL;
