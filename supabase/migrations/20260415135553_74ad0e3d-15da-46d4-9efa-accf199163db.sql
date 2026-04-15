-- Add exit/offboarding columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exit_date date,
  ADD COLUMN IF NOT EXISTS last_working_day date,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS notice_served boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fnf_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS exit_interview_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rehire_eligible boolean,
  ADD COLUMN IF NOT EXISTS manager_signoff_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS manager_signoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_return_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS knowledge_transfer_status text DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Update status constraint to include 'exited'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'on_leave', 'inactive', 'pending_approval', 'exited'));

-- Add constraint for exit_reason values
ALTER TABLE public.profiles ADD CONSTRAINT profiles_exit_reason_check
  CHECK (exit_reason IS NULL OR exit_reason IN ('resignation', 'termination', 'retirement', 'absconding', 'contract_end'));

-- Add constraint for fnf_status values
ALTER TABLE public.profiles ADD CONSTRAINT profiles_fnf_status_check
  CHECK (fnf_status IS NULL OR fnf_status IN ('pending', 'processing', 'settled'));

-- Add constraint for knowledge_transfer_status values
ALTER TABLE public.profiles ADD CONSTRAINT profiles_kt_status_check
  CHECK (knowledge_transfer_status IS NULL OR knowledge_transfer_status IN ('not_started', 'in_progress', 'completed'));

-- Index for quickly finding exited employees
CREATE INDEX IF NOT EXISTS idx_profiles_exit_date ON public.profiles(exit_date) WHERE exit_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_status_exited ON public.profiles(organization_id) WHERE status = 'exited';