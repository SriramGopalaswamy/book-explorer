-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: TI-024 + TI-025
--   TI-024: Completed vendor_payments with no posted journal entry
--   TI-025: Completed payment_receipts with no posted journal entry
--
-- Root cause: The auto-posting trigger was added after these records were
-- created, so no JE was generated for them.
--
-- Fix:
--   1. Backfill one balanced JE per orphaned vendor payment
--      (Dr Accounts Payable / Cr Cash — Bank account)
--   2. Backfill one balanced JE per orphaned payment receipt
--      (Dr Cash — Bank account / Cr Accounts Receivable)
--   3. Install forward-looking triggers to auto-post JEs on future
--      status transitions to 'completed'.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- PART A: Backfill JEs for orphaned vendor payments (TI-024)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  _vp        RECORD;
  _ap_acct   UUID;
  _cash_acct UUID;
  _je_id     UUID;
  _patched   INT := 0;
BEGIN
  FOR _vp IN
    SELECT vp.id, vp.amount, vp.organization_id, vp.payment_date,
           vp.payment_number, vp.vendor_id, vp.created_at
    FROM public.vendor_payments vp
    WHERE vp.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.source_type = 'vendor_payment'
          AND je.source_id   = vp.id
          AND je.is_posted   = true
      )
  LOOP
    -- Resolve Accounts Payable GL account for this org
    SELECT id INTO _ap_acct
    FROM public.chart_of_accounts
    WHERE organization_id = _vp.organization_id
      AND (account_type ILIKE '%payable%' OR account_name ILIKE '%accounts payable%')
    ORDER BY created_at LIMIT 1;

    -- Resolve Cash / Bank GL account for this org
    SELECT id INTO _cash_acct
    FROM public.chart_of_accounts
    WHERE organization_id = _vp.organization_id
      AND (account_type ILIKE '%cash%' OR account_type ILIKE '%bank%'
           OR account_name ILIKE '%cash%' OR account_name ILIKE '%bank%')
    ORDER BY created_at LIMIT 1;

    IF _ap_acct IS NULL OR _cash_acct IS NULL THEN
      RAISE WARNING 'TI-024 backfill: cannot resolve GL accounts for org % (vendor_payment %)',
        _vp.organization_id, _vp.id;
      CONTINUE;
    END IF;

    -- Create the journal entry header
    INSERT INTO public.journal_entries (
      organization_id,
      entry_date,
      description,
      source_type,
      source_id,
      is_posted,
      posted_at,
      created_at,
      updated_at
    ) VALUES (
      _vp.organization_id,
      COALESCE(_vp.payment_date, _vp.created_at::date),
      format('Vendor payment %s — retroactive JE (TI-024 remediation)', _vp.payment_number),
      'vendor_payment',
      _vp.id,
      true,
      now(),
      now(),
      now()
    )
    RETURNING id INTO _je_id;

    -- Debit: Accounts Payable (reduces liability)
    INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description)
    VALUES (_je_id, _ap_acct, _vp.amount, 0, 'AP cleared on vendor payment');

    -- Credit: Cash / Bank (reduces asset)
    INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description)
    VALUES (_je_id, _cash_acct, 0, _vp.amount, 'Cash paid to vendor');

    _patched := _patched + 1;
  END LOOP;

  RAISE NOTICE 'TI-024 backfill complete: % vendor payment JE(s) created', _patched;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART B: Backfill JEs for orphaned payment receipts (TI-025)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  _pr        RECORD;
  _ar_acct   UUID;
  _cash_acct UUID;
  _je_id     UUID;
  _patched   INT := 0;
BEGIN
  FOR _pr IN
    SELECT pr.id, pr.amount, pr.organization_id, pr.receipt_date,
           pr.receipt_number, pr.customer_id, pr.created_at
    FROM public.payment_receipts pr
    WHERE pr.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.source_type = 'payment_receipt'
          AND je.source_id   = pr.id
          AND je.is_posted   = true
      )
  LOOP
    -- Resolve Accounts Receivable GL account for this org
    SELECT id INTO _ar_acct
    FROM public.chart_of_accounts
    WHERE organization_id = _pr.organization_id
      AND (account_type ILIKE '%receivable%' OR account_name ILIKE '%accounts receivable%')
    ORDER BY created_at LIMIT 1;

    -- Resolve Cash / Bank GL account for this org
    SELECT id INTO _cash_acct
    FROM public.chart_of_accounts
    WHERE organization_id = _pr.organization_id
      AND (account_type ILIKE '%cash%' OR account_type ILIKE '%bank%'
           OR account_name ILIKE '%cash%' OR account_name ILIKE '%bank%')
    ORDER BY created_at LIMIT 1;

    IF _ar_acct IS NULL OR _cash_acct IS NULL THEN
      RAISE WARNING 'TI-025 backfill: cannot resolve GL accounts for org % (payment_receipt %)',
        _pr.organization_id, _pr.id;
      CONTINUE;
    END IF;

    -- Create the journal entry header
    INSERT INTO public.journal_entries (
      organization_id,
      entry_date,
      description,
      source_type,
      source_id,
      is_posted,
      posted_at,
      created_at,
      updated_at
    ) VALUES (
      _pr.organization_id,
      COALESCE(_pr.receipt_date, _pr.created_at::date),
      format('Payment receipt %s — retroactive JE (TI-025 remediation)', _pr.receipt_number),
      'payment_receipt',
      _pr.id,
      true,
      now(),
      now(),
      now()
    )
    RETURNING id INTO _je_id;

    -- Debit: Cash / Bank (increases asset)
    INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description)
    VALUES (_je_id, _cash_acct, _pr.amount, 0, 'Cash received from customer');

    -- Credit: Accounts Receivable (reduces asset)
    INSERT INTO public.journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description)
    VALUES (_je_id, _ar_acct, 0, _pr.amount, 'AR cleared on payment receipt');

    _patched := _patched + 1;
  END LOOP;

  RAISE NOTICE 'TI-025 backfill complete: % payment receipt JE(s) created', _patched;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART C: Forward-looking trigger — auto-post JE on vendor payment completion
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_post_vendor_payment_je()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ap_acct   UUID;
  _cash_acct UUID;
  _je_id     UUID;
