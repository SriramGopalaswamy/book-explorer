
-- ============================================================
-- GRX10 FINANCIAL CORE HARDENING — CLEAN MIGRATION
-- ============================================================

-- STEP 0: Remove ALL old triggers and functions that block changes
DROP TRIGGER IF EXISTS trg_block_journal_entry_delete ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_block_journal_entry_update ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_block_journal_line_delete ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_block_journal_line_update ON public.journal_lines;
DROP FUNCTION IF EXISTS public.block_journal_entry_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.block_journal_line_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.post_invoice_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS public.post_bill_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS public.post_expense_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS public.post_asset_disposal_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_posted_edit() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_posted_delete() CASCADE;
DROP FUNCTION IF EXISTS public.validate_journal_entry_balance() CASCADE;
-- Drop old posting helpers (param name conflict)
DROP FUNCTION IF EXISTS public.post_invoice_journal(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.post_invoice_payment_journal(uuid) CASCADE;

-- PHASE 1: Lock down financial_records
DROP POLICY IF EXISTS "Org finance can manage financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Users can manage own financial records" ON public.financial_records;
CREATE POLICY "financial_records_select_finance" ON public.financial_records FOR SELECT
USING (is_org_admin_or_finance(auth.uid(), organization_id));
CREATE POLICY "financial_records_select_own" ON public.financial_records FOR SELECT
USING (auth.uid() = user_id AND organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "financial_records_insert_finance" ON public.financial_records FOR INSERT
WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

-- PHASE 2: Schema additions
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS is_posted boolean NOT NULL DEFAULT true;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS document_sequence_number text;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS fiscal_period_id uuid;
ALTER TABLE public.gl_accounts ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
UPDATE public.gl_accounts SET is_locked = true WHERE is_system = true;

-- PHASE 3: Fiscal periods
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  financial_year_id uuid NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  period_number int NOT NULL, period_name text NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open', closed_at timestamptz, closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_periods_status_check CHECK (status IN ('open','closed','locked')),
  CONSTRAINT fiscal_periods_org_year_period_unique UNIQUE (organization_id, financial_year_id, period_number)
);
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_periods_select" ON public.fiscal_periods FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id) OR is_super_admin(auth.uid()));
CREATE POLICY "fiscal_periods_manage" ON public.fiscal_periods FOR ALL TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()))
WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_org ON public.fiscal_periods(organization_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON public.fiscal_periods(organization_id, start_date, end_date);

ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_fiscal_period_id_fkey
FOREIGN KEY (fiscal_period_id) REFERENCES public.fiscal_periods(id);

INSERT INTO public.financial_years (organization_id, start_date, end_date, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', '2015-04-01', '2016-03-31', false),
  ('00000000-0000-0000-0000-000000000001', '2025-04-01', '2026-03-31', true)
ON CONFLICT DO NOTHING;

DO $$
DECLARE _fy RECORD; _ms date; _me date; _pn int;
BEGIN
  FOR _fy IN SELECT id, organization_id, start_date, end_date FROM financial_years
             WHERE organization_id = '00000000-0000-0000-0000-000000000001' LOOP
    _pn := 1; _ms := _fy.start_date;
    WHILE _ms < _fy.end_date LOOP
      _me := LEAST((_ms + interval '1 month' - interval '1 day')::date, _fy.end_date);
      INSERT INTO fiscal_periods (organization_id, financial_year_id, period_number, period_name, start_date, end_date, status)
      VALUES (_fy.organization_id, _fy.id, _pn, to_char(_ms, 'Mon YYYY'), _ms, _me,
        CASE WHEN _me < CURRENT_DATE THEN 'closed' ELSE 'open' END)
      ON CONFLICT DO NOTHING;
      _pn := _pn + 1; _ms := (_ms + interval '1 month')::date;
    END LOOP;
  END LOOP;
END; $$;

-- PHASE 4: Document sequences
CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  document_type text NOT NULL, prefix text NOT NULL DEFAULT '',
  next_number bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_sequences_org_type_unique UNIQUE (organization_id, document_type)
);
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_sequences_select" ON public.document_sequences FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id) OR is_super_admin(auth.uid()));
CREATE POLICY "document_sequences_manage" ON public.document_sequences FOR ALL TO authenticated
USING (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()))
WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id) OR is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_document_sequences_org ON public.document_sequences(organization_id);

