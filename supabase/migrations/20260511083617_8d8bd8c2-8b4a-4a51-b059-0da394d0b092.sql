-- ══════════════════════════════════════════════════════════════════════
-- GBC-40 / GBC-41 / GBC-63 / GBC-64: GL + inventory side-effect triggers
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_auto_post_credit_note_journal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _je_id UUID; _ar_acct UUID; _ret_acct UUID; _seq TEXT; _amount NUMERIC;
BEGIN
  IF NEW.status NOT IN ('issued','applied') THEN RETURN NEW; END IF;
  IF OLD.status IN ('issued','applied') THEN RETURN NEW; END IF;
  _seq := 'CN-JE-' || NEW.credit_note_number;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE organization_id=NEW.organization_id AND document_sequence_number=_seq) THEN RETURN NEW; END IF;
  SELECT id INTO _ar_acct FROM public.gl_accounts WHERE organization_id=NEW.organization_id AND account_type='asset' AND (code LIKE '12%' OR name ILIKE '%receivable%') AND is_active=TRUE ORDER BY code ASC LIMIT 1;
  SELECT id INTO _ret_acct FROM public.gl_accounts WHERE organization_id=NEW.organization_id AND (name ILIKE '%sales return%' OR name ILIKE '%returns and allowance%' OR code LIKE '41%') AND is_active=TRUE ORDER BY code ASC LIMIT 1;
  IF _ret_acct IS NULL THEN
    SELECT id INTO _ret_acct FROM public.gl_accounts WHERE organization_id=NEW.organization_id AND account_type='revenue' AND is_active=TRUE ORDER BY code ASC LIMIT 1;
  END IF;
  IF _ar_acct IS NULL OR _ret_acct IS NULL THEN RETURN NEW; END IF;
  _amount := COALESCE(NEW.amount,0);
  IF _amount<=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries (organization_id,document_sequence_number,entry_date,memo,status,is_posted,source_type,created_by)
  VALUES (NEW.organization_id,_seq,COALESCE(NEW.issue_date,CURRENT_DATE),'Auto: Credit Note '||NEW.credit_note_number||' (AR reduction)','posted',TRUE,'credit_note',COALESCE(NEW.user_id,auth.uid())) RETURNING id INTO _je_id;
  INSERT INTO public.journal_lines (journal_entry_id,gl_account_id,debit,credit,description) VALUES
    (_je_id,_ret_acct,_amount,0,'Sales Returns - '||COALESCE(NEW.client_name,'Customer')),
    (_je_id,_ar_acct,0,_amount,'AR reduction - CN '||NEW.credit_note_number);
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_credit_note_auto_journal ON public.credit_notes;
CREATE TRIGGER trg_credit_note_auto_journal AFTER INSERT OR UPDATE OF status ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.fn_auto_post_credit_note_journal();

CREATE OR REPLACE FUNCTION public.fn_auto_post_vendor_credit_journal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _je_id UUID; _ap_acct UUID; _ret_acct UUID; _seq TEXT; _amount NUMERIC;
BEGIN
  IF NEW.status NOT IN ('issued','applied') THEN RETURN NEW; END IF;
  IF OLD.status IN ('issued','applied') THEN RETURN NEW; END IF;
  _seq := 'VC-JE-' || NEW.vendor_credit_number;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE organization_id=NEW.organization_id AND document_sequence_number=_seq) THEN RETURN NEW; END IF;
  SELECT id INTO _ap_acct FROM public.gl_accounts WHERE organization_id=NEW.organization_id AND account_type='liability' AND (code LIKE '20%' OR name ILIKE '%payable%') AND is_active=TRUE ORDER BY code ASC LIMIT 1;
  SELECT id INTO _ret_acct FROM public.gl_accounts WHERE organization_id=NEW.organization_id AND (name ILIKE '%purchase return%' OR name ILIKE '%purchase allowance%' OR code LIKE '52%') AND is_active=TRUE ORDER BY code ASC LIMIT 1;
  IF _ret_acct IS NULL THEN
    SELECT id INTO _ret_acct FROM public.gl_accounts WHERE organization_id=NEW.organization_id AND account_type IN ('expense','cogs') AND is_active=TRUE ORDER BY code ASC LIMIT 1;
  END IF;
  IF _ap_acct IS NULL OR _ret_acct IS NULL THEN RETURN NEW; END IF;
  _amount := COALESCE(NEW.amount,0);
  IF _amount<=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries (organization_id,document_sequence_number,entry_date,memo,status,is_posted,source_type,created_by)
  VALUES (NEW.organization_id,_seq,COALESCE(NEW.issue_date,CURRENT_DATE),'Auto: Vendor Credit '||NEW.vendor_credit_number||' (AP reduction)','posted',TRUE,'vendor_credit',COALESCE(NEW.user_id,auth.uid())) RETURNING id INTO _je_id;
  INSERT INTO public.journal_lines (journal_entry_id,gl_account_id,debit,credit,description) VALUES
    (_je_id,_ap_acct,_amount,0,'AP reduction - VC '||NEW.vendor_credit_number),
    (_je_id,_ret_acct,0,_amount,'Purchase Returns - '||COALESCE(NEW.vendor_name,'Vendor'));
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_vendor_credit_auto_journal ON public.vendor_credits;
CREATE TRIGGER trg_vendor_credit_auto_journal AFTER INSERT OR UPDATE OF status ON public.vendor_credits FOR EACH ROW EXECUTE FUNCTION public.fn_auto_post_vendor_credit_journal();

