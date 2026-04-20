-- =============================================================================
-- FIX: Seal the registration gap — auto-sync profiles.organization_id
--      whenever a user is added to organization_members
-- =============================================================================
-- Root cause (not addressed by 20260418000002):
--   handle_new_user creates a bare profile (no organization_id).
--   trg_auto_set_org_profiles fires BEFORE INSERT and calls
--   auto_set_organization_id(), which reads organization_members.
--   At registration time the user isn't in organization_members yet, so
--   organization_id stays NULL.  No subsequent trigger ever back-fills it.
--
-- Fix:
--   Add an AFTER INSERT trigger on organization_members.  Whenever a user
--   is added to an org, their profile's organization_id is set if it is
--   still NULL.  This makes the profile-org link automatic and permanent,
--   covering every path that creates org membership:
--     • Admin invites a new employee (Settings page)
--     • Superadmin registers and org is created
--     • Onboarding flow adds creator to the org
--     • Any future membership-granting code
--
-- Safety:
--   • Only updates profiles where organization_id IS NULL — never overwrites
--     a profile that already has a correct org.
--   • SECURITY DEFINER so the trigger can write profiles regardless of who
--     triggers the organization_members insert.
--   • Runs in the same transaction as the INSERT — if anything fails, both
--     the membership row and the profile update roll back together.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_org_on_member_add()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET    organization_id = NEW.organization_id,
         updated_at      = now()
  WHERE  user_id         = NEW.user_id
    AND  organization_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_org ON public.organization_members;
CREATE TRIGGER trg_sync_profile_org
  AFTER INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_org_on_member_add();

-- Run a catch-up backfill for any memberships added between
-- migration 20260418000002 and this migration.
UPDATE public.profiles p
SET    organization_id = om.organization_id,
       updated_at      = now()
FROM   public.organization_members om
WHERE  om.user_id          = p.user_id
  AND  p.organization_id   IS NULL
  AND  p.user_id           IS NOT NULL;
