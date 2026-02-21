
-- ================================================================
-- GRX10 MULTI-TENANCY HARDENING MIGRATION
-- Phases 1-6: Schema, Triggers, FKs, NOT NULL, RLS, Indexes
-- ================================================================

-- ============================================
-- PHASE 0: Helper Functions
-- ============================================

-- Org-scoped admin/hr/manager check (currently missing)
CREATE OR REPLACE FUNCTION public.is_org_admin_hr_or_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'hr', 'manager')
      AND om.organization_id = _org_id
  );
$$;

-- Org-scoped admin-only check
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'
      AND om.organization_id = _org_id
  );
$$;

-- Trigger variant for audit_logs (uses actor_id)
CREATE OR REPLACE FUNCTION public.auto_set_org_from_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.actor_id IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(NEW.actor_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger variant for bulk_upload_history (uses uploaded_by)
CREATE OR REPLACE FUNCTION public.auto_set_org_from_uploader()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.uploaded_by IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(NEW.uploaded_by);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger variant for asset_depreciation_entries (uses asset_id)
CREATE OR REPLACE FUNCTION public.auto_set_org_from_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.asset_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.assets WHERE id = NEW.asset_id;
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================
-- PHASE 1: Add organization_id to asset_depreciation_entries
-- ============================================

ALTER TABLE public.asset_depreciation_entries
  ADD COLUMN organization_id uuid NULL;

-- Backfill from parent assets table
UPDATE public.asset_depreciation_entries ade
SET organization_id = a.organization_id
FROM public.assets a
WHERE ade.asset_id = a.id
  AND ade.organization_id IS NULL;


-- ============================================
-- PHASE 2: Bind auto_set_organization_id triggers
-- ============================================

-- Tables with user_id column
CREATE TRIGGER trg_auto_set_org_assets BEFORE INSERT ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_attendance_correction BEFORE INSERT ON public.attendance_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_attendance_records BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_bank_accounts BEFORE INSERT ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_bank_transactions BEFORE INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_bills BEFORE INSERT ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_chart_of_accounts BEFORE INSERT ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_cc_transactions BEFORE INSERT ON public.credit_card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_credit_cards BEFORE INSERT ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_credit_notes BEFORE INSERT ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_customers BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_expenses BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_financial_records BEFORE INSERT ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_goal_plans BEFORE INSERT ON public.goal_plans
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_goals BEFORE INSERT ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_invoice_settings BEFORE INSERT ON public.invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_invoices BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_leave_balances BEFORE INSERT ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_leave_requests BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_memos BEFORE INSERT ON public.memos
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_notifications BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_payroll BEFORE INSERT ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_profiles BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_quotes BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_reimbursements BEFORE INSERT ON public.reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_scheduled_payments BEFORE INSERT ON public.scheduled_payments
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_vendor_credits BEFORE INSERT ON public.vendor_credits
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_auto_set_org_vendors BEFORE INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- Variant triggers for non-standard tables
CREATE TRIGGER trg_auto_set_org_audit_logs BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_from_actor();

CREATE TRIGGER trg_auto_set_org_bulk_upload BEFORE INSERT ON public.bulk_upload_history
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_from_uploader();

CREATE TRIGGER trg_auto_set_org_depreciation BEFORE INSERT ON public.asset_depreciation_entries
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_from_asset();


-- ============================================
-- PHASE 3: Add FOREIGN KEY constraints (NOT VALID, then VALIDATE)
-- ============================================

ALTER TABLE public.asset_depreciation_entries ADD CONSTRAINT fk_ade_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.assets ADD CONSTRAINT fk_assets_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.attendance_correction_requests ADD CONSTRAINT fk_acr_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.attendance_records ADD CONSTRAINT fk_attendance_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.audit_logs ADD CONSTRAINT fk_audit_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.bank_accounts ADD CONSTRAINT fk_bank_acct_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.bank_transactions ADD CONSTRAINT fk_bank_txn_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.bills ADD CONSTRAINT fk_bills_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.bulk_upload_history ADD CONSTRAINT fk_bulk_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.chart_of_accounts ADD CONSTRAINT fk_coa_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.credit_card_transactions ADD CONSTRAINT fk_cc_txn_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.credit_cards ADD CONSTRAINT fk_cc_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.credit_notes ADD CONSTRAINT fk_cn_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.customers ADD CONSTRAINT fk_customers_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.expenses ADD CONSTRAINT fk_expenses_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.financial_records ADD CONSTRAINT fk_fr_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.goal_plans ADD CONSTRAINT fk_gp_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.goals ADD CONSTRAINT fk_goals_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.holidays ADD CONSTRAINT fk_holidays_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.invoice_settings ADD CONSTRAINT fk_inv_settings_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.leave_balances ADD CONSTRAINT fk_lb_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.leave_requests ADD CONSTRAINT fk_lr_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.memos ADD CONSTRAINT fk_memos_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.notifications ADD CONSTRAINT fk_notif_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.payroll_records ADD CONSTRAINT fk_payroll_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.quotes ADD CONSTRAINT fk_quotes_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.reimbursement_requests ADD CONSTRAINT fk_reimb_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.scheduled_payments ADD CONSTRAINT fk_sched_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.vendor_credits ADD CONSTRAINT fk_vc_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
ALTER TABLE public.vendors ADD CONSTRAINT fk_vendors_org
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;

-- Now validate all FK constraints
ALTER TABLE public.asset_depreciation_entries VALIDATE CONSTRAINT fk_ade_org;
ALTER TABLE public.assets VALIDATE CONSTRAINT fk_assets_org;
ALTER TABLE public.attendance_correction_requests VALIDATE CONSTRAINT fk_acr_org;
ALTER TABLE public.attendance_records VALIDATE CONSTRAINT fk_attendance_org;
ALTER TABLE public.audit_logs VALIDATE CONSTRAINT fk_audit_org;
ALTER TABLE public.bank_accounts VALIDATE CONSTRAINT fk_bank_acct_org;
ALTER TABLE public.bank_transactions VALIDATE CONSTRAINT fk_bank_txn_org;
ALTER TABLE public.bills VALIDATE CONSTRAINT fk_bills_org;
ALTER TABLE public.bulk_upload_history VALIDATE CONSTRAINT fk_bulk_org;
ALTER TABLE public.chart_of_accounts VALIDATE CONSTRAINT fk_coa_org;
ALTER TABLE public.credit_card_transactions VALIDATE CONSTRAINT fk_cc_txn_org;
ALTER TABLE public.credit_cards VALIDATE CONSTRAINT fk_cc_org;
ALTER TABLE public.credit_notes VALIDATE CONSTRAINT fk_cn_org;
ALTER TABLE public.customers VALIDATE CONSTRAINT fk_customers_org;
ALTER TABLE public.expenses VALIDATE CONSTRAINT fk_expenses_org;
ALTER TABLE public.financial_records VALIDATE CONSTRAINT fk_fr_org;
ALTER TABLE public.goal_plans VALIDATE CONSTRAINT fk_gp_org;
ALTER TABLE public.goals VALIDATE CONSTRAINT fk_goals_org;
ALTER TABLE public.holidays VALIDATE CONSTRAINT fk_holidays_org;
ALTER TABLE public.invoice_settings VALIDATE CONSTRAINT fk_inv_settings_org;
ALTER TABLE public.invoices VALIDATE CONSTRAINT fk_invoices_org;
ALTER TABLE public.leave_balances VALIDATE CONSTRAINT fk_lb_org;
ALTER TABLE public.leave_requests VALIDATE CONSTRAINT fk_lr_org;
ALTER TABLE public.memos VALIDATE CONSTRAINT fk_memos_org;
ALTER TABLE public.notifications VALIDATE CONSTRAINT fk_notif_org;
ALTER TABLE public.payroll_records VALIDATE CONSTRAINT fk_payroll_org;
ALTER TABLE public.profiles VALIDATE CONSTRAINT fk_profiles_org;
ALTER TABLE public.quotes VALIDATE CONSTRAINT fk_quotes_org;
ALTER TABLE public.reimbursement_requests VALIDATE CONSTRAINT fk_reimb_org;
ALTER TABLE public.scheduled_payments VALIDATE CONSTRAINT fk_sched_org;
ALTER TABLE public.vendor_credits VALIDATE CONSTRAINT fk_vc_org;
ALTER TABLE public.vendors VALIDATE CONSTRAINT fk_vendors_org;


-- ============================================
-- PHASE 4: Set NOT NULL constraints (safe order — leaf tables first)
-- ============================================

ALTER TABLE public.asset_depreciation_entries ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.assets ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.attendance_correction_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.attendance_records ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.bank_accounts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.bank_transactions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.bills ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.bulk_upload_history ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.chart_of_accounts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.credit_card_transactions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.credit_cards ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.credit_notes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.expenses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.financial_records ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.goal_plans ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.goals ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.holidays ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.invoice_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.leave_balances ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.leave_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.memos ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.payroll_records ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.quotes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.reimbursement_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.scheduled_payments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.vendor_credits ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN organization_id SET NOT NULL;


-- ============================================
-- PHASE 5: Rewrite RLS policies — org-scoped
-- ============================================

-- ---- attendance_correction_requests ----
DROP POLICY IF EXISTS "Managers HR Admins can update correction requests" ON public.attendance_correction_requests;
DROP POLICY IF EXISTS "Managers HR Admins can view all correction requests" ON public.attendance_correction_requests;

CREATE POLICY "Org managers can update correction requests"
  ON public.attendance_correction_requests FOR UPDATE
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org managers can view all correction requests"
  ON public.attendance_correction_requests FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));