CREATE OR REPLACE FUNCTION public.fn_auto_post_delivery_return_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _line RECORD; _bal_qty NUMERIC; _bal_value NUMERIC; _existing_count INT;
BEGIN
  IF NEW.status <> 'returned' THEN RETURN NEW; END IF;
  IF OLD.status = 'returned' THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO _existing_count FROM public.stock_ledger WHERE organization_id=NEW.organization_id AND reference_type='delivery_return' AND reference_id=NEW.id;
  IF _existing_count>0 THEN RETURN NEW; END IF;
  FOR _line IN SELECT dni.item_id, dni.shipped_quantity, dni.warehouse_id, dni.description FROM public.delivery_note_items dni WHERE dni.delivery_note_id=NEW.id AND dni.item_id IS NOT NULL AND dni.warehouse_id IS NOT NULL AND dni.shipped_quantity>0
  LOOP
    SELECT COALESCE(balance_qty,0), COALESCE(balance_value,0) INTO _bal_qty,_bal_value FROM public.stock_ledger WHERE organization_id=NEW.organization_id AND item_id=_line.item_id AND warehouse_id=_line.warehouse_id ORDER BY posted_at DESC LIMIT 1;
    _bal_qty := COALESCE(_bal_qty,0)+_line.shipped_quantity;
    INSERT INTO public.stock_ledger (organization_id,item_id,warehouse_id,transaction_type,quantity,rate,value,balance_qty,balance_value,reference_type,reference_id,notes,posted_by)
    VALUES (NEW.organization_id,_line.item_id,_line.warehouse_id,'return',_line.shipped_quantity,0,0,_bal_qty,COALESCE(_bal_value,0),'delivery_return',NEW.id,'Auto: delivery '||COALESCE(NEW.dn_number,NEW.id::text)||' returned',COALESCE(auth.uid(),NEW.dispatched_by));
  END LOOP;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_delivery_return_auto_stock ON public.delivery_notes;
CREATE TRIGGER trg_delivery_return_auto_stock AFTER INSERT OR UPDATE OF status ON public.delivery_notes FOR EACH ROW EXECUTE FUNCTION public.fn_auto_post_delivery_return_stock();

CREATE OR REPLACE FUNCTION public.fn_auto_post_sales_return_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _line RECORD; _wh UUID; _bal_qty NUMERIC; _bal_value NUMERIC; _existing_count INT;
BEGIN
  IF NEW.status NOT IN ('approved','received') THEN RETURN NEW; END IF;
  IF OLD.status IN ('approved','received') THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO _existing_count FROM public.stock_ledger WHERE organization_id=NEW.organization_id AND reference_type='sales_return' AND reference_id=NEW.id;
  IF _existing_count>0 THEN RETURN NEW; END IF;
  FOR _line IN SELECT sri.item_id, sri.quantity, sri.description FROM public.sales_return_items sri WHERE sri.sales_return_id=NEW.id AND sri.item_id IS NOT NULL AND sri.quantity>0
  LOOP
    _wh := NULL;
    IF NEW.delivery_note_id IS NOT NULL THEN
      SELECT dni.warehouse_id INTO _wh FROM public.delivery_note_items dni WHERE dni.delivery_note_id=NEW.delivery_note_id AND dni.item_id=_line.item_id LIMIT 1;
    END IF;
    IF _wh IS NULL THEN
      SELECT id INTO _wh FROM public.warehouses WHERE organization_id=NEW.organization_id AND is_default=TRUE LIMIT 1;
    END IF;
    IF _wh IS NULL THEN CONTINUE; END IF;
    SELECT COALESCE(balance_qty,0), COALESCE(balance_value,0) INTO _bal_qty,_bal_value FROM public.stock_ledger WHERE organization_id=NEW.organization_id AND item_id=_line.item_id AND warehouse_id=_wh ORDER BY posted_at DESC LIMIT 1;
    _bal_qty := COALESCE(_bal_qty,0)+_line.quantity;
    INSERT INTO public.stock_ledger (organization_id,item_id,warehouse_id,transaction_type,quantity,rate,value,balance_qty,balance_value,reference_type,reference_id,notes,posted_by)
    VALUES (NEW.organization_id,_line.item_id,_wh,'return',_line.quantity,0,0,_bal_qty,COALESCE(_bal_value,0),'sales_return',NEW.id,'Auto: sales return '||COALESCE(NEW.return_number,NEW.id::text),COALESCE(auth.uid(),NEW.created_by));
  END LOOP;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_sales_return_auto_stock ON public.sales_returns;