INSERT INTO document_sequences (organization_id, document_type, prefix, next_number) VALUES
  ('00000000-0000-0000-0000-000000000001', 'invoice', 'JE-INV-', 1),
  ('00000000-0000-0000-0000-000000000001', 'invoice_payment', 'JE-PAY-', 1),
  ('00000000-0000-0000-0000-000000000001', 'bill', 'JE-BIL-', 1),
  ('00000000-0000-0000-0000-000000000001', 'bill_payment', 'JE-BPY-', 1),
  ('00000000-0000-0000-0000-000000000001', 'journal_manual', 'JE-MAN-', 1),
  ('00000000-0000-0000-0000-000000000001', 'expense', 'JE-EXP-', 1),
  ('00000000-0000-0000-0000-000000000001', 'asset_disposal', 'JE-DSP-', 1),
  ('00000000-0000-0000-0000-000000000001', 'reversal', 'JE-REV-', 1)
ON CONFLICT DO NOTHING;

-- PHASE 5: Backfill BEFORE triggers
UPDATE journal_entries je SET fiscal_period_id = fp.id
FROM fiscal_periods fp WHERE je.organization_id = fp.organization_id
  AND je.entry_date >= fp.start_date AND je.entry_date <= fp.end_date AND je.fiscal_period_id IS NULL;

DO $$
DECLARE _je RECORD; _seq bigint; _pfx text;
BEGIN
  FOR _je IN SELECT id, organization_id, source_type FROM journal_entries
             WHERE document_sequence_number IS NULL ORDER BY created_at LOOP
    SELECT prefix, next_number INTO _pfx, _seq FROM document_sequences
    WHERE organization_id = _je.organization_id AND document_type = _je.source_type FOR UPDATE;
    IF _pfx IS NOT NULL THEN
      UPDATE journal_entries SET document_sequence_number = _pfx || lpad(_seq::text, 6, '0') WHERE id = _je.id;
      UPDATE document_sequences SET next_number = _seq + 1, updated_at = now()
      WHERE organization_id = _je.organization_id AND document_type = _je.source_type;
    END IF;
  END LOOP;
END; $$;

-- PHASE 6: Immutability triggers (AFTER backfill)
CREATE OR REPLACE FUNCTION public.block_posted_journal_entry_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_posted = true THEN
    RAISE EXCEPTION 'Cannot modify posted journal entry %. Create a reversal instead.', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.block_posted_journal_line_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ip boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN SELECT is_posted INTO _ip FROM journal_entries WHERE id = OLD.journal_entry_id;
  ELSE SELECT is_posted INTO _ip FROM journal_entries WHERE id = NEW.journal_entry_id; END IF;
  IF _ip THEN RAISE EXCEPTION 'Cannot modify lines of posted entry. Create a reversal.'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;

CREATE TRIGGER trg_block_je_mutation BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION block_posted_journal_entry_mutation();
CREATE TRIGGER trg_block_jl_mutation BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION block_posted_journal_line_mutation();

DROP POLICY IF EXISTS "journal_entries_insert" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_lines_insert" ON public.journal_lines;

