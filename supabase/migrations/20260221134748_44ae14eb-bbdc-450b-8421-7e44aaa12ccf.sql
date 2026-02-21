
-- ============================================================
-- FINAL RLS ARCHITECTURE — SUPER_ADMIN + SESSION-BASED TENANCY
-- ============================================================
-- PART 1: PLATFORM INFRASTRUCTURE
-- ============================================================

-- 1A. Create platform_roles table for super_admin designation
CREATE TABLE IF NOT EXISTS public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

-- Platform roles: users can only see their own record
CREATE POLICY "Users can view own platform role"
  ON public.platform_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Only super_admins can manage platform roles (bootstrap via SQL)
CREATE POLICY "Super admins can manage platform roles"
  ON public.platform_roles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.platform_roles pr
    WHERE pr.user_id = auth.uid() AND pr.role = 'super_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_roles pr
    WHERE pr.user_id = auth.uid() AND pr.role = 'super_admin'
  ));

-- 1B. is_super_admin() helper — SECURITY DEFINER to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

-- 1C. get_current_org() helper — reads session variable
-- Returns NULL if not set, forcing super_admin to explicitly select org
CREATE OR REPLACE FUNCTION public.get_current_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN current_setting('app.current_org', true) IS NULL THEN NULL
    WHEN current_setting('app.current_org', true) = '' THEN NULL
    ELSE current_setting('app.current_org', true)::uuid
  END;
$$;

-- 1D. Canonical org access check:
--   Regular user → must be member of the org
--   Super admin → must have explicitly set app.current_org AND it must match
CREATE OR REPLACE FUNCTION public.check_org_access(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Regular user: must be org member
    is_org_member(_user_id, _org_id)
    OR
    -- Super admin: must have explicitly selected this org
    (is_super_admin(_user_id) AND get_current_org() = _org_id);
$$;

-- ============================================================
-- PART 2: REWRITE ALL RLS POLICIES — CANONICAL ORG-SCOPED
-- ============================================================

-- ============ ORGANIZATIONS ============
DROP POLICY IF EXISTS "Admins can manage organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members can view their organization" ON public.organizations;

-- Org admins can manage their own org
CREATE POLICY "Org admins can manage own organization"
  ON public.organizations FOR ALL
  USING (is_org_admin(auth.uid(), id))
  WITH CHECK (is_org_admin(auth.uid(), id));

-- Members can view their own org
CREATE POLICY "Members can view own organization"
  ON public.organizations FOR SELECT
  USING (is_org_member(auth.uid(), id));

-- Super admin can list all orgs (read-only at org level)
CREATE POLICY "Super admin can view all organizations"
  ON public.organizations FOR SELECT
  USING (is_super_admin(auth.uid()));

-- ============ ORGANIZATION_MEMBERS ============
DROP POLICY IF EXISTS "Admins can manage org members" ON public.organization_members;
DROP POLICY IF EXISTS "Members can view org members" ON public.organization_members;

CREATE POLICY "Org admins can manage members"
  ON public.organization_members FOR ALL
  USING (is_org_admin(auth.uid(), organization_id))
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Members can view org members"
  ON public.organization_members FOR SELECT
  USING (check_org_access(auth.uid(), organization_id));

-- ============ USER_ROLES ============
DROP POLICY IF EXISTS "Org admins can view org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins can insert org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins can update org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins can delete org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Org admins can manage roles"
  ON public.user_roles FOR ALL
  USING (is_org_admin(auth.uid(), organization_id))
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin can manage roles in selected org"
  ON public.user_roles FOR ALL
  USING (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  WITH CHECK (is_super_admin(auth.uid()) AND organization_id = get_current_org());

-- ============ AUDIT_LOGS ============
DROP POLICY IF EXISTS "Org admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can insert audit logs for own org" ON public.audit_logs;

CREATE POLICY "Org admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  );

CREATE POLICY "Users can insert audit logs for own org"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND organization_id = get_user_organization_id(auth.uid())
  );

-- ============ PROFILES ============
DROP POLICY IF EXISTS "Org admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org managers can view direct reports" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Org admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR (is_super_admin(auth.uid()) AND organization_id = get_current_org())
  );

