
-- Fix: Allow service role inserts by adding permissive policies for backend writes
-- The service role key bypasses RLS by default, but we need to ensure
-- the existing RESTRICTIVE policies don't block it.
-- Solution: Change the super admin policies from RESTRICTIVE to PERMISSIVE

-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Service role can manage snapshots" ON public.ai_financial_snapshots;
DROP POLICY IF EXISTS "Service role can manage customer profiles" ON public.ai_customer_profiles;
DROP POLICY IF EXISTS "Service role can manage vendor profiles" ON public.ai_vendor_profiles;
DROP POLICY IF EXISTS "Service role can manage alerts" ON public.ai_alerts;
DROP POLICY IF EXISTS "Service role can manage risk scores" ON public.ai_risk_scores;

-- Also drop the SELECT policies that are restrictive
DROP POLICY IF EXISTS "Org finance can view snapshots" ON public.ai_financial_snapshots;
DROP POLICY IF EXISTS "Org finance can view customer profiles" ON public.ai_customer_profiles;
DROP POLICY IF EXISTS "Org finance can view vendor profiles" ON public.ai_vendor_profiles;
DROP POLICY IF EXISTS "Org finance can view alerts" ON public.ai_alerts;
DROP POLICY IF EXISTS "Org finance can resolve alerts" ON public.ai_alerts;
DROP POLICY IF EXISTS "Org finance can view risk scores" ON public.ai_risk_scores;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Org finance can view snapshots"
  ON public.ai_financial_snapshots FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can view customer profiles"
  ON public.ai_customer_profiles FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can view vendor profiles"
  ON public.ai_vendor_profiles FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can view alerts"
  ON public.ai_alerts FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can resolve alerts"
  ON public.ai_alerts FOR UPDATE
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can view risk scores"
  ON public.ai_risk_scores FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- Backend write policies: allow any authenticated user with super_admin OR allow service role
-- Service role bypasses RLS, so these are mainly for super admins via the UI
CREATE POLICY "Super admin can manage snapshots"
  ON public.ai_financial_snapshots FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage customer profiles"
  ON public.ai_customer_profiles FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage vendor profiles"
  ON public.ai_vendor_profiles FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage alerts"
  ON public.ai_alerts FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage risk scores"
  ON public.ai_risk_scores FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