BEGIN
  -- Only fire when transitioning TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Skip if a JE already exists for this payment
    IF EXISTS (
      SELECT 1 FROM journal_entries
      WHERE source_type = 'vendor_payment' AND source_id = NEW.id AND is_posted = true
    ) THEN
      RETURN NEW;
    END IF;

    SELECT id INTO _ap_acct
    FROM chart_of_accounts
    WHERE organization_id = NEW.organization_id
      AND (account_type ILIKE '%payable%' OR account_name ILIKE '%accounts payable%')
    ORDER BY created_at LIMIT 1;

    SELECT id INTO _cash_acct
    FROM chart_of_accounts
    WHERE organization_id = NEW.organization_id
      AND (account_type ILIKE '%cash%' OR account_type ILIKE '%bank%'
           OR account_name ILIKE '%cash%' OR account_name ILIKE '%bank%')
    ORDER BY created_at LIMIT 1;

    IF _ap_acct IS NULL OR _cash_acct IS NULL THEN
      -- Log but don't block the payment
      RAISE WARNING 'auto_post_vendor_payment_je: GL accounts not found for org %', NEW.organization_id;
      RETURN NEW;
    END IF;

    INSERT INTO journal_entries (
      organization_id, entry_date, description,
      source_type, source_id, is_posted, posted_at, created_at, updated_at
    ) VALUES (
      NEW.organization_id,
      COALESCE(NEW.payment_date, CURRENT_DATE),
      format('Vendor payment %s', NEW.payment_number),
      'vendor_payment', NEW.id, true, now(), now(), now()
    ) RETURNING id INTO _je_id;

    INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description)
    VALUES
      (_je_id, _ap_acct,   NEW.amount, 0,          'AP cleared on vendor payment'),
      (_je_id, _cash_acct, 0,          NEW.amount,  'Cash paid to vendor');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_payment_post_je ON public.vendor_payments;
CREATE TRIGGER trg_vendor_payment_post_je
  AFTER UPDATE ON public.vendor_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_post_vendor_payment_je();

-- ─────────────────────────────────────────────────────────────────────
-- PART D: Forward-looking trigger — auto-post JE on payment receipt completion
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_post_payment_receipt_je()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ar_acct   UUID;
  _cash_acct UUID;
  _je_id     UUID;
BEGIN
  -- Only fire when transitioning TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Skip if a JE already exists for this receipt
    IF EXISTS (
      SELECT 1 FROM journal_entries
      WHERE source_type = 'payment_receipt' AND source_id = NEW.id AND is_posted = true
    ) THEN
      RETURN NEW;
    END IF;

    SELECT id INTO _ar_acct
    FROM chart_of_accounts
    WHERE organization_id = NEW.organization_id
      AND (account_type ILIKE '%receivable%' OR account_name ILIKE '%accounts receivable%')
    ORDER BY created_at LIMIT 1;

    SELECT id INTO _cash_acct
    FROM chart_of_accounts
    WHERE organization_id = NEW.organization_id
      AND (account_type ILIKE '%cash%' OR account_type ILIKE '%bank%'
           OR account_name ILIKE '%cash%' OR account_name ILIKE '%bank%')
    ORDER BY created_at LIMIT 1;

    IF _ar_acct IS NULL OR _cash_acct IS NULL THEN
      RAISE WARNING 'auto_post_payment_receipt_je: GL accounts not found for org %', NEW.organization_id;
      RETURN NEW;
    END IF;

    INSERT INTO journal_entries (
      organization_id, entry_date, description,
      source_type, source_id, is_posted, posted_at, created_at, updated_at
    ) VALUES (
      NEW.organization_id,
      COALESCE(NEW.receipt_date, CURRENT_DATE),
      format('Payment receipt %s', NEW.receipt_number),
      'payment_receipt', NEW.id, true, now(), now(), now()
    ) RETURNING id INTO _je_id;

    INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description)
    VALUES
      (_je_id, _cash_acct, NEW.amount, 0,          'Cash received from customer'),
      (_je_id, _ar_acct,   0,          NEW.amount,  'AR cleared on payment receipt');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_receipt_post_je ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipt_post_je
  AFTER UPDATE ON public.payment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_post_payment_receipt_je();