CREATE POLICY "Org admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR (auth.uid() = user_id)
  );

CREATE POLICY "Org admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR (auth.uid() = user_id)
  );

CREATE POLICY "Org admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org managers can view direct reports"
  ON public.profiles FOR SELECT
  USING (
    manager_id = get_current_user_profile_id()
    AND organization_id = get_user_organization_id(auth.uid())
  );

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- ============ ASSETS ============
DROP POLICY IF EXISTS "Finance admin can manage org assets" ON public.assets;
DROP POLICY IF EXISTS "Finance admin can view all org assets" ON public.assets;
DROP POLICY IF EXISTS "Users can create own assets" ON public.assets;
DROP POLICY IF EXISTS "Users can view own assets" ON public.assets;

CREATE POLICY "Org finance can manage assets"
  ON public.assets FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own assets"
  ON public.assets FOR SELECT
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can create own assets"
  ON public.assets FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ ASSET_DEPRECIATION_ENTRIES ============
DROP POLICY IF EXISTS "Org finance can manage depreciation entries" ON public.asset_depreciation_entries;
DROP POLICY IF EXISTS "Users can view own asset depreciation" ON public.asset_depreciation_entries;

CREATE POLICY "Org finance can manage depreciation entries"
  ON public.asset_depreciation_entries FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own asset depreciation"
  ON public.asset_depreciation_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assets a
      WHERE a.id = asset_depreciation_entries.asset_id
        AND a.user_id = auth.uid()
        AND a.organization_id = asset_depreciation_entries.organization_id
    )
  );

-- ============ ATTENDANCE_RECORDS ============
DROP POLICY IF EXISTS "Org admins can delete attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Org admins can insert any attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Org admins can update attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Org admins can view all attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance_records;

CREATE POLICY "Org admins can manage attendance"
  ON public.attendance_records FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org managers can view attendance"
  ON public.attendance_records FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can insert own attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can view own attendance"
  ON public.attendance_records FOR SELECT
  USING (auth.uid() = user_id);

-- ============ ATTENDANCE_CORRECTION_REQUESTS ============
DROP POLICY IF EXISTS "Org managers can update correction requests" ON public.attendance_correction_requests;
DROP POLICY IF EXISTS "Org managers can view all correction requests" ON public.attendance_correction_requests;
DROP POLICY IF EXISTS "Users can create own correction requests" ON public.attendance_correction_requests;
DROP POLICY IF EXISTS "Users can view own correction requests" ON public.attendance_correction_requests;

CREATE POLICY "Org managers can manage correction requests"
  ON public.attendance_correction_requests FOR ALL
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can create own correction requests"
  ON public.attendance_correction_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can view own correction requests"
  ON public.attendance_correction_requests FOR SELECT
  USING (auth.uid() = user_id);

-- ============ BANK_ACCOUNTS ============
DROP POLICY IF EXISTS "Finance admin can manage org bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Finance admin can view all org bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can create their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can delete their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can update their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can view their own bank accounts" ON public.bank_accounts;

CREATE POLICY "Org finance can manage bank accounts"
  ON public.bank_accounts FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own bank accounts"
  ON public.bank_accounts FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ BANK_TRANSACTIONS ============
DROP POLICY IF EXISTS "Finance admin can manage org bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Finance admin can view all org bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.bank_transactions;

CREATE POLICY "Org finance can manage bank transactions"
  ON public.bank_transactions FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own bank transactions"
  ON public.bank_transactions FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ BILLS ============
DROP POLICY IF EXISTS "Org finance can manage bills" ON public.bills;
DROP POLICY IF EXISTS "Users can view bills" ON public.bills;

CREATE POLICY "Org finance can manage bills"
  ON public.bills FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own bills"
  ON public.bills FOR SELECT
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ BILL_ITEMS ============
DROP POLICY IF EXISTS "Org finance can manage bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Users can manage own bill items" ON public.bill_items;