-- ---- attendance_records ----
DROP POLICY IF EXISTS "Admins HR and Managers can view all attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can delete attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can insert any attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins and HR can update attendance" ON public.attendance_records;

CREATE POLICY "Org admins can view all attendance"
  ON public.attendance_records FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org admins can delete attendance"
  ON public.attendance_records FOR DELETE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can insert any attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can update attendance"
  ON public.attendance_records FOR UPDATE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));


-- ---- audit_logs ----
DROP POLICY IF EXISTS "Admins and HR can view audit logs" ON public.audit_logs;

CREATE POLICY "Org admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (is_org_admin_or_hr(auth.uid(), organization_id));


-- ---- bills ----
DROP POLICY IF EXISTS "Finance and admin can manage bills" ON public.bills;

CREATE POLICY "Org finance can manage bills"
  ON public.bills FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));


-- ---- bill_items (add org-scoped admin policy via JOIN) ----
DROP POLICY IF EXISTS "Users can manage bill items" ON public.bill_items;

CREATE POLICY "Users can manage own bill items"
  ON public.bill_items FOR ALL
  USING (EXISTS (SELECT 1 FROM bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid()));

CREATE POLICY "Org finance can manage bill items"
  ON public.bill_items FOR ALL
  USING (EXISTS (SELECT 1 FROM bills WHERE bills.id = bill_items.bill_id AND is_org_admin_or_finance(auth.uid(), bills.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM bills WHERE bills.id = bill_items.bill_id AND is_org_admin_or_finance(auth.uid(), bills.organization_id)));


-- ---- bulk_upload_history ----
DROP POLICY IF EXISTS "Admins and HR can insert upload history" ON public.bulk_upload_history;
DROP POLICY IF EXISTS "Admins and HR can view all upload history" ON public.bulk_upload_history;

CREATE POLICY "Org admins can insert upload history"
  ON public.bulk_upload_history FOR INSERT
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can view all upload history"
  ON public.bulk_upload_history FOR SELECT
  USING (is_org_admin_or_hr(auth.uid(), organization_id));


-- ---- credit_notes ----
DROP POLICY IF EXISTS "Finance and admin can delete credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Finance and admin can insert credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Finance and admin can update credit notes" ON public.credit_notes;

CREATE POLICY "Org finance can delete credit notes"
  ON public.credit_notes FOR DELETE
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can insert credit notes"
  ON public.credit_notes FOR INSERT
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Org finance can update credit notes"
  ON public.credit_notes FOR UPDATE
  USING (is_org_admin_or_finance(auth.uid(), organization_id));


-- ---- customers ----
DROP POLICY IF EXISTS "Finance and admin can manage customers" ON public.customers;

CREATE POLICY "Org finance can manage customers"
  ON public.customers FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));


