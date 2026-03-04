-- Fix credit_notes RLS: allow any org finance/admin to update, not just the creator
DROP POLICY IF EXISTS "Org finance can manage credit notes" ON public.credit_notes;

CREATE POLICY "Org finance can manage credit notes"
ON public.credit_notes FOR ALL TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));