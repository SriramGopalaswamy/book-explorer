-- Banking RLS (combined v1 + v2)
DROP POLICY IF EXISTS "Users can view their own bank accounts"   ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can create their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can update their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can delete their own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org finance can manage bank accounts"     ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can manage own bank accounts"       ON public.bank_accounts;
DROP POLICY IF EXISTS "Org members can view bank accounts"       ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can write bank accounts" ON public.bank_accounts;
CREATE POLICY "Org members can view bank accounts" ON public.bank_accounts FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org admin or finance can write bank accounts" ON public.bank_accounts FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Users can view their own transactions"   ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org finance can manage bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can manage own bank transactions"   ON public.bank_transactions;
DROP POLICY IF EXISTS "Org members can view bank transactions"   ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can write bank transactions" ON public.bank_transactions;
CREATE POLICY "Org members can view bank transactions" ON public.bank_transactions FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org admin or finance can write bank transactions" ON public.bank_transactions FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Users can view their own scheduled payments"   ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can create their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can update their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can delete their own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org finance can manage scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can manage own scheduled payments"   ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org members can view scheduled payments"   ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can write scheduled payments" ON public.scheduled_payments;
CREATE POLICY "Org members can view scheduled payments" ON public.scheduled_payments FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org admin or finance can write scheduled payments" ON public.scheduled_payments FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- Leave balance triggers
CREATE OR REPLACE FUNCTION public.trg_fn_leave_balance_on_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year INTEGER; v_delta INTEGER;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.from_date, OLD.from_date))::INTEGER;
  IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN v_delta := NEW.days;
  ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN v_delta := -(OLD.days);
  ELSE RETURN NEW; END IF;
  UPDATE public.leave_balances
  SET used_days = GREATEST(0, used_days + v_delta), updated_at = now()
  WHERE profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND leave_type = COALESCE(NEW.leave_type, OLD.leave_type)
    AND year = v_year;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_leave_balance_on_status ON public.leave_requests;
CREATE TRIGGER trg_leave_balance_on_status AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_leave_balance_on_status();

CREATE OR REPLACE FUNCTION public.trg_fn_leave_balance_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year INTEGER;
BEGIN
  IF OLD.status <> 'approved' THEN RETURN OLD; END IF;
  v_year := EXTRACT(YEAR FROM OLD.from_date)::INTEGER;
  UPDATE public.leave_balances
  SET used_days = GREATEST(0, used_days - OLD.days), updated_at = now()
  WHERE profile_id = OLD.profile_id AND leave_type = OLD.leave_type AND year = v_year;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_leave_balance_on_delete ON public.leave_requests;
CREATE TRIGGER trg_leave_balance_on_delete AFTER DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_leave_balance_on_delete();

-- Leave types RLS
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "HR and Admin can manage leave types" ON public.leave_types;
DROP POLICY IF EXISTS "Org members can view leave types" ON public.leave_types;
CREATE POLICY "Org members can view leave types" ON public.leave_types FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
DROP POLICY IF EXISTS "HR or Admin can create leave types" ON public.leave_types;
CREATE POLICY "HR or Admin can create leave types" ON public.leave_types FOR INSERT
  WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));
DROP POLICY IF EXISTS "HR or Admin can update leave types" ON public.leave_types;
CREATE POLICY "HR or Admin can update leave types" ON public.leave_types FOR UPDATE
  USING (is_org_admin_or_hr(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Admin can delete leave types" ON public.leave_types;
CREATE POLICY "Admin can delete leave types" ON public.leave_types FOR DELETE
  USING (is_org_admin(auth.uid(), organization_id));

-- Payroll unique record count RPC
CREATE OR REPLACE FUNCTION public.get_payroll_unique_record_count(p_org_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COUNT(*) FROM (
    SELECT e.profile_id, r.pay_period
    FROM public.payroll_entries e
    JOIN public.payroll_runs r ON r.id = e.payroll_run_id
    WHERE e.organization_id = p_org_id
    UNION
    SELECT profile_id, pay_period
    FROM public.payroll_records
    WHERE organization_id = p_org_id AND is_superseded = false
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_payroll_unique_record_count(uuid) TO authenticated;