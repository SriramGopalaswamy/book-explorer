ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'on_leave', 'inactive', 'pending_approval'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_manager_email TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_pending_manager_email
  ON public.profiles (pending_manager_email)
  WHERE pending_manager_email IS NOT NULL;

COMMENT ON COLUMN public.profiles.pending_manager_email IS
  'Stores the Microsoft 365 email of a manager until that manager has a matching profile and can be resolved to manager_id.';