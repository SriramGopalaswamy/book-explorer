-- ===================================================================
-- MS365 ONBOARDING: Add pending_approval status + pending_manager_email
-- ===================================================================
-- 1. Extends profiles.status check constraint to include 'pending_approval'
--    so new users who login via MS365 without pre-provisioning can be
--    held in a pending state until an admin approves them.
-- 2. Adds pending_manager_email column for deferred manager resolution
--    when a user's manager has not yet logged into the system.
-- ===================================================================

-- 1. Extend profiles.status to include pending_approval
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'on_leave', 'inactive', 'pending_approval'));

-- 2. Add pending_manager_email for deferred manager resolution
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_manager_email TEXT;

-- Index for efficient lookup when resolving pending managers on login
CREATE INDEX IF NOT EXISTS idx_profiles_pending_manager_email
  ON public.profiles(pending_manager_email)
  WHERE pending_manager_email IS NOT NULL;

COMMENT ON COLUMN public.profiles.pending_manager_email IS
  'Stores the MS365 email of the manager when they are not yet provisioned in the system. Resolved to manager_id on next login.';
