-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Accounting Automation Triggers
--
-- Ensure:
--   1. Invoice approval  → auto AR journal entry
--   2. Bill approval     → auto AP journal entry
--   3. Payroll run lock  → payroll journal entry
--
-- All triggers are idempotent: they check for an existing journal entry
-- with the same document_sequence_number before inserting to prevent
-- duplicate entries on re-runs.
-- ═══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- PART 1: Invoice Approval → AR Journal Entry
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_auto_post_invoice_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _je_id      UUID;
  _ar_acct    UUID;
  _rev_acct   UUID;
  _seq        TEXT;
  _amount     NUMERIC;
BEGIN
  -- Fire only on invoice approval transition
  IF NEW.status NOT IN ('approved', 'sent') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('approved', 'sent', 'paid') THEN
    RETURN NEW;  -- already processed
  END IF;

  _seq := 'INV-JE-' || NEW.invoice_number;

  -- Idempotency check
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE  organization_id = NEW.organization_id
      AND  document_sequence_number = _seq
  ) THEN
    RETURN NEW;
  END IF;

  -- Find AR account (asset, code 12xx or name contains 'receivable')
  SELECT id INTO _ar_acct
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    = 'asset'
    AND  (code LIKE '12%' OR name ILIKE '%receivable%')
    AND  is_active = TRUE
  ORDER  BY code ASC
  LIMIT  1;

  -- Find revenue account
  SELECT id INTO _rev_acct
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    = 'revenue'
    AND  is_active = TRUE
  ORDER  BY code ASC
  LIMIT  1;

  -- Both accounts must exist to post
  IF _ar_acct IS NULL OR _rev_acct IS NULL THEN
    RETURN NEW;
  END IF;

  _amount := COALESCE(NEW.total_amount, NEW.amount, 0);

  -- Create journal entry header
  INSERT INTO public.journal_entries
    (organization_id, document_sequence_number, entry_date, memo,
     status, is_posted, source_type, created_by)
  VALUES
    (NEW.organization_id, _seq,
     COALESCE(NEW.invoice_date, CURRENT_DATE),
     'Auto: AR for invoice ' || NEW.invoice_number,
     'posted', TRUE, 'invoice', COALESCE(NEW.user_id, auth.uid()))
  RETURNING id INTO _je_id;

  -- Dr Accounts Receivable / Cr Revenue
  INSERT INTO public.journal_lines
    (journal_entry_id, gl_account_id, debit, credit, description)
  VALUES
    (_je_id, _ar_acct,  _amount, 0,       'AR - ' || COALESCE(NEW.client_name, NEW.customer_name, 'Customer')),
    (_je_id, _rev_acct, 0,       _amount, 'Revenue - ' || NEW.invoice_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_auto_journal ON public.invoices;
CREATE TRIGGER trg_invoice_auto_journal
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_invoice_journal();

-- ══════════════════════════════════════════════════════════════════════
-- PART 2: Bill Approval → AP Journal Entry
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_auto_post_bill_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _je_id       UUID;
  _ap_acct     UUID;
  _exp_acct    UUID;
  _seq         TEXT;
  _amount      NUMERIC;
BEGIN
  -- Fire only on bill approval
  IF NEW.status NOT IN ('approved') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('approved', 'paid', 'partially_paid') THEN
    RETURN NEW;
  END IF;

  _seq := 'BILL-JE-' || NEW.bill_number;

  -- Idempotency check
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE  organization_id = NEW.organization_id
      AND  document_sequence_number = _seq
  ) THEN
    RETURN NEW;
  END IF;

  -- Find AP account (liability, code 20xx or name contains 'payable')
  SELECT id INTO _ap_acct
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    = 'liability'
    AND  (code LIKE '20%' OR name ILIKE '%payable%')
    AND  is_active = TRUE
  ORDER  BY code ASC
  LIMIT  1;

  -- Find expense account (operating expense)
  SELECT id INTO _exp_acct
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    IN ('expense', 'cogs')
    AND  is_active = TRUE
  ORDER  BY code ASC
  LIMIT  1;

  IF _ap_acct IS NULL OR _exp_acct IS NULL THEN
    RETURN NEW;
  END IF;

  _amount := COALESCE(NEW.total_amount, NEW.amount, 0);

  INSERT INTO public.journal_entries
    (organization_id, document_sequence_number, entry_date, memo,
     status, is_posted, source_type, created_by)
  VALUES
    (NEW.organization_id, _seq,
     COALESCE(NEW.bill_date, CURRENT_DATE),
     'Auto: AP for bill ' || NEW.bill_number,
     'posted', TRUE, 'bill', COALESCE(NEW.user_id, auth.uid()))
  RETURNING id INTO _je_id;

  -- Dr Expense / Cr Accounts Payable
  INSERT INTO public.journal_lines
    (journal_entry_id, gl_account_id, debit, credit, description)
  VALUES
    (_je_id, _exp_acct, _amount, 0,       'Expense - ' || COALESCE(NEW.vendor_name, 'Vendor')),
    (_je_id, _ap_acct,  0,       _amount, 'AP - ' || NEW.bill_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_auto_journal ON public.bills;
CREATE TRIGGER trg_bill_auto_journal
  AFTER INSERT OR UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_bill_journal();

-- ══════════════════════════════════════════════════════════════════════
-- PART 3: Payroll Run Lock → Payroll Journal Entry
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_auto_post_payroll_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _je_id          UUID;
  _salary_exp     UUID;
  _salary_payable UUID;
  _pf_payable     UUID;
  _seq            TEXT;
BEGIN
  -- Fire when payroll run moves to 'locked' (or 'approved' as fallback)
  IF NEW.status NOT IN ('locked', 'approved') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('locked') THEN
    RETURN NEW;
  END IF;

  _seq := 'PAY-JE-' || NEW.pay_period;

  -- Idempotency check
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE  organization_id = NEW.organization_id
      AND  document_sequence_number = _seq
  ) THEN
    RETURN NEW;
  END IF;

  -- Find salary expense account
  SELECT id INTO _salary_exp
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    IN ('expense')
    AND  (code LIKE '51%' OR name ILIKE '%salary%' OR name ILIKE '%payroll%')
    AND  is_active = TRUE
  ORDER  BY code ASC
  LIMIT  1;

  -- Find salary payable account
  SELECT id INTO _salary_payable
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    = 'liability'
    AND  (code = '2300' OR name ILIKE '%salary payable%')
    AND  is_active = TRUE
  LIMIT  1;

  -- Find PF payable account
  SELECT id INTO _pf_payable
  FROM   public.gl_accounts
  WHERE  organization_id = NEW.organization_id
    AND  account_type    = 'liability'
    AND  (code = '2400' OR name ILIKE '%pf%' OR name ILIKE '%provident%')
    AND  is_active = TRUE
  LIMIT  1;

  -- Need at least salary expense and one liability account
  IF _salary_exp IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fall back to any liability if specific accounts not found
  IF _salary_payable IS NULL THEN
    SELECT id INTO _salary_payable
    FROM   public.gl_accounts
    WHERE  organization_id = NEW.organization_id
      AND  account_type    = 'liability'
      AND  is_active = TRUE
    ORDER  BY code ASC
    LIMIT  1;
  END IF;

  IF _salary_payable IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.journal_entries
    (organization_id, document_sequence_number, entry_date, memo,
     status, is_posted, source_type, created_by)
  VALUES
    (NEW.organization_id, _seq,
     CURRENT_DATE,
     'Auto: Payroll posting for ' || NEW.pay_period,
     'posted', TRUE, 'payroll',
     COALESCE(NEW.approved_by, NEW.generated_by, auth.uid()))
  RETURNING id INTO _je_id;

  -- Dr Salary Expense (gross) / Cr Net Salary Payable + Deductions
  IF _pf_payable IS NOT NULL AND NEW.total_deductions > 0 THEN
    INSERT INTO public.journal_lines
      (journal_entry_id, gl_account_id, debit, credit, description)
    VALUES
      (_je_id, _salary_exp,     COALESCE(NEW.total_gross, 0),       0, 'Salary expense - ' || NEW.pay_period),
      (_je_id, _salary_payable, 0, COALESCE(NEW.total_net, 0),         'Net salary payable - ' || NEW.pay_period),
      (_je_id, _pf_payable,     0, COALESCE(NEW.total_deductions, 0),  'Statutory deductions - ' || NEW.pay_period);
  ELSE
    -- Simple two-line entry when deduction account unavailable
    INSERT INTO public.journal_lines
      (journal_entry_id, gl_account_id, debit, credit, description)
    VALUES
      (_je_id, _salary_exp,     COALESCE(NEW.total_gross, 0), 0,                               'Salary expense - ' || NEW.pay_period),
      (_je_id, _salary_payable, 0,                            COALESCE(NEW.total_gross, 0),    'Salary payable - ' || NEW.pay_period);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_auto_journal ON public.payroll_runs;
CREATE TRIGGER trg_payroll_auto_journal
  AFTER UPDATE ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_payroll_journal();

-- ── Verification hint ─────────────────────────────────────────────────
-- After approving/locking a payroll_run, check:
--   SELECT * FROM journal_entries WHERE document_sequence_number LIKE 'PAY-JE-%';
-- After approving an invoice:
--   SELECT * FROM journal_entries WHERE document_sequence_number LIKE 'INV-JE-%';
