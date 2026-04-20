-- =============================================================================
-- FIX: Admin / superadmin profiles have organization_id = NULL
-- =============================================================================
-- Root cause:
--   When an admin or super-admin first registers, handle_new_user creates their
--   profile with only (user_id, full_name, email).  The trg_auto_set_org_profiles
--   trigger fires on INSERT and calls auto_set_organization_id(), which tries to
--   look up organization_members WHERE user_id = NEW.user_id.  At registration
--   time the user hasn't created the org yet, so no row is found and
--   profiles.organization_id stays NULL.
--
--   Later the user creates an org and gets entries in user_roles and
--   organization_members, but profiles.organization_id is NEVER back-filled
--   because auto_set_organization_id only runs on INSERT (not UPDATE).
--
-- Consequences (all caused by useUserOrganization() returning null):
--   • useEmployees()      — hard-guards on orgId → returns []
--   • usePayrollRecords() — hard-guards on orgId → returns []
--   • is_admin_or_hr_in_org() (migration 20260325000006) checks
--     profiles.organization_id = _org_id, so admin-scoped policies also fail
--
-- Fix:
--   1. Back-fill profiles.organization_id from user_roles for any profile
--      whose organization_id is currently NULL and whose owner has a user_roles
--      row with a non-null organization_id.
--   2. For platform super_admins with no user_roles entry, link their profile
--      to the single org in the system (only safe when there is exactly one org).
--   3. Ensure everyone whose profile now has an org is in organization_members.
-- =============================================================================

-- 1. Sync profiles.organization_id from user_roles (covers admin / hr / manager /
--    finance / payroll roles whose profiles were created before org existed).
UPDATE public.profiles p
SET    organization_id = (
         SELECT ur.organization_id
         FROM   public.user_roles ur
         WHERE  ur.user_id         = p.user_id
           AND  ur.organization_id IS NOT NULL
         ORDER BY ur.created_at
         LIMIT  1
       ),
       updated_at      = now()
WHERE  p.organization_id IS NULL
  AND  p.user_id        IS NOT NULL
  AND  EXISTS (
         SELECT 1 FROM public.user_roles ur
         WHERE  ur.user_id         = p.user_id
           AND  ur.organization_id IS NOT NULL
       );

-- 2. For super_admins not covered by user_roles: link them to the single org
--    (only executed when there is exactly one organization in the system so
--    there is no ambiguity about which org to choose).
DO $$
DECLARE
  v_org_id UUID;
  v_org_count INT;
BEGIN
  SELECT COUNT(*) INTO v_org_count FROM public.organizations;

  IF v_org_count = 1 THEN
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    UPDATE public.profiles p
    SET    organization_id = v_org_id,
           updated_at      = now()
    FROM   public.platform_roles pr
    WHERE  pr.user_id        = p.user_id
      AND  pr.role           = 'super_admin'
      AND  p.organization_id IS NULL;
  END IF;
END $$;

-- 3. Ensure every user whose profile is now org-linked is in organization_members
--    (the trigger only fires on payroll_records/profiles INSERT, so memberships
--    created after profile creation are not automatically reflected).
INSERT INTO public.organization_members (user_id, organization_id)
SELECT DISTINCT p.user_id, p.organization_id
FROM   public.profiles p
WHERE  p.organization_id IS NOT NULL
  AND  p.user_id         IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;
