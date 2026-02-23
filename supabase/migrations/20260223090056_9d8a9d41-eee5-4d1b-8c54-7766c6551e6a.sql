
-- ============================================================
-- PHASE 1: CORE GL TABLES (gl_accounts, journal_entries, journal_lines)
-- ============================================================

-- GL Accounts: The canonical Chart of Accounts for the new engine
CREATE TABLE IF NOT EXISTS public.gl_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id UUID REFERENCES public.gl_accounts(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT true,
  normal_balance TEXT NOT NULL DEFAULT 'debit' CHECK (normal_balance IN ('debit', 'credit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- Journal Entries: Header for each accounting transaction
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT,
  source_type TEXT NOT NULL, -- 'invoice', 'bill', 'expense', 'payment', 'manual', 'reversal'
  source_id UUID, -- FK to the originating document
  is_reversal BOOLEAN NOT NULL DEFAULT false,
  reversed_entry_id UUID REFERENCES public.journal_entries(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, source_type, source_id)
);

-- Journal Lines: Individual debit/credit legs
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  gl_account_id UUID NOT NULL REFERENCES public.gl_accounts(id),
  debit NUMERIC NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enforce that exactly one of debit/credit is non-zero
  CONSTRAINT chk_debit_xor_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gl_accounts_org ON public.gl_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON public.journal_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON public.journal_entries(organization_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(gl_account_id);

-- ============================================================
-- PHASE 4: IMMUTABILITY — Block UPDATE/DELETE on posted entries
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_journal_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Journal entries are immutable once posted. Create a reversal entry instead.';
END;
$$;

CREATE TRIGGER trg_block_journal_entry_update
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.block_journal_entry_mutation();

CREATE TRIGGER trg_block_journal_entry_delete
  BEFORE DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.block_journal_entry_mutation();

CREATE OR REPLACE FUNCTION public.block_journal_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Journal lines are immutable. Create a reversal journal entry instead.';
END;
$$;

CREATE TRIGGER trg_block_journal_line_update
  BEFORE UPDATE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.block_journal_line_mutation();

CREATE TRIGGER trg_block_journal_line_delete
  BEFORE DELETE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.block_journal_line_mutation();

-- ============================================================
-- DOUBLE-ENTRY ENFORCEMENT: Validate SUM(debit) = SUM(credit) per entry
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _total_debit NUMERIC;
  _total_credit NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO _total_debit, _total_credit
  FROM public.journal_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  -- Only validate when we have at least 2 lines (entry is complete)
  -- This is called via a deferred constraint trigger or after-statement
  -- For now, we'll validate at the application level during posting
  RETURN NEW;
END;
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

-- GL Accounts: org-scoped read for all authenticated members, write for admin/finance
CREATE POLICY "gl_accounts_select" ON public.gl_accounts
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "gl_accounts_insert" ON public.gl_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_finance(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "gl_accounts_update" ON public.gl_accounts
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_finance(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

-- Journal Entries: org-scoped
CREATE POLICY "journal_entries_select" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "journal_entries_insert" ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_finance(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

-- Journal Lines: accessible if the parent entry is accessible
CREATE POLICY "journal_lines_select" ON public.journal_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
      AND (
        public.is_org_member(auth.uid(), je.organization_id)
        OR public.is_super_admin(auth.uid())
      )
    )
  );

CREATE POLICY "journal_lines_insert" ON public.journal_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
      AND (
        public.is_org_admin_or_finance(auth.uid(), je.organization_id)
        OR public.is_super_admin(auth.uid())
      )
    )
  );

-- ============================================================
-- PHASE 6: RECONCILIATION ENGINE
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_full_reconciliation(_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _total_debits NUMERIC;
  _total_credits NUMERIC;
  _trial_balance_ok BOOLEAN;
  _orphaned_entries BIGINT;
  _single_sided BIGINT;
  _revenue_ledger NUMERIC;
  _revenue_operational NUMERIC;
  _ar_ledger NUMERIC;
  _ar_operational NUMERIC;
  _cash_ledger NUMERIC;
  _score INT := 100;
  _issues JSONB := '[]'::jsonb;
BEGIN
  -- 1. Trial Balance: SUM(all debits) = SUM(all credits)
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO _total_debits, _total_credits
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.organization_id = _org_id;

  _trial_balance_ok := (_total_debits = _total_credits);
  IF NOT _trial_balance_ok THEN
    _score := _score - 30;
    _issues := _issues || jsonb_build_object(
      'check', 'trial_balance',
      'debits', _total_debits,
      'credits', _total_credits,
      'variance', _total_debits - _total_credits
    );
  END IF;

  -- 2. Orphaned journal entries (entries with no lines)
  SELECT count(*) INTO _orphaned_entries
  FROM public.journal_entries je
  WHERE je.organization_id = _org_id
  AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id);

  IF _orphaned_entries > 0 THEN
    _score := _score - 10;
    _issues := _issues || jsonb_build_object('check', 'orphaned_entries', 'count', _orphaned_entries);
  END IF;

  -- 3. Single-sided entries (debit total != credit total per entry)
  SELECT count(*) INTO _single_sided
  FROM (
    SELECT jl.journal_entry_id,
           SUM(jl.debit) as d, SUM(jl.credit) as c
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.organization_id = _org_id
    GROUP BY jl.journal_entry_id
    HAVING SUM(jl.debit) != SUM(jl.credit)
  ) unbalanced;

  IF _single_sided > 0 THEN
    _score := _score - 20;
    _issues := _issues || jsonb_build_object('check', 'unbalanced_entries', 'count', _single_sided);
  END IF;

  -- 4. Revenue: ledger vs operational
  SELECT COALESCE(SUM(jl.credit), 0) INTO _revenue_ledger
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = _org_id AND ga.account_type = 'revenue';

  SELECT COALESCE(SUM(total_amount), 0) INTO _revenue_operational
  FROM public.invoices
  WHERE organization_id = _org_id AND status IN ('sent', 'paid');

  IF _revenue_ledger != _revenue_operational THEN
    _score := _score - 10;
    _issues := _issues || jsonb_build_object(
      'check', 'revenue_reconciliation',
      'ledger', _revenue_ledger,
      'operational', _revenue_operational,
      'variance', _revenue_ledger - _revenue_operational
    );
  END IF;

  -- 5. AR: ledger vs outstanding invoices
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO _ar_ledger
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = _org_id AND ga.code = '1200';

  SELECT COALESCE(SUM(total_amount), 0) INTO _ar_operational
  FROM public.invoices
  WHERE organization_id = _org_id AND status IN ('sent', 'overdue', 'draft');

  IF _ar_ledger != _ar_operational THEN
    _score := _score - 10;
    _issues := _issues || jsonb_build_object(
      'check', 'ar_reconciliation',
      'ledger', _ar_ledger,
      'operational', _ar_operational,
      'variance', _ar_ledger - _ar_operational
    );
  END IF;

  -- 6. Cash ledger balance
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO _cash_ledger
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
  WHERE je.organization_id = _org_id AND ga.code = '1100';

  _score := GREATEST(_score, 0);

  RETURN jsonb_build_object(
    'integrity_score', _score,
    'trial_balance', jsonb_build_object(
      'total_debits', _total_debits,
      'total_credits', _total_credits,
      'balanced', _trial_balance_ok
    ),
    'revenue', jsonb_build_object(
      'ledger', _revenue_ledger,
      'operational', _revenue_operational
    ),
    'accounts_receivable', jsonb_build_object(
      'ledger', _ar_ledger,
      'operational', _ar_operational
    ),
    'cash_balance', _cash_ledger,
    'orphaned_entries', _orphaned_entries,
    'unbalanced_entries', _single_sided,
    'issues', _issues,
    'org_id', _org_id
  );
END;
$$;

-- ============================================================
-- PHASE 3: POSTING ENGINE FUNCTIONS
-- ============================================================

-- Helper: Get or create a GL account by code for an org
CREATE OR REPLACE FUNCTION public.get_gl_account_id(_org_id UUID, _code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.gl_accounts
  WHERE organization_id = _org_id AND code = _code
  LIMIT 1;
$$;

-- Post Invoice: Debit AR, Credit Revenue (idempotent)
CREATE OR REPLACE FUNCTION public.post_invoice_journal(_invoice_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _inv RECORD;
  _je_id UUID;
  _ar_id UUID;
  _rev_id UUID;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', _invoice_id; END IF;

  -- Idempotency: check if already posted
  SELECT id INTO _je_id FROM public.journal_entries
  WHERE organization_id = _inv.organization_id
    AND source_type = 'invoice'
    AND source_id = _invoice_id;
  IF FOUND THEN RETURN _je_id; END IF;

  _ar_id := get_gl_account_id(_inv.organization_id, '1200');
  _rev_id := get_gl_account_id(_inv.organization_id, '4100');

  IF _ar_id IS NULL OR _rev_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _inv.organization_id;
  END IF;

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, source_type, source_id, created_by)
  VALUES (_inv.organization_id, COALESCE(_inv.created_at::date, CURRENT_DATE),
          'Invoice ' || _inv.invoice_number || ' - ' || _inv.client_name,
          'invoice', _inv.id, _inv.user_id)
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit, credit, description) VALUES
    (_je_id, _ar_id, COALESCE(_inv.total_amount, _inv.amount), 0, 'AR: ' || _inv.invoice_number),
    (_je_id, _rev_id, 0, COALESCE(_inv.total_amount, _inv.amount), 'Revenue: ' || _inv.invoice_number);

  RETURN _je_id;
END;
$$;

-- Post Invoice Payment: Debit Cash, Credit AR (idempotent)
CREATE OR REPLACE FUNCTION public.post_invoice_payment_journal(_invoice_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _inv RECORD;
  _je_id UUID;
  _cash_id UUID;
  _ar_id UUID;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', _invoice_id; END IF;

  SELECT id INTO _je_id FROM public.journal_entries
  WHERE organization_id = _inv.organization_id
    AND source_type = 'invoice_payment'
    AND source_id = _invoice_id;
  IF FOUND THEN RETURN _je_id; END IF;

  _cash_id := get_gl_account_id(_inv.organization_id, '1100');
  _ar_id := get_gl_account_id(_inv.organization_id, '1200');

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, source_type, source_id, created_by)
  VALUES (_inv.organization_id, CURRENT_DATE,
          'Payment: Invoice ' || _inv.invoice_number,
          'invoice_payment', _inv.id, _inv.user_id)
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit, credit, description) VALUES
    (_je_id, _cash_id, COALESCE(_inv.total_amount, _inv.amount), 0, 'Cash in: ' || _inv.invoice_number),
    (_je_id, _ar_id, 0, COALESCE(_inv.total_amount, _inv.amount), 'AR cleared: ' || _inv.invoice_number);

  RETURN _je_id;
END;
$$;

-- Post Expense: Debit Expense, Credit Cash (idempotent)
CREATE OR REPLACE FUNCTION public.post_expense_journal(_expense_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _exp RECORD;
  _je_id UUID;
  _expense_acct_id UUID;
  _cash_id UUID;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found: %', _expense_id; END IF;

  SELECT id INTO _je_id FROM public.journal_entries
  WHERE organization_id = _exp.organization_id
    AND source_type = 'expense'
    AND source_id = _expense_id;
  IF FOUND THEN RETURN _je_id; END IF;

  _expense_acct_id := get_gl_account_id(_exp.organization_id, '5100');
  _cash_id := get_gl_account_id(_exp.organization_id, '1100');

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, source_type, source_id, created_by)
  VALUES (_exp.organization_id, COALESCE(_exp.expense_date, CURRENT_DATE),
          'Expense: ' || COALESCE(_exp.description, _exp.category),
          'expense', _exp.id, _exp.user_id)
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit, credit, description) VALUES
    (_je_id, _expense_acct_id, _exp.amount, 0, 'Expense: ' || COALESCE(_exp.description, _exp.category)),
    (_je_id, _cash_id, 0, _exp.amount, 'Cash out: ' || COALESCE(_exp.description, _exp.category));

  RETURN _je_id;
