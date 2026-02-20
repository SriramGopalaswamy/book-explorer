
-- ============================================================
-- STAGE 6: RLS HARDENING
-- Purpose: Org-scoped RLS, Finance payroll access, admin overrides,
--          notification restrictions, manager scoping
-- ============================================================

-- ==========================================
-- 6A: FINANCIAL TABLES — ORG-SCOPED RLS
-- ==========================================

-- Helper: check if user is admin or finance within same org
CREATE OR REPLACE FUNCTION public.is_org_admin_or_finance(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'finance')
      AND om.organization_id = _org_id
  );
$$;

-- Helper: check if user is admin/hr within org
CREATE OR REPLACE FUNCTION public.is_org_admin_or_hr(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'hr')
      AND om.organization_id = _org_id
  );
$$;

-- ---- BANK ACCOUNTS: Add org-scoped admin/finance access ----
CREATE POLICY "Finance admin can view all org bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Finance admin can manage org bank accounts"
  ON public.bank_accounts FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- BANK TRANSACTIONS: Add org-scoped access ----
CREATE POLICY "Finance admin can view all org bank transactions"
  ON public.bank_transactions FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Finance admin can manage org bank transactions"
  ON public.bank_transactions FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- FINANCIAL RECORDS: Add org-scoped access ----
CREATE POLICY "Finance admin can view all org financial records"
  ON public.financial_records FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Finance admin can manage org financial records"
  ON public.financial_records FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- CHART OF ACCOUNTS: Add org-scoped access ----
CREATE POLICY "Finance admin can view all org chart of accounts"
  ON public.chart_of_accounts FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Finance admin can manage org chart of accounts"
  ON public.chart_of_accounts FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- CREDIT CARDS: Add org-scoped access ----
CREATE POLICY "Finance admin can view all org credit cards"
  ON public.credit_cards FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- CREDIT CARD TRANSACTIONS: Add org-scoped access ----
CREATE POLICY "Finance admin can view all org cc transactions"
  ON public.credit_card_transactions FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- EXPENSES: Finance/admin org-scoped access already exists via is_admin_or_finance ----
-- Add explicit org-scoped version
CREATE POLICY "Finance admin can view all org expenses"
  ON public.expenses FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- ---- SCHEDULED PAYMENTS: Add org-scoped access ----
CREATE POLICY "Finance admin can view all org scheduled payments"
  ON public.scheduled_payments FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Finance admin can manage org scheduled payments"
  ON public.scheduled_payments FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- ==========================================
-- 6B: FINANCE ROLE → PAYROLL ACCESS
-- ==========================================

CREATE POLICY "Finance can view all org payroll"
  ON public.payroll_records FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- ==========================================
-- 6C: NOTIFICATIONS INSERT RESTRICTION
-- ==========================================

-- Replace the overly permissive INSERT policy
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

CREATE POLICY "System and admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    -- Users can create notifications for themselves
    auth.uid() = user_id
    -- Or admin/HR can create for anyone in their org
    OR is_admin_or_hr(auth.uid())
  );

-- ==========================================
-- 6D: MANAGER GOAL UPDATE → DIRECT REPORTS ONLY
-- ==========================================

-- Replace overly broad manager goal plan access
DROP POLICY IF EXISTS "Managers HR Admin can update goal plans" ON public.goal_plans;

CREATE POLICY "Managers can update direct reports goal plans"
  ON public.goal_plans FOR UPDATE
  USING (
    -- Admin/HR can update any
    is_admin_or_hr(auth.uid())
    -- Managers can only update direct reports
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = goal_plans.profile_id
        AND p.manager_id = get_current_user_profile_id()
    )
  );

-- ==========================================
-- 6E: ORGANIZATION RLS ON NEW TABLES
-- ==========================================

-- Organizations: admin can manage
CREATE POLICY "Admins can manage organizations"
  ON public.organizations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.user_roles ur ON ur.user_id = om.user_id
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Organization members: admin can manage
CREATE POLICY "Admins can manage org members"
  ON public.organization_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
    AND is_org_member(auth.uid(), organization_id)
  );
