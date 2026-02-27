-- Drop and recreate the SELECT policy to include managers (via manager_id relationship)
DROP POLICY IF EXISTS "employees_view_own_disputes" ON public.payslip_disputes;

CREATE POLICY "employees_view_own_disputes" ON public.payslip_disputes
FOR SELECT USING (
  -- Employee sees own disputes
  profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  -- Manager sees direct reports' disputes
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = payslip_disputes.profile_id
      AND p.manager_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  )
  -- Admin/HR/Finance see all org disputes
  OR is_org_admin_or_hr(auth.uid(), organization_id)
  OR is_org_admin_or_finance(auth.uid(), organization_id)
);