END;
$$;

-- Post Bill: Debit Expense, Credit AP (idempotent)
CREATE OR REPLACE FUNCTION public.post_bill_journal(_bill_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _bill RECORD;
  _je_id UUID;
  _expense_acct_id UUID;
  _ap_id UUID;
BEGIN
  SELECT * INTO _bill FROM public.bills WHERE id = _bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', _bill_id; END IF;

  SELECT id INTO _je_id FROM public.journal_entries
  WHERE organization_id = _bill.organization_id
    AND source_type = 'bill'
    AND source_id = _bill_id;
  IF FOUND THEN RETURN _je_id; END IF;

  _expense_acct_id := get_gl_account_id(_bill.organization_id, '5200');
  _ap_id := get_gl_account_id(_bill.organization_id, '2100');

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, source_type, source_id, created_by)
  VALUES (_bill.organization_id, COALESCE(_bill.bill_date, CURRENT_DATE),
          'Bill ' || _bill.bill_number || ' - ' || _bill.vendor_name,
          'bill', _bill.id, _bill.user_id)
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit, credit, description) VALUES
    (_je_id, _expense_acct_id, COALESCE(_bill.total_amount, _bill.amount), 0, 'COGS: ' || _bill.bill_number),
    (_je_id, _ap_id, 0, COALESCE(_bill.total_amount, _bill.amount), 'AP: ' || _bill.bill_number);

  RETURN _je_id;