-- ---- expenses (fix global admin policy) ----
DROP POLICY IF EXISTS "Finance and admin can manage all expenses" ON public.expenses;

CREATE POLICY "Org finance can manage all expenses"
  ON public.expenses FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));


-- ---- goal_plans ----
DROP POLICY IF EXISTS "Managers HR Admin can view all goal plans" ON public.goal_plans;
DROP POLICY IF EXISTS "Managers can update direct reports goal plans" ON public.goal_plans;

CREATE POLICY "Org managers can view all goal plans"
  ON public.goal_plans FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org managers can update direct reports goal plans"
  ON public.goal_plans FOR UPDATE
  USING (
    is_org_admin_or_hr(auth.uid(), organization_id)
    OR (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = goal_plans.profile_id AND p.manager_id = get_current_user_profile_id())
      AND organization_id = get_user_organization_id(auth.uid())
    )
  );


-- ---- goals ----
DROP POLICY IF EXISTS "Admins HR and Managers can view all goals" ON public.goals;

CREATE POLICY "Org managers can view all goals"
  ON public.goals FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));


-- ---- holidays ----
DROP POLICY IF EXISTS "Admins can manage holidays" ON public.holidays;
DROP POLICY IF EXISTS "Authenticated users can view holidays" ON public.holidays;

