
-- Allow finance users to update financial records in their org
CREATE POLICY "financial_records_update_finance"
ON public.financial_records
FOR UPDATE
TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- Allow finance users to delete financial records in their org
CREATE POLICY "financial_records_delete_finance"
ON public.financial_records
FOR DELETE
TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id));
