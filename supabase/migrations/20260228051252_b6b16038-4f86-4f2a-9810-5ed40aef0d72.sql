
-- ================================================================
-- FINANCIAL INTEGRITY ARCHITECTURE v2.0
-- Extends existing ledger spine with full CA-grade controls
-- ================================================================

-- 1. EXTEND journal_lines with cost allocation + asset reference
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets(id);

CREATE INDEX IF NOT EXISTS idx_jl_cost_center ON public.journal_lines(cost_center) WHERE cost_center IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jl_department ON public.journal_lines(department) WHERE department IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jl_asset ON public.journal_lines(asset_id) WHERE asset_id IS NOT NULL;

-- 2. EXTEND journal_entries with status lifecycle
-- Current: is_posted boolean. Add: status enum (draft, posted, locked, reversed)
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

-- Backfill existing
UPDATE public.journal_entries SET status = CASE
  WHEN is_reversal THEN 'reversed'
  WHEN is_posted THEN 'posted'
  ELSE 'draft'
END WHERE status = 'posted' AND (is_reversal OR NOT is_posted);

-- 3. EXTEND gl_accounts with control account flag
ALTER TABLE public.gl_accounts
  ADD COLUMN IF NOT EXISTS is_control_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_module text; -- 'AP','AR','asset','depreciation'

-- Mark standard control accounts
UPDATE public.gl_accounts SET is_control_account = true, control_module = 'AR' WHERE code = '1200';
UPDATE public.gl_accounts SET is_control_account = true, control_module = 'AP' WHERE code = '2100';
UPDATE public.gl_accounts SET is_control_account = true, control_module = 'asset' WHERE code = '1500';
UPDATE public.gl_accounts SET is_control_account = true, control_module = 'depreciation' WHERE code IN ('1510','6100');

-- 4. IMMUTABILITY TRIGGERS - block UPDATE/DELETE on posted entries
CREATE OR REPLACE FUNCTION public.trg_block_posted_je_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted','locked') THEN
      RAISE EXCEPTION 'Cannot delete posted/locked journal entry %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('posted','locked') AND NEW.status NOT IN ('locked','reversed') THEN
      RAISE EXCEPTION 'Posted entry % is immutable (status change % → % not allowed)', OLD.id, OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_je ON public.journal_entries;
CREATE TRIGGER trg_immutable_je
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_posted_je_mutation();

CREATE OR REPLACE FUNCTION public.trg_block_posted_jl_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.journal_entries
    WHERE id = COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);
  IF _status IN ('posted','locked') THEN
    RAISE EXCEPTION 'Cannot modify lines of posted/locked journal entry';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_jl ON public.journal_lines;
CREATE TRIGGER trg_immutable_jl
  BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_posted_jl_mutation();