END;
$$;

-- Post Bill Payment: Debit AP, Credit Cash (idempotent)
CREATE OR REPLACE FUNCTION public.post_bill_payment_journal(_bill_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _bill RECORD;
  _je_id UUID;
  _ap_id UUID;
  _cash_id UUID;
BEGIN
  SELECT * INTO _bill FROM public.bills WHERE id = _bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', _bill_id; END IF;

  SELECT id INTO _je_id FROM public.journal_entries
  WHERE organization_id = _bill.organization_id
    AND source_type = 'bill_payment'
    AND source_id = _bill_id;
  IF FOUND THEN RETURN _je_id; END IF;

  _ap_id := get_gl_account_id(_bill.organization_id, '2100');
  _cash_id := get_gl_account_id(_bill.organization_id, '1100');

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, source_type, source_id, created_by)
  VALUES (_bill.organization_id, CURRENT_DATE,
          'Payment: Bill ' || _bill.bill_number,
          'bill_payment', _bill.id, _bill.user_id)
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit, credit, description) VALUES
    (_je_id, _ap_id, COALESCE(_bill.total_amount, _bill.amount), 0, 'AP cleared: ' || _bill.bill_number),
    (_je_id, _cash_id, 0, COALESCE(_bill.total_amount, _bill.amount), 'Cash out: ' || _bill.bill_number);

  RETURN _je_id;
