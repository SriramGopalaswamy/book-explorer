-- ======= 20260427070000_fix_payroll_role_rls.sql =======
DROP POLICY IF EXISTS "Org payroll can view payroll runs" ON public.payroll_runs;
CREATE POLICY "Org payroll can view payroll runs"
ON public.payroll_runs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = payroll_runs.organization_id AND ur.role = 'payroll'));

DROP POLICY IF EXISTS "Org payroll can view payroll entries" ON public.payroll_entries;
CREATE POLICY "Org payroll can view payroll entries"
ON public.payroll_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = payroll_entries.organization_id AND ur.role = 'payroll'));

DROP POLICY IF EXISTS "Org payroll can view profiles" ON public.profiles;
CREATE POLICY "Org payroll can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.organization_id = profiles.organization_id AND ur.role = 'payroll'));
