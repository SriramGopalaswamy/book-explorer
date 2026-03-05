-- Allow admin/finance users to SELECT all org bills (needed for status updates to work)
CREATE POLICY "Org finance can view all bills"
ON public.bills
FOR SELECT
TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id));