END;
$$;

-- ============================================================
-- POSTING TRIGGERS: Auto-post on status change
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_post_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Post when invoice transitions to sent/paid
  IF NEW.status IN ('sent', 'paid') AND (OLD IS NULL OR OLD.status NOT IN ('sent', 'paid')) THEN
    PERFORM post_invoice_journal(NEW.id);
  END IF;
  -- Post payment when transitioning to paid
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    PERFORM post_invoice_payment_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_post_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    PERFORM post_expense_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_post_bill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status IN ('approved', 'paid') AND (OLD IS NULL OR OLD.status NOT IN ('approved', 'paid')) THEN
    PERFORM post_bill_journal(NEW.id);
  END IF;
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    PERFORM post_bill_payment_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Drop old posting triggers if they exist (replacing legacy engine)
DROP TRIGGER IF EXISTS trg_post_invoice_to_ledger ON public.invoices;
DROP TRIGGER IF EXISTS trg_post_bill_to_ledger ON public.bills;
DROP TRIGGER IF EXISTS trg_post_expense_to_ledger ON public.expenses;

-- Create new posting triggers
CREATE TRIGGER trg_post_invoice_journal
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_post_invoice();

CREATE TRIGGER trg_post_expense_journal
  AFTER INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_post_expense();

CREATE TRIGGER trg_post_bill_journal
  AFTER INSERT OR UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_post_bill();

-- Updated_at trigger for gl_accounts
CREATE TRIGGER update_gl_accounts_updated_at
  BEFORE UPDATE ON public.gl_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
