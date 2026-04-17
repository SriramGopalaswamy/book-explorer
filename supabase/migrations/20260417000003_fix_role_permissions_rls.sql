-- Fix RLS policies on role_permissions that were created with the wrong
-- function signatures: is_org_admin(uuid) and is_org_member(uuid) — both
-- functions require two arguments (user_id, org_id). Policies created with
-- the single-argument form would error at runtime with:
--   "function is_org_admin(uuid) does not exist"
-- This migration is a no-op if the table does not exist yet.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'role_permissions'
  ) THEN
    RETURN;
  END IF;

  -- Drop broken policies (safe if they don't exist)
  DROP POLICY IF EXISTS "org_admin_manage_role_permissions" ON public.role_permissions;
  DROP POLICY IF EXISTS "org_members_read_role_permissions"  ON public.role_permissions;
  DROP POLICY IF EXISTS "super_admin_read_role_permissions"  ON public.role_permissions;

  -- Recreate with correct two-argument calls
  EXECUTE $p$
    CREATE POLICY "org_admin_manage_role_permissions"
      ON public.role_permissions FOR ALL
      USING     (is_org_admin(auth.uid(), organization_id))
      WITH CHECK(is_org_admin(auth.uid(), organization_id));

    CREATE POLICY "org_members_read_role_permissions"
      ON public.role_permissions FOR SELECT
      USING (is_org_member(auth.uid(), organization_id));

    CREATE POLICY "super_admin_read_role_permissions"
      ON public.role_permissions FOR SELECT
      USING (is_super_admin(auth.uid()));
  $p$;

  -- Back-fill the seeded default org — the AFTER INSERT trigger only fires for
  -- new orgs, so pre-existing orgs need a one-time manual seed.
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    LIMIT 1
  ) THEN
    PERFORM public.seed_default_role_permissions('00000000-0000-0000-0000-000000000001');
  END IF;

END $$;
