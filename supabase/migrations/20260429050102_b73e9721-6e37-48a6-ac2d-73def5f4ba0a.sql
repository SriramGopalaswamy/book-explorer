DROP POLICY IF EXISTS "Org managers can view direct reports" ON public.profiles;
CREATE POLICY "Org managers can view direct reports" ON public.profiles FOR SELECT
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (
      manager_id = get_current_user_profile_id()
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = public.profiles.organization_id AND ur.role = 'manager')
    )
  );

DROP POLICY IF EXISTS "Managers can view direct reports attendance" ON public.attendance_records;
CREATE POLICY "Managers can view direct reports attendance" ON public.attendance_records FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (
      profile_id IN (SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id())
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = attendance_records.organization_id AND ur.role = 'manager')
    )
  );

DROP POLICY IF EXISTS "Managers can view direct reports attendance daily" ON public.attendance_daily;
CREATE POLICY "Managers can view direct reports attendance daily" ON public.attendance_daily FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (
      profile_id IN (SELECT id FROM public.profiles WHERE manager_id = get_current_user_profile_id())
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = attendance_daily.organization_id AND ur.role = 'manager')
    )
  );