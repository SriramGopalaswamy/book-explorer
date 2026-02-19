
-- Fix: The "Finance and admin can manage customers" ALL policy is missing a WITH CHECK expression,
-- causing INSERT to fail for finance/admin users.
-- Drop and recreate with proper WITH CHECK.

DROP POLICY IF EXISTS "Finance and admin can manage customers" ON public.customers;

CREATE POLICY "Finance and admin can manage customers"
  ON public.customers
  FOR ALL
  USING (is_admin_or_finance(auth.uid()))
  WITH CHECK (is_admin_or_finance(auth.uid()));