CREATE POLICY "Org finance can manage bill items"
  ON public.bill_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_items.bill_id
      AND is_org_admin_or_finance(auth.uid(), b.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_items.bill_id
      AND is_org_admin_or_finance(auth.uid(), b.organization_id)
  ));

CREATE POLICY "Users can manage own bill items"
  ON public.bill_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_items.bill_id AND b.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_items.bill_id AND b.user_id = auth.uid()
  ));

-- ============ BULK_UPLOAD_HISTORY ============
DROP POLICY IF EXISTS "Org admins can insert upload history" ON public.bulk_upload_history;
DROP POLICY IF EXISTS "Org admins can view all upload history" ON public.bulk_upload_history;
DROP POLICY IF EXISTS "Users can view own upload history" ON public.bulk_upload_history;

CREATE POLICY "Org admins can manage upload history"
  ON public.bulk_upload_history FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Users can view own upload history"
  ON public.bulk_upload_history FOR SELECT
  USING (auth.uid() = uploaded_by);

-- ============ CHART_OF_ACCOUNTS ============
DROP POLICY IF EXISTS "Finance admin can manage org chart of accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Finance admin can view all org chart of accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Users can create own accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Users can view own accounts" ON public.chart_of_accounts;

CREATE POLICY "Org finance can manage chart of accounts"
  ON public.chart_of_accounts FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own accounts"
  ON public.chart_of_accounts FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ CREDIT_CARDS ============
DROP POLICY IF EXISTS "Finance admin can view all org credit cards" ON public.credit_cards;
DROP POLICY IF EXISTS "Users can manage own credit cards" ON public.credit_cards;

CREATE POLICY "Org finance can view credit cards"
  ON public.credit_cards FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own credit cards"
  ON public.credit_cards FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ CREDIT_CARD_TRANSACTIONS ============
DROP POLICY IF EXISTS "Finance admin can view all org cc transactions" ON public.credit_card_transactions;
DROP POLICY IF EXISTS "Users can manage own credit card transactions" ON public.credit_card_transactions;

CREATE POLICY "Org finance can view cc transactions"
  ON public.credit_card_transactions FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own cc transactions"
  ON public.credit_card_transactions FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ CREDIT_NOTES ============
DROP POLICY IF EXISTS "Org finance can delete credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Org finance can insert credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Org finance can update credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Users can view credit notes" ON public.credit_notes;

CREATE POLICY "Org finance can manage credit notes"
  ON public.credit_notes FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Users can view own credit notes"
  ON public.credit_notes FOR SELECT
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ CUSTOMERS ============
DROP POLICY IF EXISTS "Org finance can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view customers" ON public.customers;

CREATE POLICY "Org finance can manage customers"
  ON public.customers FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own customers"
  ON public.customers FOR SELECT
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ EXPENSES ============
DROP POLICY IF EXISTS "Finance admin can view all org expenses" ON public.expenses;
DROP POLICY IF EXISTS "Org finance can manage all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view own expenses" ON public.expenses;

CREATE POLICY "Org finance can manage expenses"
  ON public.expenses FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can create own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can view own expenses"
  ON public.expenses FOR SELECT
  USING (auth.uid() = user_id);

-- ============ FINANCIAL_RECORDS ============
DROP POLICY IF EXISTS "Finance admin can manage org financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Finance admin can view all org financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Users can create their own financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Users can delete their own financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Users can update their own financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Users can view their own financial records" ON public.financial_records;

CREATE POLICY "Org finance can manage financial records"
  ON public.financial_records FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own financial records"
  ON public.financial_records FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ GOAL_PLANS ============