CREATE POLICY "Org admins can manage holidays"
  ON public.holidays FOR ALL
  USING (is_org_admin(auth.uid(), organization_id))
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org members can view holidays"
  ON public.holidays FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));


-- ---- invoice_items (add org-scoped admin policy) ----
CREATE POLICY "Org finance can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND is_org_admin_or_finance(auth.uid(), invoices.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND is_org_admin_or_finance(auth.uid(), invoices.organization_id)));


-- ---- invoice_settings ----
DROP POLICY IF EXISTS "Finance and admin can delete invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Finance and admin can insert invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Finance and admin can update invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Finance and admin can view invoice settings" ON public.invoice_settings;

CREATE POLICY "Org finance can view invoice settings"
  ON public.invoice_settings FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can insert invoice settings"
  ON public.invoice_settings FOR INSERT
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Org finance can update invoice settings"
  ON public.invoice_settings FOR UPDATE
  USING (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Org finance can delete invoice settings"
  ON public.invoice_settings FOR DELETE
  USING (is_org_admin_or_finance(auth.uid(), organization_id) AND auth.uid() = user_id);


-- ---- leave_balances ----
DROP POLICY IF EXISTS "Admins HR and Managers can view all leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Admins and HR can insert leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Admins and HR can update leave balances" ON public.leave_balances;

CREATE POLICY "Org managers can view all leave balances"
  ON public.leave_balances FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org admins can insert leave balances"
  ON public.leave_balances FOR INSERT
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));


-- ---- leave_requests ----
DROP POLICY IF EXISTS "Admins HR and Managers can update leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins HR and Managers can view all leave requests" ON public.leave_requests;

CREATE POLICY "Org managers can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org managers can view all leave requests"
  ON public.leave_requests FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));


-- ---- memos ----
DROP POLICY IF EXISTS "Admins and HR can manage all memos" ON public.memos;
DROP POLICY IF EXISTS "Authenticated users can view published memos" ON public.memos;

CREATE POLICY "Org admins can manage all memos"
  ON public.memos FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org members can view published memos"
  ON public.memos FOR SELECT TO authenticated
  USING (status = 'published' AND organization_id = get_user_organization_id(auth.uid()));


-- ---- notifications ----
DROP POLICY IF EXISTS "System and admins can insert notifications" ON public.notifications;

CREATE POLICY "Users and org admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK ((auth.uid() = user_id) OR is_org_admin_or_hr(auth.uid(), organization_id));


-- ---- payroll_records ----
DROP POLICY IF EXISTS "Admins and HR can manage all payroll" ON public.payroll_records;
DROP POLICY IF EXISTS "Managers can view payroll" ON public.payroll_records;

CREATE POLICY "Org admins can manage all payroll"
  ON public.payroll_records FOR ALL
  USING (is_org_admin_or_hr(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org managers can view payroll"
  ON public.payroll_records FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));


