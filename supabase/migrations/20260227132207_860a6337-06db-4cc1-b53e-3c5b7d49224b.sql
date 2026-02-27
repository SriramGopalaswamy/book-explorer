
-- Allow finance/admin to delete AI customer profiles (needed for customer cleanup)
CREATE POLICY "Org finance can delete customer profiles"
ON public.ai_customer_profiles FOR DELETE
TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id));
