
-- Allow Finance role to UPDATE payroll records (not just SELECT)
CREATE POLICY "Org finance can update payroll"
  ON public.payroll_records
  FOR UPDATE
  TO authenticated
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));