-- 5. CONTROL ACCOUNT OVERRIDE TABLE
CREATE TABLE IF NOT EXISTS public.control_account_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  gl_account_id uuid NOT NULL REFERENCES public.gl_accounts(id),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  override_reason text NOT NULL,
  overridden_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.control_account_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cao_select" ON public.control_account_overrides
  FOR SELECT TO authenticated
  USING (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE POLICY "cao_insert" ON public.control_account_overrides
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

-- 6. PERIOD CLOSE ENGINE
CREATE TABLE IF NOT EXISTS public.period_close_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  fiscal_period_id uuid NOT NULL REFERENCES public.fiscal_periods(id),
  closed_by uuid NOT NULL REFERENCES auth.users(id),
  pre_close_checks jsonb NOT NULL DEFAULT '{}',
  all_checks_passed boolean NOT NULL DEFAULT false,
  closed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.period_close_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcl_select" ON public.period_close_logs
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE POLICY "pcl_insert" ON public.period_close_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

-- close_fiscal_period RPC
CREATE OR REPLACE FUNCTION public.close_fiscal_period(_org_id uuid, _period_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _checks jsonb := '{}'::jsonb;
  _pass boolean := true;
  _draft_count int;
  _unbalanced_count int;
  _tb_debit numeric;
  _tb_credit numeric;
  _depn_pending int;
BEGIN
  IF NOT is_org_admin_or_finance(auth.uid(), _org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Finance role required';
  END IF;

  -- Verify period belongs to org and is open
  IF NOT EXISTS (SELECT 1 FROM fiscal_periods WHERE id = _period_id AND organization_id = _org_id AND status = 'open') THEN
    RAISE EXCEPTION 'Period not found or not open';
  END IF;

  -- Check 1: No draft journal entries in period
  SELECT count(*) INTO _draft_count FROM journal_entries
    WHERE organization_id = _org_id AND fiscal_period_id = _period_id AND status = 'draft';
  _checks := _checks || jsonb_build_object('draft_entries', jsonb_build_object('count', _draft_count, 'passed', _draft_count = 0));
  IF _draft_count > 0 THEN _pass := false; END IF;

  -- Check 2: Trial balance balanced for period
  SELECT COALESCE(SUM(jl.debit),0), COALESCE(SUM(jl.credit),0)
    INTO _tb_debit, _tb_credit
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.organization_id = _org_id AND je.fiscal_period_id = _period_id AND je.status IN ('posted','locked');
  _checks := _checks || jsonb_build_object('trial_balance', jsonb_build_object('debit', _tb_debit, 'credit', _tb_credit, 'passed', _tb_debit = _tb_credit));
  IF _tb_debit != _tb_credit THEN _pass := false; END IF;

  -- Check 3: All depreciation posted
  SELECT count(*) INTO _depn_pending FROM asset_depreciation_entries ade
    JOIN assets a ON a.id = ade.asset_id
    WHERE a.organization_id = _org_id AND NOT ade.is_posted
    AND ade.period_date BETWEEN (SELECT start_date FROM fiscal_periods WHERE id = _period_id)
    AND (SELECT end_date FROM fiscal_periods WHERE id = _period_id);
  _checks := _checks || jsonb_build_object('depreciation_posted', jsonb_build_object('pending', _depn_pending, 'passed', _depn_pending = 0));
  IF _depn_pending > 0 THEN _pass := false; END IF;

  -- Check 4: No unbalanced entries
  SELECT count(*) INTO _unbalanced_count FROM (
    SELECT jl.journal_entry_id FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.organization_id = _org_id AND je.fiscal_period_id = _period_id
    GROUP BY jl.journal_entry_id HAVING SUM(jl.debit) != SUM(jl.credit)
  ) x;
  _checks := _checks || jsonb_build_object('unbalanced_entries', jsonb_build_object('count', _unbalanced_count, 'passed', _unbalanced_count = 0));
  IF _unbalanced_count > 0 THEN _pass := false; END IF;

  IF NOT _pass THEN
    INSERT INTO period_close_logs (organization_id, fiscal_period_id, closed_by, pre_close_checks, all_checks_passed)
    VALUES (_org_id, _period_id, auth.uid(), _checks, false);
    RETURN jsonb_build_object('success', false, 'checks', _checks);
  END IF;

  -- All checks passed: close period
  UPDATE fiscal_periods SET status = 'closed', closed_at = now(), closed_by = auth.uid()
    WHERE id = _period_id;

  -- Lock all journal entries in this period
  UPDATE journal_entries SET status = 'locked'
    WHERE organization_id = _org_id AND fiscal_period_id = _period_id AND status = 'posted';

  INSERT INTO period_close_logs (organization_id, fiscal_period_id, closed_by, pre_close_checks, all_checks_passed)
  VALUES (_org_id, _period_id, auth.uid(), _checks, true);

  INSERT INTO audit_logs (actor_id, organization_id, action, entity_type, entity_id, actor_role, metadata)
  VALUES (auth.uid(), _org_id, 'PERIOD_CLOSED', 'fiscal_period', _period_id, 'finance', _checks);

  RETURN jsonb_build_object('success', true, 'checks', _checks);
END;
$$;

-- 7. SUB-LEDGER RECONCILIATION LOG
CREATE TABLE IF NOT EXISTS public.subledger_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reconciliation_date date NOT NULL DEFAULT CURRENT_DATE,
  module text NOT NULL, -- 'AR','AP','asset','depreciation'
  gl_balance numeric NOT NULL DEFAULT 0,
  subledger_balance numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  is_reconciled boolean NOT NULL DEFAULT false,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subledger_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srl_select" ON public.subledger_reconciliation_log
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE POLICY "srl_insert" ON public.subledger_reconciliation_log
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE INDEX idx_srl_org_date ON public.subledger_reconciliation_log(organization_id, reconciliation_date);

-- 8. RECONCILE SUB-LEDGERS RPC
CREATE OR REPLACE FUNCTION public.reconcile_subledgers(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _results jsonb := '[]'::jsonb;
  _ar_gl numeric; _ar_sub numeric;
  _ap_gl numeric; _ap_sub numeric;
  _asset_gl numeric; _asset_sub numeric;
  _depn_gl numeric; _depn_sub numeric;
BEGIN
  -- AR: GL 1200 vs unpaid invoices
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO _ar_gl
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE je.organization_id = _org_id AND ga.code = '1200' AND je.status IN ('posted','locked');

  SELECT COALESCE(SUM(total_amount), 0) INTO _ar_sub
    FROM invoices WHERE organization_id = _org_id AND status IN ('sent','overdue');

  INSERT INTO subledger_reconciliation_log (organization_id, module, gl_balance, subledger_balance, variance, is_reconciled)
  VALUES (_org_id, 'AR', _ar_gl, _ar_sub, _ar_gl - _ar_sub, ABS(_ar_gl - _ar_sub) < 0.01);
  _results := _results || jsonb_build_object('module','AR','gl',_ar_gl,'sub',_ar_sub,'variance',_ar_gl-_ar_sub);

  -- AP: GL 2100 vs unpaid bills
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO _ap_gl
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE je.organization_id = _org_id AND ga.code = '2100' AND je.status IN ('posted','locked');

  SELECT COALESCE(SUM(total_amount), 0) INTO _ap_sub
    FROM bills WHERE organization_id = _org_id AND status IN ('pending','approved');

  INSERT INTO subledger_reconciliation_log (organization_id, module, gl_balance, subledger_balance, variance, is_reconciled)
  VALUES (_org_id, 'AP', _ap_gl, _ap_sub, _ap_gl - _ap_sub, ABS(_ap_gl - _ap_sub) < 0.01);
  _results := _results || jsonb_build_object('module','AP','gl',_ap_gl,'sub',_ap_sub,'variance',_ap_gl-_ap_sub);

  -- Asset: GL 1500 vs gross block
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO _asset_gl
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE je.organization_id = _org_id AND ga.code = '1500' AND je.status IN ('posted','locked');

  SELECT COALESCE(SUM(purchase_price), 0) INTO _asset_sub
    FROM assets WHERE organization_id = _org_id AND status NOT IN ('disposed','written_off');

  INSERT INTO subledger_reconciliation_log (organization_id, module, gl_balance, subledger_balance, variance, is_reconciled)
  VALUES (_org_id, 'asset', _asset_gl, _asset_sub, _asset_gl - _asset_sub, ABS(_asset_gl - _asset_sub) < 0.01);
  _results := _results || jsonb_build_object('module','asset','gl',_asset_gl,'sub',_asset_sub,'variance',_asset_gl-_asset_sub);

  -- Depreciation: GL 1510 vs accumulated depreciation
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO _depn_gl
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE je.organization_id = _org_id AND ga.code = '1510' AND je.status IN ('posted','locked');

  SELECT COALESCE(SUM(accumulated_depreciation), 0) INTO _depn_sub
    FROM assets WHERE organization_id = _org_id AND status NOT IN ('disposed','written_off');

  INSERT INTO subledger_reconciliation_log (organization_id, module, gl_balance, subledger_balance, variance, is_reconciled)
  VALUES (_org_id, 'depreciation', _depn_gl, _depn_sub, _depn_gl - _depn_sub, ABS(_depn_gl - _depn_sub) < 0.01);
  _results := _results || jsonb_build_object('module','depreciation','gl',_depn_gl,'sub',_depn_sub,'variance',_depn_gl-_depn_sub);

  RETURN jsonb_build_object('results', _results, 'reconciled_at', now());
END;
$$;

-- 9. DEPRECIATION BATCH RUN
CREATE OR REPLACE FUNCTION public.run_depreciation_batch(_org_id uuid, _period_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _asset RECORD;
  _monthly_depn numeric;
  _count int := 0;
  _pid uuid;
  _depn_expense_gl uuid;
  _accum_depn_gl uuid;
BEGIN
  IF NOT is_org_admin_or_finance(auth.uid(), _org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Finance role required';
  END IF;

  _pid := get_fiscal_period(_org_id, _period_date);
  IF _pid IS NULL THEN RAISE EXCEPTION 'No fiscal period for %', _period_date; END IF;
  IF EXISTS (SELECT 1 FROM fiscal_periods WHERE id = _pid AND status != 'open') THEN
    RAISE EXCEPTION 'Fiscal period is not open';
  END IF;

  SELECT id INTO _depn_expense_gl FROM gl_accounts WHERE organization_id = _org_id AND code = '6100' AND is_active LIMIT 1;
  SELECT id INTO _accum_depn_gl FROM gl_accounts WHERE organization_id = _org_id AND code = '1510' AND is_active LIMIT 1;

  IF _depn_expense_gl IS NULL OR _accum_depn_gl IS NULL THEN
    RAISE EXCEPTION 'Depreciation GL accounts (6100/1510) not found';
  END IF;

  FOR _asset IN
    SELECT * FROM assets
    WHERE organization_id = _org_id
    AND status = 'active'
    AND useful_life_months > 0
    AND current_book_value > salvage_value
    AND (depreciation_start_date IS NULL OR depreciation_start_date <= _period_date)
    AND NOT EXISTS (
      SELECT 1 FROM asset_depreciation_entries ade
      WHERE ade.asset_id = assets.id AND ade.period_date = _period_date
    )
  LOOP
    -- Calculate monthly depreciation based on method
    IF _asset.depreciation_method = 'straight_line' THEN
      _monthly_depn := (_asset.purchase_price - _asset.salvage_value) / _asset.useful_life_months;
    ELSIF _asset.depreciation_method = 'declining_balance' THEN
      _monthly_depn := (_asset.current_book_value * 2.0 / _asset.useful_life_months);
    ELSE
      _monthly_depn := (_asset.purchase_price - _asset.salvage_value) / _asset.useful_life_months;
    END IF;

    -- Cap at remaining depreciable amount
    IF _monthly_depn > (_asset.current_book_value - _asset.salvage_value) THEN
      _monthly_depn := _asset.current_book_value - _asset.salvage_value;
    END IF;

    IF _monthly_depn <= 0 THEN CONTINUE; END IF;

    -- Create depreciation entry
    INSERT INTO asset_depreciation_entries (asset_id, period_date, depreciation_amount, accumulated_depreciation, book_value_after, is_posted, organization_id)
    VALUES (_asset.id, _period_date, _monthly_depn, _asset.accumulated_depreciation + _monthly_depn, _asset.current_book_value - _monthly_depn, true, _org_id);

    -- Update asset
    UPDATE assets SET
      accumulated_depreciation = accumulated_depreciation + _monthly_depn,
      current_book_value = current_book_value - _monthly_depn,
      updated_at = now()
    WHERE id = _asset.id;

    -- Post journal: Dr Depreciation Expense, Cr Accumulated Depreciation
    PERFORM post_journal_entry(
      _org_id, _period_date,
      'Depreciation: ' || _asset.name || ' (' || to_char(_period_date, 'Mon YYYY') || ')',
      'depreciation', _asset.id,
      jsonb_build_array(
        jsonb_build_object('gl_account_id', _depn_expense_gl, 'debit', _monthly_depn, 'credit', 0, 'description', 'Depreciation expense - ' || _asset.name),
        jsonb_build_object('gl_account_id', _accum_depn_gl, 'debit', 0, 'credit', _monthly_depn, 'description', 'Accumulated depreciation - ' || _asset.name)
      )
    );

    _count := _count + 1;
  END LOOP;

  INSERT INTO audit_logs (actor_id, organization_id, action, entity_type, entity_id, actor_role, metadata)
  VALUES (auth.uid(), _org_id, 'DEPRECIATION_BATCH_RUN', 'depreciation', _org_id, 'finance',
    jsonb_build_object('period_date', _period_date, 'assets_processed', _count));

  RETURN jsonb_build_object('success', true, 'assets_processed', _count, 'period_date', _period_date);
END;
$$;

-- 10. CONTROL ACCOUNT VALIDATION in post_journal_entry
-- We need to update post_journal_entry to check control accounts
CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_org_id uuid, p_date date, p_memo text, p_doc_type text, p_doc_id uuid, p_lines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _jid uuid; _pid uuid; _seq text; _td numeric:=0; _tc numeric:=0;
  _l jsonb; _gid uuid; _gorg uuid; _os text;
  _is_control boolean; _ctrl_module text;
  _allowed_sources text[] := ARRAY['invoice','bill','expense','depreciation','asset_disposal','reversal','capex','payroll','reimbursement'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  SELECT org_state INTO _os FROM organizations WHERE id=p_org_id;
  IF _os IS NULL THEN RAISE EXCEPTION 'Org not found'; END IF;
  IF _os IN ('locked','archived','suspended') THEN RAISE EXCEPTION 'Org % blocked', _os; END IF;
  IF NOT is_org_admin_or_finance(auth.uid(),p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Finance role required'; END IF;

  -- Idempotency check
  IF p_doc_id IS NOT NULL THEN
    SELECT id INTO _jid FROM journal_entries WHERE organization_id=p_org_id AND source_type=p_doc_type AND source_id=p_doc_id;
    IF FOUND THEN RETURN _jid; END IF;
  END IF;

  _pid := get_fiscal_period(p_org_id, p_date);
  IF _pid IS NULL THEN RAISE EXCEPTION 'No period for %', p_date; END IF;
  IF EXISTS (SELECT 1 FROM fiscal_periods WHERE id=_pid AND status!='open') THEN
    RAISE EXCEPTION 'Period closed for %', p_date; END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines)<2 THEN RAISE EXCEPTION 'Min 2 lines'; END IF;

  FOR _l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    _td:=_td+COALESCE((_l->>'debit')::numeric,0); _tc:=_tc+COALESCE((_l->>'credit')::numeric,0);
    _gid:=(_l->>'gl_account_id')::uuid;
    SELECT organization_id, is_control_account, control_module INTO _gorg, _is_control, _ctrl_module
      FROM gl_accounts WHERE id=_gid AND is_active;
    IF _gorg IS NULL THEN RAISE EXCEPTION 'GL % invalid', _gid; END IF;
    IF _gorg!=p_org_id THEN RAISE EXCEPTION 'Cross-tenant blocked'; END IF;

    -- Control account enforcement: only system modules can post to control accounts
    IF _is_control AND p_doc_type = 'manual' THEN
      RAISE EXCEPTION 'Manual journal to control account % blocked. Use override if authorized.', _gid;
    END IF;

    IF COALESCE((_l->>'debit')::numeric,0)<0 OR COALESCE((_l->>'credit')::numeric,0)<0 THEN RAISE EXCEPTION 'Negative'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)>0 AND COALESCE((_l->>'credit')::numeric,0)>0 THEN RAISE EXCEPTION 'Both D+C'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)=0 AND COALESCE((_l->>'credit')::numeric,0)=0 THEN RAISE EXCEPTION 'Zero line'; END IF;
  END LOOP;

  IF _td!=_tc THEN RAISE EXCEPTION 'Unbalanced D(%)!=C(%)',_td,_tc; END IF;
  IF _td=0 THEN RAISE EXCEPTION 'Zero total'; END IF;

  _seq := next_document_sequence(p_org_id, p_doc_type);
  INSERT INTO journal_entries (organization_id,entry_date,memo,source_type,source_id,is_reversal,created_by,is_posted,status,document_sequence_number,fiscal_period_id)
  VALUES (p_org_id,p_date,p_memo,p_doc_type,p_doc_id,false,auth.uid(),true,'posted',_seq,_pid) RETURNING id INTO _jid;

  INSERT INTO journal_lines (journal_entry_id,gl_account_id,debit,credit,description,cost_center,department,asset_id)
  SELECT _jid,(l->>'gl_account_id')::uuid,COALESCE((l->>'debit')::numeric,0),COALESCE((l->>'credit')::numeric,0),
    l->>'description',l->>'cost_center',l->>'department',(l->>'asset_id')::uuid
  FROM jsonb_array_elements(p_lines) AS l;

  INSERT INTO audit_logs (actor_id,organization_id,action,entity_type,entity_id,actor_role,metadata)
  VALUES (auth.uid(),p_org_id,'JOURNAL_POSTED','journal_entry',_jid,'finance',
    jsonb_build_object('doc_type',p_doc_type,'seq',_seq,'total',_td,'lines',jsonb_array_length(p_lines),'period',_pid));

  RETURN _jid;
END;
$$;

-- 11. MANUAL OVERRIDE posting (with audit trail)
CREATE OR REPLACE FUNCTION public.post_journal_with_override(
  p_org_id uuid, p_date date, p_memo text, p_doc_type text, p_doc_id uuid, p_lines jsonb, p_override_reason text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _jid uuid; _l jsonb; _gid uuid; _is_ctrl boolean;
BEGIN
  -- Must be admin for override
  IF NOT is_super_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    AND ur.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Admin role required for control account override';
  END IF;

  IF p_override_reason IS NULL OR length(trim(p_override_reason)) < 10 THEN
    RAISE EXCEPTION 'Override reason must be at least 10 characters';
  END IF;

  -- Temporarily allow by setting doc_type to override source
  _jid := post_journal_entry(p_org_id, p_date, p_memo, 'override_' || p_doc_type, p_doc_id, p_lines);

  -- Log override for each control account line
  FOR _l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    _gid := (_l->>'gl_account_id')::uuid;
    SELECT is_control_account INTO _is_ctrl FROM gl_accounts WHERE id = _gid;
    IF _is_ctrl THEN
      INSERT INTO control_account_overrides (organization_id, gl_account_id, journal_entry_id, override_reason, overridden_by)
      VALUES (p_org_id, _gid, _jid, p_override_reason, auth.uid());
    END IF;
  END LOOP;

  RETURN _jid;
END;
$$;

-- 12. Performance indexes
CREATE INDEX IF NOT EXISTS idx_je_org_period_status ON public.journal_entries(organization_id, fiscal_period_id, status);
CREATE INDEX IF NOT EXISTS idx_jl_entry_account ON public.journal_lines(journal_entry_id, gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ade_asset_period ON public.asset_depreciation_entries(asset_id, period_date);
CREATE INDEX IF NOT EXISTS idx_cao_org ON public.control_account_overrides(organization_id);
CREATE INDEX IF NOT EXISTS idx_srl_org ON public.subledger_reconciliation_log(organization_id);
