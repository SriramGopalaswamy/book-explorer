
-- ============================================================
-- STAGE 1: IDENTITY NORMALIZATION
-- Purpose: Standardize user_id + profile_id on all HR tables
-- ============================================================

-- Step 1: Backfill missing profile_id in leave_requests
UPDATE public.leave_requests lr
SET profile_id = p.id
FROM public.profiles p
WHERE p.user_id = lr.user_id
  AND lr.profile_id IS NULL;

-- Step 2: Add FK constraints where missing
-- (attendance_correction_requests already has FK via migration)
-- Check and add FKs for tables that reference profiles

-- leave_balances: add FK if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'leave_balances_profile_id_fkey'
    AND table_name = 'leave_balances'
  ) THEN
    ALTER TABLE public.leave_balances
      ADD CONSTRAINT leave_balances_profile_id_fkey 
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id);
  END IF;
END $$;

-- goal_plans: already has FK (goal_plans_profile_id_fkey)
-- payroll_records: already has FK (payroll_records_profile_id_fkey)
-- attendance_records: already has FK (attendance_records_profile_id_fkey)
-- attendance_correction_requests: already has FK (attendance_correction_requests_profile_id_fkey)
-- leave_requests: already has FK (leave_requests_profile_id_fkey)
-- reimbursement_requests: already has FK (reimbursement_requests_profile_id_fkey)

-- Step 3: Create validation function to ensure identity sync
CREATE OR REPLACE FUNCTION public.validate_identity_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_user_id UUID;
BEGIN
  -- If both user_id and profile_id are set, verify they match
  IF NEW.user_id IS NOT NULL AND NEW.profile_id IS NOT NULL THEN
    SELECT user_id INTO _profile_user_id
    FROM public.profiles
    WHERE id = NEW.profile_id;
    
    IF _profile_user_id IS NULL THEN
      RAISE EXCEPTION 'profile_id % does not exist in profiles', NEW.profile_id;
    END IF;
    
    IF _profile_user_id != NEW.user_id THEN
      RAISE EXCEPTION 'Identity mismatch: profile.user_id (%) != table.user_id (%)', _profile_user_id, NEW.user_id;
    END IF;
  END IF;
  
  -- Auto-populate profile_id from user_id if missing
  IF NEW.user_id IS NOT NULL AND NEW.profile_id IS NULL THEN
    SELECT id INTO NEW.profile_id
    FROM public.profiles
    WHERE user_id = NEW.user_id
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 4: Attach identity sync triggers to all HR tables
CREATE TRIGGER trg_identity_sync_attendance_records
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();

CREATE TRIGGER trg_identity_sync_attendance_correction_requests
  BEFORE INSERT OR UPDATE ON public.attendance_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();

CREATE TRIGGER trg_identity_sync_leave_requests
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();

CREATE TRIGGER trg_identity_sync_leave_balances
  BEFORE INSERT OR UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();

CREATE TRIGGER trg_identity_sync_payroll_records
  BEFORE INSERT OR UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();

CREATE TRIGGER trg_identity_sync_goal_plans
  BEFORE INSERT OR UPDATE ON public.goal_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();

CREATE TRIGGER trg_identity_sync_reimbursement_requests
  BEFORE INSERT OR UPDATE ON public.reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_identity_sync();