-- PHASE 7: GL account protection
CREATE OR REPLACE FUNCTION public.protect_gl_account_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_locked THEN RAISE EXCEPTION 'Cannot delete locked GL account %', OLD.code; END IF;
  IF EXISTS (SELECT 1 FROM journal_lines WHERE gl_account_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION 'GL account % has journal lines', OLD.code; END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER trg_protect_gl_delete BEFORE DELETE ON gl_accounts
FOR EACH ROW EXECUTE FUNCTION protect_gl_account_deletion();

CREATE OR REPLACE FUNCTION public.protect_gl_account_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_locked AND (OLD.code!=NEW.code OR OLD.name!=NEW.name OR OLD.account_type!=NEW.account_type
     OR OLD.normal_balance!=NEW.normal_balance OR OLD.is_system!=NEW.is_system) THEN
    RAISE EXCEPTION 'Cannot modify core fields of locked GL account %', OLD.code;
  END IF; RETURN NEW;
END; $$;
CREATE TRIGGER trg_protect_gl_update BEFORE UPDATE ON gl_accounts
FOR EACH ROW EXECUTE FUNCTION protect_gl_account_update();

-- PHASE 8: Helper functions
CREATE OR REPLACE FUNCTION public.check_ledger_balance()
RETURNS TABLE(total_debits numeric, total_credits numeric, is_balanced boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(jl.debit),0), COALESCE(SUM(jl.credit),0),
    COALESCE(SUM(jl.debit),0) = COALESCE(SUM(jl.credit),0)
  FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id WHERE je.is_posted = true;
$$;

CREATE OR REPLACE FUNCTION public.next_document_sequence(_org_id uuid, _doc_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _pfx text; _num bigint;
BEGIN
  UPDATE document_sequences SET next_number = next_number+1, updated_at = now()
  WHERE organization_id = _org_id AND document_type = _doc_type
  RETURNING prefix, next_number-1 INTO _pfx, _num;
  IF NOT FOUND THEN
    INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
    VALUES (_org_id, _doc_type, 'JE-'||upper(left(_doc_type,3))||'-', 2)
    RETURNING prefix, 1 INTO _pfx, _num;
  END IF;
  RETURN _pfx || lpad(_num::text, 6, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.get_fiscal_period(_org_id uuid, _d date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM fiscal_periods WHERE organization_id=_org_id AND _d>=start_date AND _d<=end_date LIMIT 1;
$$;

-- PHASE 9: Unified posting engine
CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_org_id uuid, p_doc_type text, p_doc_id uuid, p_date date, p_memo text, p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _jid uuid; _pid uuid; _seq text; _td numeric:=0; _tc numeric:=0;
  _l jsonb; _gid uuid; _gorg uuid; _os text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  SELECT org_state INTO _os FROM organizations WHERE id=p_org_id;
  IF _os IS NULL THEN RAISE EXCEPTION 'Org not found'; END IF;
  IF _os IN ('locked','archived','suspended') THEN RAISE EXCEPTION 'Org % blocked', _os; END IF;
  IF NOT is_org_admin_or_finance(auth.uid(),p_org_id) AND NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Finance role required'; END IF;
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
    SELECT organization_id INTO _gorg FROM gl_accounts WHERE id=_gid AND is_active;
    IF _gorg IS NULL THEN RAISE EXCEPTION 'GL % invalid', _gid; END IF;
    IF _gorg!=p_org_id THEN RAISE EXCEPTION 'Cross-tenant blocked'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)<0 OR COALESCE((_l->>'credit')::numeric,0)<0 THEN RAISE EXCEPTION 'Negative'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)>0 AND COALESCE((_l->>'credit')::numeric,0)>0 THEN RAISE EXCEPTION 'Both D+C'; END IF;
    IF COALESCE((_l->>'debit')::numeric,0)=0 AND COALESCE((_l->>'credit')::numeric,0)=0 THEN RAISE EXCEPTION 'Zero line'; END IF;
  END LOOP;
  IF _td!=_tc THEN RAISE EXCEPTION 'Unbalanced D(%)!=C(%)',_td,_tc; END IF;
  IF _td=0 THEN RAISE EXCEPTION 'Zero total'; END IF;
  _seq := next_document_sequence(p_org_id, p_doc_type);
  INSERT INTO journal_entries (organization_id,entry_date,memo,source_type,source_id,is_reversal,created_by,is_posted,document_sequence_number,fiscal_period_id)
  VALUES (p_org_id,p_date,p_memo,p_doc_type,p_doc_id,false,auth.uid(),true,_seq,_pid) RETURNING id INTO _jid;
  INSERT INTO journal_lines (journal_entry_id,gl_account_id,debit,credit,description)
  SELECT _jid,(l->>'gl_account_id')::uuid,COALESCE((l->>'debit')::numeric,0),COALESCE((l->>'credit')::numeric,0),l->>'description'
  FROM jsonb_array_elements(p_lines) AS l;
  INSERT INTO audit_logs (actor_id,organization_id,action,entity_type,entity_id,actor_role,metadata)
  VALUES (auth.uid(),p_org_id,'JOURNAL_POSTED','journal_entry',_jid,'finance',
    jsonb_build_object('doc_type',p_doc_type,'seq',_seq,'total',_td,'lines',jsonb_array_length(p_lines),'period',_pid));
  RETURN _jid;
END; $$;

-- PHASE 10: Reversal engine
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_eid uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _o RECORD; _rid uuid; _pid uuid; _seq text;
BEGIN
  SELECT * INTO _o FROM journal_entries WHERE id=p_eid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF NOT is_org_admin_or_finance(auth.uid(),_o.organization_id) AND NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT _o.is_posted THEN RAISE EXCEPTION 'Not posted'; END IF;
  IF _o.is_reversal THEN RAISE EXCEPTION 'Cannot reverse reversal'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reversed_entry_id=p_eid) THEN RAISE EXCEPTION 'Already reversed'; END IF;
  PERFORM 1 FROM organizations WHERE id=_o.organization_id AND org_state NOT IN ('locked','archived','suspended');
  IF NOT FOUND THEN RAISE EXCEPTION 'Org locked'; END IF;
  _pid := get_fiscal_period(_o.organization_id, CURRENT_DATE);
  IF _pid IS NULL THEN RAISE EXCEPTION 'No period'; END IF;
  IF EXISTS (SELECT 1 FROM fiscal_periods WHERE id=_pid AND status!='open') THEN RAISE EXCEPTION 'Period closed'; END IF;
  _seq := next_document_sequence(_o.organization_id, 'reversal');
  INSERT INTO journal_entries (organization_id,entry_date,memo,source_type,source_id,is_reversal,reversed_entry_id,created_by,is_posted,document_sequence_number,fiscal_period_id)
  VALUES (_o.organization_id,CURRENT_DATE,'REVERSAL: '||COALESCE(_o.memo,_o.source_type),'reversal',_o.source_id,true,p_eid,auth.uid(),true,_seq,_pid) RETURNING id INTO _rid;
  INSERT INTO journal_lines (journal_entry_id,gl_account_id,debit,credit,description)
  SELECT _rid,gl_account_id,credit,debit,'REVERSAL: '||COALESCE(description,'') FROM journal_lines WHERE journal_entry_id=p_eid;
  INSERT INTO audit_logs (actor_id,organization_id,action,entity_type,entity_id,actor_role,metadata)
  VALUES (auth.uid(),_o.organization_id,'JOURNAL_REVERSED','journal_entry',_rid,'finance',
    jsonb_build_object('original',p_eid,'seq',_seq));
  RETURN _rid;
END; $$;

-- PHASE 11: Refactored invoice posting helpers (using unified engine)
CREATE OR REPLACE FUNCTION public.post_invoice_journal(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _i RECORD; _ar uuid; _rv uuid;
BEGIN
  SELECT * INTO _i FROM invoices WHERE id=_invoice_id; IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  _ar:=get_gl_account_id(_i.organization_id,'1200'); _rv:=get_gl_account_id(_i.organization_id,'4100');
  IF _ar IS NULL OR _rv IS NULL THEN RAISE EXCEPTION 'GL not seeded'; END IF;
  RETURN post_journal_entry(_i.organization_id,'invoice',_i.id,COALESCE(_i.invoice_date::date,CURRENT_DATE),
    'Invoice '||_i.invoice_number||' - '||_i.client_name,
    jsonb_build_array(
      jsonb_build_object('gl_account_id',_ar,'debit',COALESCE(_i.total_amount,_i.amount),'credit',0,'description','AR: '||_i.invoice_number),
      jsonb_build_object('gl_account_id',_rv,'debit',0,'credit',COALESCE(_i.total_amount,_i.amount),'description','Revenue: '||_i.invoice_number)));
END; $$;

CREATE OR REPLACE FUNCTION public.post_invoice_payment_journal(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _i RECORD; _c uuid; _ar uuid;
BEGIN
  SELECT * INTO _i FROM invoices WHERE id=_invoice_id; IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  _c:=get_gl_account_id(_i.organization_id,'1100'); _ar:=get_gl_account_id(_i.organization_id,'1200');
  IF _c IS NULL OR _ar IS NULL THEN RAISE EXCEPTION 'GL not seeded'; END IF;
  RETURN post_journal_entry(_i.organization_id,'invoice_payment',_i.id,CURRENT_DATE,
    'Payment: Invoice '||_i.invoice_number,
    jsonb_build_array(
      jsonb_build_object('gl_account_id',_c,'debit',COALESCE(_i.total_amount,_i.amount),'credit',0,'description','Cash in: '||_i.invoice_number),
      jsonb_build_object('gl_account_id',_ar,'debit',0,'credit',COALESCE(_i.total_amount,_i.amount),'description','AR cleared: '||_i.invoice_number)));
END; $$;
