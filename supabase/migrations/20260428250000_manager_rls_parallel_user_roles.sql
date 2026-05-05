-- Item 39: Add parallel user_roles.role='manager' check to RLS policies
-- that currently rely solely on profiles.manager_id.
--
-- The profiles.manager_id check (hierarchical direct-report check) is KEPT.
-- We add an OR branch so that any user with user_roles.role='manager' in the
-- org also passes — matching the behaviour of is_org_admin_hr_or_manager().
--
-- This does NOT remove the manager_id check; it broadens access to org-level
-- managers who may not have a direct-report relationship recorded.

-- ─── profiles: "Org managers can view direct reports" ────────────────────────

DROP POLICY IF EXISTS "Org managers can view direct reports" ON public.profiles;
CREATE POLICY "Org managers can view direct reports"
  ON public.profiles FOR SELECT
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (
      -- original: profile.manager_id points to the current user's profile
      manager_id = get_current_user_profile_id()
      OR
      -- parallel: caller has the 'manager' role in the org
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.organization_id = public.profiles.organization_id
          AND ur.role = 'manager'
      )
    )
  );

-- ─── attendance_records: manager view of direct reports ─────────────────────
-- The latest policy is created in 20260303070535. We recreate it here with
-- the parallel check.

DROP POLICY IF EXISTS "Managers can view direct reports attendance" ON public.attendance_records;
CREATE POLICY "Managers can view direct reports attendance"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (
      profile_id IN (
        SELECT id FROM public.profiles
        WHERE manager_id = get_current_user_profile_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.organization_id = attendance_records.organization_id
          AND ur.role = 'manager'
      )
    )
  );

-- ─── attendance_daily: manager view of direct reports ───────────────────────

DROP POLICY IF EXISTS "Managers can view direct reports attendance daily" ON public.attendance_daily;
CREATE POLICY "Managers can view direct reports attendance daily"
  ON public.attendance_daily FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (
      profile_id IN (
        SELECT id FROM public.profiles
        WHERE manager_id = get_current_user_profile_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.organization_id = attendance_daily.organization_id
          AND ur.role = 'manager'
      )
    )
  );