DROP POLICY IF EXISTS "Org managers can update direct reports goal plans" ON public.goal_plans;
DROP POLICY IF EXISTS "Org managers can view all goal plans" ON public.goal_plans;
DROP POLICY IF EXISTS "Users can create own goal plans" ON public.goal_plans;
DROP POLICY IF EXISTS "Users can delete own draft goal plans" ON public.goal_plans;
DROP POLICY IF EXISTS "Users can update own goal plans" ON public.goal_plans;
DROP POLICY IF EXISTS "Users can view own goal plans" ON public.goal_plans;

CREATE POLICY "Org managers can view goal plans"
  ON public.goal_plans FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org managers can update goal plans"
  ON public.goal_plans FOR UPDATE
  USING (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = goal_plans.profile_id AND p.manager_id = get_current_user_profile_id())
      AND organization_id = get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can create own goal plans"
  ON public.goal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete own draft goal plans"
  ON public.goal_plans FOR DELETE
  USING (auth.uid() = user_id AND status = 'draft');

CREATE POLICY "Users can update own goal plans"
  ON public.goal_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own goal plans"
  ON public.goal_plans FOR SELECT
  USING (auth.uid() = user_id);

-- ============ GOALS ============
DROP POLICY IF EXISTS "Org managers can view all goals" ON public.goals;
DROP POLICY IF EXISTS "Users can create own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view own goals" ON public.goals;

CREATE POLICY "Org managers can view goals"
  ON public.goals FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can create own goals"
  ON public.goals FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can manage own goals"
  ON public.goals FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ HOLIDAYS ============
DROP POLICY IF EXISTS "Org admins can manage holidays" ON public.holidays;
DROP POLICY IF EXISTS "Org members can view holidays" ON public.holidays;

CREATE POLICY "Org admins can manage holidays"
  ON public.holidays FOR ALL
  USING (is_org_admin(auth.uid(), organization_id))
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org members can view holidays"
  ON public.holidays FOR SELECT
  USING (check_org_access(auth.uid(), organization_id));

-- ============ INVOICES ============
DROP POLICY IF EXISTS "Users can create their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view their own invoices" ON public.invoices;

CREATE POLICY "Org finance can manage invoices"
  ON public.invoices FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own invoices"
  ON public.invoices FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ INVOICE_ITEMS ============
DROP POLICY IF EXISTS "Org finance can manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can create their invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can delete their invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can update their invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can view their invoice items" ON public.invoice_items;

CREATE POLICY "Org finance can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
      AND is_org_admin_or_finance(auth.uid(), i.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
      AND is_org_admin_or_finance(auth.uid(), i.organization_id)
  ));

CREATE POLICY "Users can manage own invoice items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id AND i.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id AND i.user_id = auth.uid()
  ));

-- ============ INVOICE_SETTINGS ============
DROP POLICY IF EXISTS "Org finance can delete invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Org finance can insert invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Org finance can update invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Org finance can view invoice settings" ON public.invoice_settings;

CREATE POLICY "Org finance can manage invoice settings"
  ON public.invoice_settings FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id)
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Org finance can view all invoice settings"
  ON public.invoice_settings FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

-- ============ LEAVE_BALANCES ============
DROP POLICY IF EXISTS "Org admins can insert leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Org admins can update leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Org managers can view all leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Users can view own leave balances" ON public.leave_balances;

CREATE POLICY "Org admins can manage leave balances"
  ON public.leave_balances FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org managers can view leave balances"
  ON public.leave_balances FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can view own leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() = user_id);

-- ============ LEAVE_REQUESTS ============
DROP POLICY IF EXISTS "Org managers can update leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Org managers can view all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can delete own pending leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can view own leave requests" ON public.leave_requests;

CREATE POLICY "Org managers can manage leave requests"
  ON public.leave_requests FOR ALL
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can create own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete own pending leave requests"
  ON public.leave_requests FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Users can view own leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = user_id);

-- ============ MEMOS ============
DROP POLICY IF EXISTS "Org admins can manage all memos" ON public.memos;
DROP POLICY IF EXISTS "Org members can view published memos" ON public.memos;
DROP POLICY IF EXISTS "Users can create own memos" ON public.memos;
DROP POLICY IF EXISTS "Users can delete own memos" ON public.memos;
DROP POLICY IF EXISTS "Users can update own memos" ON public.memos;
DROP POLICY IF EXISTS "Users can view own memos" ON public.memos;