CREATE TRIGGER trg_sales_return_auto_stock AFTER INSERT OR UPDATE OF status ON public.sales_returns FOR EACH ROW EXECUTE FUNCTION public.fn_auto_post_sales_return_stock();

-- ══════════════════════════════════════════════════════════════════════
-- GBC-58 / T13: stock_adjustment_lines
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.stock_adjustment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_adjustment_id UUID NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity_delta NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  reason_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantity_delta <> 0)
);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_adjustment ON public.stock_adjustment_lines (stock_adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_org_item ON public.stock_adjustment_lines (organization_id, item_id);

CREATE OR REPLACE FUNCTION public._stock_adjustment_lines_sync_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _parent_org UUID;
BEGIN
  SELECT organization_id INTO _parent_org FROM public.stock_adjustments WHERE id=NEW.stock_adjustment_id;
  IF _parent_org IS NULL THEN RAISE EXCEPTION 'parent stock_adjustments row % not found', NEW.stock_adjustment_id; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := _parent_org;
  ELSIF NEW.organization_id <> _parent_org THEN RAISE EXCEPTION 'cross-tenant access denied (line vs parent)'; END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_stock_adjustment_lines_sync_org ON public.stock_adjustment_lines;
CREATE TRIGGER trg_stock_adjustment_lines_sync_org BEFORE INSERT OR UPDATE ON public.stock_adjustment_lines FOR EACH ROW EXECUTE FUNCTION public._stock_adjustment_lines_sync_org();

ALTER TABLE public.stock_adjustment_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read stock_adjustment_lines" ON public.stock_adjustment_lines;
CREATE POLICY "Org members read stock_adjustment_lines" ON public.stock_adjustment_lines FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid()));
DROP POLICY IF EXISTS "Admin/finance manage stock_adjustment_lines" ON public.stock_adjustment_lines;
CREATE POLICY "Admin/finance manage stock_adjustment_lines" ON public.stock_adjustment_lines FOR ALL TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_admin_or_finance(auth.uid())) WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_admin_or_finance(auth.uid()));

CREATE OR REPLACE FUNCTION public.fn_post_stock_adjustment_lines()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _line RECORD; _bal_qty NUMERIC; _bal_value NUMERIC; _existing_count INT;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF OLD.status = 'posted' THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO _existing_count FROM public.stock_ledger WHERE organization_id=NEW.organization_id AND reference_type='stock_adjustment' AND reference_id=NEW.id;
  IF _existing_count>0 THEN RETURN NEW; END IF;
  FOR _line IN SELECT sal.id, sal.item_id, sal.quantity_delta, sal.unit_cost, sal.notes FROM public.stock_adjustment_lines sal WHERE sal.stock_adjustment_id=NEW.id
  LOOP
    SELECT COALESCE(balance_qty,0), COALESCE(balance_value,0) INTO _bal_qty,_bal_value FROM public.stock_ledger WHERE organization_id=NEW.organization_id AND item_id=_line.item_id AND warehouse_id=NEW.warehouse_id ORDER BY posted_at DESC LIMIT 1;
    _bal_qty := COALESCE(_bal_qty,0)+_line.quantity_delta;
    _bal_value := COALESCE(_bal_value,0)+_line.quantity_delta*COALESCE(_line.unit_cost,0);
    INSERT INTO public.stock_ledger (organization_id,item_id,warehouse_id,transaction_type,quantity,rate,value,balance_qty,balance_value,reference_type,reference_id,notes,posted_by)
    VALUES (NEW.organization_id,_line.item_id,NEW.warehouse_id,'adjustment',_line.quantity_delta,COALESCE(_line.unit_cost,0),_line.quantity_delta*COALESCE(_line.unit_cost,0),_bal_qty,_bal_value,'stock_adjustment',NEW.id,COALESCE(_line.notes,NEW.reason),COALESCE(NEW.approved_by,auth.uid()));
  END LOOP;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_stock_adjustment_post ON public.stock_adjustments;
CREATE TRIGGER trg_stock_adjustment_post AFTER UPDATE OF status ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.fn_post_stock_adjustment_lines();

