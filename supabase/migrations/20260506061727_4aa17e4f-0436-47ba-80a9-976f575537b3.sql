
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending','approved','rejected','cancelled'));

ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_status_check;
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_status_check
  CHECK (status IN ('draft','completed','approved','superseded'));

ALTER TABLE public.payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_status_check;
ALTER TABLE public.payroll_entries ADD CONSTRAINT payroll_entries_status_check
  CHECK (status IN ('computed','approved','locked'));

DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_financial_records_je_type') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT uq_financial_records_je_type UNIQUE (journal_entry_id, type);
  END IF;
END $mig$;

CREATE OR REPLACE FUNCTION public.trg_fn_sync_financial_records()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_je_id UUID; v_org_id UUID; v_date DATE; v_memo TEXT; v_user_id UUID; r RECORD;
BEGIN
  v_je_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF v_je_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT je.organization_id, je.entry_date, je.memo, je.created_by
    INTO v_org_id, v_date, v_memo, v_user_id
    FROM public.journal_entries je WHERE je.id = v_je_id;
  IF NOT FOUND OR v_org_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  FOR r IN
    SELECT ga.account_type AS acct_type,
      COALESCE(SUM(jl.debit),0)-COALESCE(SUM(jl.credit),0) AS net_debit, ga.name AS acct_name
    FROM public.journal_lines jl
    JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE jl.journal_entry_id = v_je_id AND ga.account_type IN ('revenue','expense')
    GROUP BY ga.account_type, ga.name
  LOOP
    DECLARE v_amount NUMERIC := ABS(r.net_debit); v_uid UUID := COALESCE(v_user_id,'00000000-0000-0000-0000-000000000000'::UUID);
    BEGIN
      IF v_amount <= 0 THEN CONTINUE; END IF;
      INSERT INTO public.financial_records (user_id, organization_id, type, category, amount, description, record_date, journal_entry_id)
      VALUES (v_uid, v_org_id, r.acct_type, r.acct_name, v_amount, COALESCE(v_memo, r.acct_name), v_date, v_je_id)
      ON CONFLICT (journal_entry_id, type) DO UPDATE SET
        amount=EXCLUDED.amount, category=EXCLUDED.category,
        description=EXCLUDED.description, record_date=EXCLUDED.record_date, updated_at=now();
    END;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_sync_financial_records ON public.journal_lines;
CREATE TRIGGER trg_sync_financial_records
  AFTER INSERT OR UPDATE OF debit, credit, gl_account_id, journal_entry_id
  ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_financial_records();

CREATE OR REPLACE FUNCTION public.trg_fn_sync_item_current_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item_id UUID;
BEGIN
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);
  IF v_item_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.items SET
    current_stock = COALESCE((
      SELECT SUM(CASE
        WHEN sl.transaction_type IN ('purchase','transfer_in','production_in','opening','return') THEN sl.quantity
        WHEN sl.transaction_type IN ('sale','transfer_out','production_out') THEN -sl.quantity
        ELSE sl.quantity END)
      FROM public.stock_ledger sl WHERE sl.item_id = v_item_id), 0),
    updated_at = NOW()
  WHERE id = v_item_id;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_sync_item_current_stock ON public.stock_ledger;
CREATE TRIGGER trg_sync_item_current_stock
  AFTER INSERT OR UPDATE OF item_id, quantity, transaction_type OR DELETE
  ON public.stock_ledger FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_item_current_stock();

CREATE OR REPLACE FUNCTION public.trg_fn_leave_balance_on_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year INTEGER; v_delta INTEGER;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.from_date, OLD.from_date))::INTEGER;
  IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN v_delta := NEW.days;
  ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN v_delta := -(OLD.days);
  ELSE RETURN NEW; END IF;
  UPDATE public.leave_balances SET used_days = GREATEST(0, used_days + v_delta), updated_at = now()
  WHERE profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND leave_type = COALESCE(NEW.leave_type, OLD.leave_type) AND year = v_year;
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
  UPDATE public.leave_balances SET used_days = GREATEST(0, used_days - OLD.days), updated_at = now()
  WHERE profile_id = OLD.profile_id AND leave_type = OLD.leave_type AND year = v_year;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_leave_balance_on_delete ON public.leave_requests;
CREATE TRIGGER trg_leave_balance_on_delete AFTER DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_leave_balance_on_delete();

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

DROP POLICY IF EXISTS "Org finance can manage bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Users can manage own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org members can view bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can insert bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can update bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can delete bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Org admin or finance can write bank accounts" ON public.bank_accounts;
CREATE POLICY "Org members can view bank accounts" ON public.bank_accounts FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org admin or finance can write bank accounts" ON public.bank_accounts FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org finance can manage bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Users can manage own bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org members can view bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can insert bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can update bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can delete bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Org admin or finance can write bank transactions" ON public.bank_transactions;
CREATE POLICY "Org members can view bank transactions" ON public.bank_transactions FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org admin or finance can write bank transactions" ON public.bank_transactions FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org finance can manage scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Users can manage own scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org members can view scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can insert scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can update scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can delete scheduled payments" ON public.scheduled_payments;
DROP POLICY IF EXISTS "Org admin or finance can write scheduled payments" ON public.scheduled_payments;
CREATE POLICY "Org members can view scheduled payments" ON public.scheduled_payments FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org admin or finance can write scheduled payments" ON public.scheduled_payments FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

NOTIFY pgrst, 'reload schema';