CREATE POLICY "Org admins can manage memos"
  ON public.memos FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org members can view published memos"
  ON public.memos FOR SELECT
  USING (status = 'published' AND check_org_access(auth.uid(), organization_id));

CREATE POLICY "Users can manage own memos"
  ON public.memos FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ NOTIFICATIONS ============
DROP POLICY IF EXISTS "Users and org admins can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

CREATE POLICY "Org admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can manage own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ PAYROLL_RECORDS ============
DROP POLICY IF EXISTS "Finance can view all org payroll" ON public.payroll_records;
DROP POLICY IF EXISTS "Org admins can manage all payroll" ON public.payroll_records;
DROP POLICY IF EXISTS "Org managers can view payroll" ON public.payroll_records;
DROP POLICY IF EXISTS "Users can view own payroll" ON public.payroll_records;

CREATE POLICY "Org admins can manage payroll"
  ON public.payroll_records FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org finance can view payroll"
  ON public.payroll_records FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org managers can view payroll"
  ON public.payroll_records FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can view own payroll"
  ON public.payroll_records FOR SELECT
  USING (auth.uid() = user_id);

-- ============ QUOTES ============
DROP POLICY IF EXISTS "Users can create own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can update own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can view own quotes" ON public.quotes;

CREATE POLICY "Org finance can manage quotes"
  ON public.quotes FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own quotes"
  ON public.quotes FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ QUOTE_ITEMS ============
DROP POLICY IF EXISTS "Org finance can manage quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Users can manage their quote items" ON public.quote_items;

CREATE POLICY "Org finance can manage quote items"
  ON public.quote_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_items.quote_id
      AND is_org_admin_or_finance(auth.uid(), q.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_items.quote_id
      AND is_org_admin_or_finance(auth.uid(), q.organization_id)
  ));

CREATE POLICY "Users can manage own quote items"
  ON public.quote_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid()
  ));

-- ============ REIMBURSEMENT_REQUESTS ============
DROP POLICY IF EXISTS "Org finance can update reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Org finance can view all reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Org managers can update reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Org managers can view all reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Users can create own reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Users can view own reimbursements" ON public.reimbursement_requests;

CREATE POLICY "Org finance can manage reimbursements"
  ON public.reimbursement_requests FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org managers can manage reimbursements"
  ON public.reimbursement_requests FOR ALL
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Users can create own reimbursements"
  ON public.reimbursement_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can view own reimbursements"
  ON public.reimbursement_requests FOR SELECT
  USING (auth.uid() = user_id);

-- ============ SCHEDULED_PAYMENTS ============
DROP POLICY IF EXISTS "Finance admin can manage org scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Finance admin can view all org scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can create their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can delete their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can update their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can view their own scheduled payments" ON public.scheduled_payments;

CREATE POLICY "Org finance can manage scheduled payments"
  ON public.scheduled_payments FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can manage own scheduled payments"
  ON public.scheduled_payments FOR ALL
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ VENDOR_CREDITS ============
DROP POLICY IF EXISTS "Org finance can manage vendor credits" ON public.vendor_credits;
DROP POLICY IF EXISTS "Users can view vendor credits" ON public.vendor_credits;

CREATE POLICY "Org finance can manage vendor credits"
  ON public.vendor_credits FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own vendor credits"
  ON public.vendor_credits FOR SELECT
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ VENDORS ============
DROP POLICY IF EXISTS "Org finance can manage vendors" ON public.vendors;
DROP POLICY IF EXISTS "Users can view vendors" ON public.vendors;

CREATE POLICY "Org finance can manage vendors"
  ON public.vendors FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own vendors"
  ON public.vendors FOR SELECT
  USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));

-- ============ INDEX on platform_roles ============
CREATE INDEX IF NOT EXISTS idx_platform_roles_user ON public.platform_roles(user_id);