CREATE OR REPLACE FUNCTION public.create_stock_adjustment_with_lines(p_header jsonb, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_id uuid; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header)<>'object' THEN RAISE EXCEPTION 'p_header must be a JSON object'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'p_lines must be a JSON array'; END IF;
  INSERT INTO public.stock_adjustments (organization_id,adjustment_number,warehouse_id,adjustment_date,reason,status,notes,created_by)
  VALUES (v_org,p_header->>'adjustment_number',(p_header->>'warehouse_id')::uuid,COALESCE(NULLIF(p_header->>'adjustment_date','')::date,CURRENT_DATE),p_header->>'reason',COALESCE(p_header->>'status','draft'),p_header->>'notes',auth.uid()) RETURNING id INTO v_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.stock_adjustment_lines (stock_adjustment_id,organization_id,item_id,quantity_delta,unit_cost,reason_code,notes)
    VALUES (v_id,v_org,(v_line->>'item_id')::uuid,COALESCE(NULLIF(v_line->>'quantity_delta','')::numeric,0),COALESCE(NULLIF(v_line->>'unit_cost','')::numeric,0),v_line->>'reason_code',v_line->>'notes');
  END LOOP;
  RETURN v_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.create_stock_adjustment_with_lines(jsonb, jsonb) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- T6 residual atomic RPCs
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id uuid, p_due_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_quote RECORD; v_inv_id uuid; v_inv_num TEXT; v_item RECORD;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT q.*, q.amount AS total_amount INTO v_quote FROM public.quotes q WHERE q.id=p_quote_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote % not found', p_quote_id; END IF;
  IF v_quote.organization_id IS NOT NULL AND v_quote.organization_id<>v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  IF v_quote.converted_invoice_id IS NOT NULL THEN RETURN v_quote.converted_invoice_id; END IF;
  IF v_quote.status='converted' THEN RAISE EXCEPTION 'Quote already marked converted but converted_invoice_id is null'; END IF;
  v_inv_num := 'INV-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||substring(replace(p_quote_id::text,'-','') from 1 for 6);
  INSERT INTO public.invoices (organization_id,user_id,invoice_number,customer_id,client_name,amount,total_amount,subtotal,invoice_date,due_date,status,notes,currency_code)
  VALUES (v_org,auth.uid(),v_inv_num,v_quote.customer_id,v_quote.client_name,v_quote.amount,v_quote.amount,v_quote.amount,CURRENT_DATE,COALESCE(p_due_date,v_quote.due_date),'draft','Converted from quote '||v_quote.quote_number,'INR') RETURNING id INTO v_inv_id;
  FOR v_item IN SELECT description,quantity,rate,amount FROM public.quote_items WHERE quote_id=p_quote_id
  LOOP
    INSERT INTO public.invoice_items (invoice_id,description,quantity,rate,amount) VALUES (v_inv_id,v_item.description,v_item.quantity,v_item.rate,v_item.amount);
  END LOOP;
  UPDATE public.quotes SET status='converted', converted_invoice_id=v_inv_id, updated_at=now() WHERE id=p_quote_id;
  RETURN v_inv_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_purchase_return_with_lines(p_return_id uuid, p_header jsonb, p_lines jsonb, p_expected_version int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_pr_org uuid; v_current_version int; v_line jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT organization_id, COALESCE(version,1) INTO v_pr_org, v_current_version FROM public.purchase_returns WHERE id=p_return_id;
  IF v_pr_org IS NULL THEN RAISE EXCEPTION 'Purchase return % not found', p_return_id; END IF;
  IF v_pr_org<>v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version<>v_current_version THEN
    RAISE EXCEPTION 'Version conflict (expected %, found %)', p_expected_version, v_current_version USING ERRCODE='serialization_failure';
  END IF;
  UPDATE public.purchase_returns SET
    return_number=COALESCE(p_header->>'return_number',return_number),
    return_date=COALESCE(NULLIF(p_header->>'return_date','')::date,return_date),
    reason=COALESCE(p_header->>'reason',reason),
    subtotal=COALESCE(NULLIF(p_header->>'subtotal','')::numeric,subtotal),
    tax_amount=COALESCE(NULLIF(p_header->>'tax_amount','')::numeric,tax_amount),
    total_amount=COALESCE(NULLIF(p_header->>'total_amount','')::numeric,total_amount),
    status=COALESCE(p_header->>'status',status),
    notes=COALESCE(p_header->>'notes',notes),
    updated_at=now() WHERE id=p_return_id;
  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines)='array' THEN
    DELETE FROM public.purchase_return_items WHERE purchase_return_id=p_return_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.purchase_return_items (purchase_return_id,item_id,description,quantity,unit_price,tax_rate,amount,reason)
      VALUES (p_return_id,NULLIF(v_line->>'item_id','')::uuid,v_line->>'description',COALESCE(NULLIF(v_line->>'quantity','')::numeric,0),COALESCE(NULLIF(v_line->>'unit_price','')::numeric,0),COALESCE(NULLIF(v_line->>'tax_rate','')::numeric,0),COALESCE(NULLIF(v_line->>'amount','')::numeric,0),v_line->>'reason');
    END LOOP;
  END IF;
  RETURN p_return_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.update_purchase_return_with_lines(uuid, jsonb, jsonb, int) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-10 / T3 residual: version columns on master tables
-- ══════════════════════════════════════════════════════════════════════
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','items','salary_structures','financial_records','payroll_records']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
      IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='bump_row_version') THEN
        EXECUTE format('DROP TRIGGER IF EXISTS trg_bump_version ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_bump_version BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_row_version()', t);
      END IF;
    END IF;
  END LOOP;