-- ---- profiles ----
DROP POLICY IF EXISTS "Admins and HR can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and HR can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and HR can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and HR can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view direct reports profiles" ON public.profiles;

CREATE POLICY "Org admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Org managers can view direct reports"
  ON public.profiles FOR SELECT
  USING (manager_id = get_current_user_profile_id() AND organization_id = get_user_organization_id(auth.uid()));


-- ---- quote_items (add org-scoped admin policy) ----
CREATE POLICY "Org finance can manage quote items"
  ON public.quote_items FOR ALL
  USING (EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND is_org_admin_or_finance(auth.uid(), quotes.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND is_org_admin_or_finance(auth.uid(), quotes.organization_id)));


-- ---- reimbursement_requests ----
DROP POLICY IF EXISTS "Finance Admin can update reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Finance Admin can view all reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Managers HR Admin can update reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Managers HR Admin can view all reimbursements" ON public.reimbursement_requests;

CREATE POLICY "Org finance can update reimbursements"
  ON public.reimbursement_requests FOR UPDATE
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org finance can view all reimbursements"
  ON public.reimbursement_requests FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Org managers can update reimbursements"
  ON public.reimbursement_requests FOR UPDATE
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));

CREATE POLICY "Org managers can view all reimbursements"
  ON public.reimbursement_requests FOR SELECT
  USING (is_org_admin_hr_or_manager(auth.uid(), organization_id));


-- ---- vendor_credits ----
DROP POLICY IF EXISTS "Finance and admin can manage vendor credits" ON public.vendor_credits;

CREATE POLICY "Org finance can manage vendor credits"
  ON public.vendor_credits FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));


-- ---- vendors ----
DROP POLICY IF EXISTS "Finance and admin can manage vendors" ON public.vendors;

CREATE POLICY "Org finance can manage vendors"
  ON public.vendors FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));


-- ---- asset_depreciation_entries (add org-scoped policy) ----
DROP POLICY IF EXISTS "Finance admin can manage depreciation entries" ON public.asset_depreciation_entries;
DROP POLICY IF EXISTS "Users can view own asset depreciation" ON public.asset_depreciation_entries;

CREATE POLICY "Org finance can manage depreciation entries"
  ON public.asset_depreciation_entries FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own asset depreciation"
  ON public.asset_depreciation_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM assets a WHERE a.id = asset_depreciation_entries.asset_id AND a.user_id = auth.uid()));


-- ============================================
-- PHASE 6: Add missing performance indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_assets_org ON public.assets (organization_id);
CREATE INDEX IF NOT EXISTS idx_acr_org ON public.attendance_correction_requests (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_org ON public.bank_accounts (organization_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_org ON public.bank_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_bills_org ON public.bills (organization_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_org ON public.bulk_upload_history (organization_id);
CREATE INDEX IF NOT EXISTS idx_coa_org ON public.chart_of_accounts (organization_id);
CREATE INDEX IF NOT EXISTS idx_cc_txn_org ON public.credit_card_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_cc_org ON public.credit_cards (organization_id);
CREATE INDEX IF NOT EXISTS idx_cn_org ON public.credit_notes (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_goal_plans_org ON public.goal_plans (organization_id);
CREATE INDEX IF NOT EXISTS idx_goals_org ON public.goals (organization_id);
CREATE INDEX IF NOT EXISTS idx_holidays_org ON public.holidays (organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_settings_org ON public.invoice_settings (organization_id);
CREATE INDEX IF NOT EXISTS idx_lb_org ON public.leave_balances (organization_id);
CREATE INDEX IF NOT EXISTS idx_memos_org ON public.memos (organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_org ON public.notifications (organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes (organization_id);
CREATE INDEX IF NOT EXISTS idx_reimb_org ON public.reimbursement_requests (organization_id);
CREATE INDEX IF NOT EXISTS idx_sched_org ON public.scheduled_payments (organization_id);
CREATE INDEX IF NOT EXISTS idx_vc_org ON public.vendor_credits (organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_org ON public.vendors (organization_id);
CREATE INDEX IF NOT EXISTS idx_ade_org ON public.asset_depreciation_entries (organization_id);