END $do$;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-4: soft-delete active views (only for tables that actually have deleted_at)
-- ══════════════════════════════════════════════════════════════════════
DO $do$
DECLARE t text; tables text[] := ARRAY['invoices','bills','expenses','financial_records','journal_entries','payroll_records','bank_transactions','invoice_items','chart_of_accounts','profiles','scheduled_payments'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='deleted_at') THEN
      EXECUTE format('CREATE OR REPLACE VIEW public.v_%I_active WITH (security_invoker=on) AS SELECT * FROM public.%I WHERE deleted_at IS NULL', t, t);
      EXECUTE format('GRANT SELECT ON public.v_%I_active TO authenticated', t);
    END IF;
  END LOOP;
END $do$;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-37/39/43/44: default bank account helper + RPCs
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._resolve_default_bank_account(p_org_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT id FROM public.bank_accounts WHERE organization_id=p_org_id AND status='Active' ORDER BY created_at ASC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.mark_expense_paid(p_expense_id uuid, p_payment_method text, p_bank_account_id uuid DEFAULT NULL, p_reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_exp RECORD; v_bank uuid := p_bank_account_id;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT * INTO v_exp FROM public.expenses WHERE id=p_expense_id;
  IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;
  IF v_exp.organization_id IS NOT NULL AND v_exp.organization_id<>v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  IF v_exp.status='paid' THEN RETURN p_expense_id; END IF;
  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.'; END IF;
  END IF;
  UPDATE public.expenses SET status='paid', updated_at=now() WHERE id=p_expense_id;
  INSERT INTO public.bank_transactions (organization_id,user_id,account_id,transaction_date,transaction_type,amount,description,category,reference)
  VALUES (v_org,COALESCE(v_exp.user_id,auth.uid()),v_bank,CURRENT_DATE,'debit',v_exp.amount,COALESCE('Expense paid: '||v_exp.description,'Expense payment'),COALESCE(v_exp.category,'Expense'),COALESCE(p_reference,p_expense_id::text));
  RETURN p_expense_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.mark_expense_paid(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_reimbursement(p_reimbursement_id uuid, p_bank_account_id uuid DEFAULT NULL, p_reference text DEFAULT NULL, p_finance_notes text DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_req RECORD; v_exp_id uuid; v_bank uuid := p_bank_account_id; v_cat text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT * INTO v_req FROM public.reimbursement_requests WHERE id=p_reimbursement_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Reimbursement % not found', p_reimbursement_id; END IF;
  IF v_req.status='paid' THEN RETURN p_reimbursement_id; END IF;
  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.'; END IF;
  END IF;
  v_cat := COALESCE(NULLIF(p_category,''),v_req.category,'Reimbursement');
  INSERT INTO public.expenses (user_id,organization_id,category,amount,description,expense_date,status,notes)
  VALUES (v_req.user_id,v_org,v_cat,v_req.amount,COALESCE(v_req.description,v_req.vendor_name,'Reimbursement'),COALESCE(v_req.expense_date,CURRENT_DATE),'paid',p_finance_notes) RETURNING id INTO v_exp_id;
  UPDATE public.reimbursement_requests SET status='paid', expense_id=v_exp_id, finance_notes=COALESCE(p_finance_notes,finance_notes), finance_reviewed_at=now(), finance_reviewed_by=auth.uid(), updated_at=now() WHERE id=p_reimbursement_id;
  INSERT INTO public.bank_transactions (organization_id,user_id,account_id,transaction_date,transaction_type,amount,description,category,reference)
  VALUES (v_org,v_req.user_id,v_bank,CURRENT_DATE,'debit',v_req.amount,'Reimbursement: '||COALESCE(v_req.vendor_name,'employee'),v_cat,COALESCE(p_reference,v_exp_id::text));
  RETURN p_reimbursement_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.approve_reimbursement(uuid,uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_payment_receipt(p_invoice_id uuid, p_amount numeric, p_payment_method text, p_bank_account_id uuid DEFAULT NULL, p_reference text DEFAULT NULL, p_payment_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_inv RECORD; v_receipt_id uuid; v_receipt_num text; v_paid_total numeric; v_bank uuid := p_bank_account_id;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id=p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.organization_id<>v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  v_paid_total := COALESCE((SELECT SUM(amount) FROM public.payment_receipts WHERE organization_id=v_org AND invoice_id=p_invoice_id AND status NOT IN ('cancelled','reversed')),0);
  IF v_paid_total+p_amount > COALESCE(v_inv.total_amount,v_inv.amount,0)+0.01 THEN RAISE EXCEPTION 'Overpayment: invoice total %, already paid %, attempted %', v_inv.total_amount,v_paid_total,p_amount; END IF;
  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.'; END IF;
  END IF;
  v_receipt_num := 'PR-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||substring(replace(p_invoice_id::text,'-','') from 1 for 6);
  INSERT INTO public.payment_receipts (organization_id,receipt_number,customer_id,customer_name,invoice_id,payment_date,amount,payment_method,reference_number,bank_account_id,status,created_by)
  VALUES (v_org,v_receipt_num,v_inv.customer_id,COALESCE(v_inv.client_name,'Customer'),p_invoice_id,p_payment_date,p_amount,p_payment_method,p_reference,v_bank,'received',auth.uid()) RETURNING id INTO v_receipt_id;
  UPDATE public.invoices SET status=CASE WHEN v_paid_total+p_amount>=COALESCE(total_amount,amount,0) THEN 'paid' ELSE 'partially_paid' END, updated_at=now() WHERE id=p_invoice_id;
  INSERT INTO public.bank_transactions (organization_id,user_id,account_id,transaction_date,transaction_type,amount,description,category,reference)
  VALUES (v_org,auth.uid(),v_bank,p_payment_date,'credit',p_amount,'Receipt for '||v_inv.invoice_number,'Invoice Payment',COALESCE(p_reference,v_receipt_num));
  RETURN v_receipt_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.record_payment_receipt(uuid,numeric,text,uuid,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_vendor_payment(p_bill_id uuid, p_amount numeric, p_payment_method text, p_bank_account_id uuid DEFAULT NULL, p_reference text DEFAULT NULL, p_payment_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_bill RECORD; v_pay_id uuid; v_pay_num text; v_paid_total numeric; v_bank uuid := p_bank_account_id;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id=p_bill_id;
  IF v_bill.id IS NULL THEN RAISE EXCEPTION 'Bill % not found', p_bill_id; END IF;
  IF v_bill.organization_id<>v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  v_paid_total := COALESCE((SELECT SUM(amount) FROM public.vendor_payments WHERE organization_id=v_org AND bill_id=p_bill_id AND status NOT IN ('cancelled','reversed')),0);
  IF v_paid_total+p_amount > COALESCE(v_bill.total_amount,v_bill.amount,0)+0.01 THEN RAISE EXCEPTION 'Overpayment: bill total %, already paid %, attempted %', v_bill.total_amount,v_paid_total,p_amount; END IF;
  IF v_bank IS NULL THEN
    v_bank := public._resolve_default_bank_account(v_org);
    IF v_bank IS NULL THEN RAISE EXCEPTION 'No active bank account in this organization. Configure one in Settings → Banking.'; END IF;
  END IF;
  v_pay_num := 'VP-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||substring(replace(p_bill_id::text,'-','') from 1 for 6);
  INSERT INTO public.vendor_payments (organization_id,payment_number,vendor_id,vendor_name,bill_id,payment_date,amount,payment_method,reference_number,bank_account_id,status,created_by)
  VALUES (v_org,v_pay_num,v_bill.vendor_id,COALESCE(v_bill.vendor_name,'Vendor'),p_bill_id,p_payment_date,p_amount,p_payment_method,p_reference,v_bank,'paid',auth.uid()) RETURNING id INTO v_pay_id;
  UPDATE public.bills SET status=CASE WHEN v_paid_total+p_amount>=COALESCE(total_amount,amount,0) THEN 'paid' ELSE 'partially_paid' END, updated_at=now() WHERE id=p_bill_id;
  INSERT INTO public.bank_transactions (organization_id,user_id,account_id,transaction_date,transaction_type,amount,description,category,reference)
  VALUES (v_org,auth.uid(),v_bank,p_payment_date,'debit',p_amount,'Vendor payment for '||v_bill.bill_number,'Bill Payment',COALESCE(p_reference,v_pay_num));
  RETURN v_pay_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment(uuid,numeric,text,uuid,text,date) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-2/3: salary_components.organization_id
-- ══════════════════════════════════════════════════════════════════════
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_components') THEN
    ALTER TABLE public.salary_components ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
  END IF;
END $do$;
DO $do$
DECLARE v_struct_has_org boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_components') THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salary_structures' AND column_name='organization_id') INTO v_struct_has_org;
  IF v_struct_has_org THEN
    UPDATE public.salary_components sc SET organization_id=ss.organization_id FROM public.salary_structures ss WHERE sc.structure_id=ss.id AND sc.organization_id IS NULL;
  ELSE
    UPDATE public.salary_components sc SET organization_id=p.organization_id FROM public.salary_structures ss JOIN public.profiles p ON p.id=ss.profile_id WHERE sc.structure_id=ss.id AND sc.organization_id IS NULL;
  END IF;
END $do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_components') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.salary_components WHERE organization_id IS NULL) THEN
    ALTER TABLE public.salary_components ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $do$;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_components')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_sync_org_id_from_parent') THEN
    DROP TRIGGER IF EXISTS trg_sync_org_id_salary_components ON public.salary_components;
    CREATE TRIGGER trg_sync_org_id_salary_components BEFORE INSERT OR UPDATE ON public.salary_components FOR EACH ROW EXECUTE FUNCTION public._sync_org_id_from_parent('salary_structures','structure_id');
  END IF;
END $do$;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_components') THEN
    DROP POLICY IF EXISTS "Users can view org salary_components" ON public.salary_components;
    DROP POLICY IF EXISTS "Users can manage org salary_components" ON public.salary_components;
    DROP POLICY IF EXISTS "Org admin/HR manage salary_components" ON public.salary_components;
    DROP POLICY IF EXISTS "Org members view salary_components" ON public.salary_components;
    CREATE POLICY "Org members view salary_components" ON public.salary_components FOR SELECT TO authenticated USING (organization_id=public.get_user_organization_id(auth.uid()));
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin_or_hr') THEN
      CREATE POLICY "Org admin/HR manage salary_components" ON public.salary_components FOR ALL TO authenticated USING (organization_id=public.get_user_organization_id(auth.uid()) AND public.is_admin_or_hr(auth.uid())) WITH CHECK (organization_id=public.get_user_organization_id(auth.uid()) AND public.is_admin_or_hr(auth.uid()));
    END IF;
  END IF;
END $do$;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-45: unrealized_fx_pnl
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unrealized_fx_pnl(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE (currency_code text, receivable_foreign numeric, receivable_inr_at_booking numeric, receivable_inr_at_as_of numeric, receivable_unrealized numeric, payable_foreign numeric, payable_inr_at_booking numeric, payable_inr_at_as_of numeric, payable_unrealized numeric, net_unrealized numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  RETURN QUERY
  WITH as_of_rate AS (SELECT DISTINCT ON (er.to_currency) er.to_currency AS code, er.rate AS rate FROM public.exchange_rates er WHERE er.organization_id=v_org AND er.from_currency='INR' AND er.effective_date<=p_as_of ORDER BY er.to_currency, er.effective_date DESC),
  open_recv AS (SELECT COALESCE(NULLIF(i.currency_code,''),'INR') AS code, COALESCE(i.exchange_rate,1) AS booked_rate, GREATEST(COALESCE(i.total_amount,i.amount,0)-COALESCE((SELECT SUM(amount) FROM public.payment_receipts pr WHERE pr.invoice_id=i.id AND pr.status NOT IN ('cancelled','reversed')),0),0) AS remaining_foreign FROM public.invoices i WHERE i.organization_id=v_org AND COALESCE(i.status,'') NOT IN ('cancelled','void','paid')),
  open_pay AS (SELECT COALESCE(NULLIF(b.currency_code,''),'INR') AS code, COALESCE(b.exchange_rate,1) AS booked_rate, GREATEST(COALESCE(b.total_amount,b.amount,0)-COALESCE((SELECT SUM(amount) FROM public.vendor_payments vp WHERE vp.bill_id=b.id AND vp.status NOT IN ('cancelled','reversed')),0),0) AS remaining_foreign FROM public.bills b WHERE b.organization_id=v_org AND COALESCE(b.status,'') NOT IN ('cancelled','void','paid','Paid','Cancelled'))
  SELECT code AS currency_code, ROUND(COALESCE(SUM(recv_foreign),0),2), ROUND(COALESCE(SUM(recv_inr_booked),0),2), ROUND(COALESCE(SUM(recv_inr_asof),0),2), ROUND(COALESCE(SUM(recv_inr_asof)-SUM(recv_inr_booked),0),2), ROUND(COALESCE(SUM(pay_foreign),0),2), ROUND(COALESCE(SUM(pay_inr_booked),0),2), ROUND(COALESCE(SUM(pay_inr_asof),0),2), ROUND(COALESCE(SUM(pay_inr_booked)-SUM(pay_inr_asof),0),2), ROUND(COALESCE((SUM(recv_inr_asof)-SUM(recv_inr_booked))+(SUM(pay_inr_booked)-SUM(pay_inr_asof)),0),2)
  FROM (
    SELECT r.code, r.remaining_foreign AS recv_foreign, r.remaining_foreign*r.booked_rate AS recv_inr_booked, r.remaining_foreign*COALESCE(ar.rate,r.booked_rate) AS recv_inr_asof, 0::numeric AS pay_foreign, 0::numeric AS pay_inr_booked, 0::numeric AS pay_inr_asof FROM open_recv r LEFT JOIN as_of_rate ar ON ar.code=r.code WHERE r.code<>'INR' AND r.remaining_foreign>0
    UNION ALL
    SELECT p.code, 0::numeric, 0::numeric, 0::numeric, p.remaining_foreign, p.remaining_foreign*p.booked_rate, p.remaining_foreign*COALESCE(ar.rate,p.booked_rate) FROM open_pay p LEFT JOIN as_of_rate ar ON ar.code=p.code WHERE p.code<>'INR' AND p.remaining_foreign>0
  ) merged GROUP BY code ORDER BY code;
END;$$;
GRANT EXECUTE ON FUNCTION public.unrealized_fx_pnl(date) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-52: workflow_drafts
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.workflow_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  definition jsonb NOT NULL,
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_workflow_drafts_org_user ON public.workflow_drafts (organization_id, user_id, last_saved_at DESC);
ALTER TABLE public.workflow_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_drafts_select_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_select_own" ON public.workflow_drafts FOR SELECT TO authenticated USING (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid()));
DROP POLICY IF EXISTS "workflow_drafts_insert_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_insert_own" ON public.workflow_drafts FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid()));
DROP POLICY IF EXISTS "workflow_drafts_update_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_update_own" ON public.workflow_drafts FOR UPDATE TO authenticated USING (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid())) WITH CHECK (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid()));
DROP POLICY IF EXISTS "workflow_drafts_delete_own" ON public.workflow_drafts;
CREATE POLICY "workflow_drafts_delete_own" ON public.workflow_drafts FOR DELETE TO authenticated USING (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid()));
CREATE OR REPLACE FUNCTION public.save_workflow_draft(p_name text, p_definition jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_id uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_name IS NULL OR length(trim(p_name))=0 THEN RAISE EXCEPTION 'Workflow draft name is required'; END IF;
  INSERT INTO public.workflow_drafts (organization_id,user_id,name,definition,last_saved_at)
  VALUES (v_org,auth.uid(),p_name,p_definition,now())
  ON CONFLICT (organization_id,user_id,name) DO UPDATE SET definition=EXCLUDED.definition, last_saved_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.save_workflow_draft(text, jsonb) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-54: audit_ai_anomalies stale flag
-- ══════════════════════════════════════════════════════════════════════
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_ai_anomalies') THEN
    ALTER TABLE public.audit_ai_anomalies
      ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS stale_reason text,
      ADD COLUMN IF NOT EXISTS stale_marked_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_audit_anomalies_stale ON public.audit_ai_anomalies (organization_id, is_stale) WHERE is_stale=true;
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.fn_mark_audit_anomalies_stale(p_entity_type text, p_entity_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_ai_anomalies') THEN RETURN 0; END IF;
  UPDATE public.audit_ai_anomalies SET is_stale=true, stale_reason=format('Source %s row %s mutated after the audit run.',p_entity_type,p_entity_id::text), stale_marked_at=now()
   WHERE is_stale=false AND data_reference @> jsonb_build_object('entity_type',p_entity_type) AND data_reference @> jsonb_build_object('entity_id',p_entity_id::text);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;$$;

CREATE OR REPLACE FUNCTION public.trg_audit_anomalies_invalidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE((CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END));
  PERFORM public.fn_mark_audit_anomalies_stale(TG_TABLE_NAME::text, v_id);
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;$$;

DO $do$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_ai_anomalies') THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['invoices','bills','journal_lines','journal_entries','expenses']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_anomalies_invalidate_%I ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_audit_anomalies_invalidate_%I AFTER UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_audit_anomalies_invalidate()', t, t);
    END IF;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.clear_audit_anomaly_stale(p_anomaly_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_anom_org uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT organization_id INTO v_anom_org FROM public.audit_ai_anomalies WHERE id=p_anomaly_id;
  IF v_anom_org IS NULL THEN RAISE EXCEPTION 'Anomaly % not found', p_anomaly_id; END IF;
  IF v_anom_org<>v_org THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;
  UPDATE public.audit_ai_anomalies SET is_stale=false, stale_reason=NULL, stale_marked_at=NULL WHERE id=p_anomaly_id;
  RETURN p_anomaly_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.clear_audit_anomaly_stale(uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- GBC-12: report_jobs queue
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  storage_path text,
  page_count integer,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_jobs_org_user_status ON public.report_jobs (organization_id, user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_queued ON public.report_jobs (status, created_at) WHERE status IN ('queued','running');
ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_jobs_select_own ON public.report_jobs;
CREATE POLICY report_jobs_select_own ON public.report_jobs FOR SELECT TO authenticated USING (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid()));
DROP POLICY IF EXISTS report_jobs_insert_own ON public.report_jobs;
CREATE POLICY report_jobs_insert_own ON public.report_jobs FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND organization_id=public.get_user_organization_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_report_job(p_report_type text, p_params jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid := public.get_user_organization_id(auth.uid()); v_id uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF p_report_type IS NULL OR length(trim(p_report_type))=0 THEN RAISE EXCEPTION 'report_type is required'; END IF;
  INSERT INTO public.report_jobs (organization_id,user_id,report_type,params) VALUES (v_org,auth.uid(),p_report_type,COALESCE(p_params,'{}'::jsonb)) RETURNING id INTO v_id;
  RETURN v_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.enqueue_report_job(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_report_job_running(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ BEGIN UPDATE public.report_jobs SET status='running', started_at=now(), progress_pct=1 WHERE id=p_id AND status='queued'; END;$$;

CREATE OR REPLACE FUNCTION public.update_report_job_progress(p_id uuid, p_pct integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ BEGIN UPDATE public.report_jobs SET progress_pct=LEAST(GREATEST(p_pct,0),99) WHERE id=p_id AND status='running'; END;$$;

CREATE OR REPLACE FUNCTION public.mark_report_job_succeeded(p_id uuid, p_storage_path text, p_page_count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ BEGIN UPDATE public.report_jobs SET status='succeeded', storage_path=p_storage_path, page_count=p_page_count, progress_pct=100, finished_at=now() WHERE id=p_id; END;$$;

CREATE OR REPLACE FUNCTION public.mark_report_job_failed(p_id uuid, p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ BEGIN UPDATE public.report_jobs SET status='failed', error=p_error, finished_at=now() WHERE id=p_id; END;$$;