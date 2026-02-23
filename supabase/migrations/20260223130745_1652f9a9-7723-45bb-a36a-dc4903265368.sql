
-- =============================================
-- PHASE 2: UNIFIED POSTING HELPERS
-- Seed disposal GL account + replace legacy helpers
-- =============================================

-- 1. Seed Asset Disposal Loss account (6100) for each org that has GL accounts
INSERT INTO public.gl_accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active)
SELECT DISTINCT organization_id, '6100', 'Loss on Asset Disposal', 'expense', 'debit', true, true, true
FROM public.gl_accounts
WHERE NOT EXISTS (
  SELECT 1 FROM public.gl_accounts g2 
  WHERE g2.organization_id = gl_accounts.organization_id AND g2.code = '6100'
)
ON CONFLICT DO NOTHING;

-- Seed Asset Disposal Gain account (4200) for credit side when disposal_price > book_value
INSERT INTO public.gl_accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active)
SELECT DISTINCT organization_id, '4200', 'Gain on Asset Disposal', 'revenue', 'credit', true, true, true
FROM public.gl_accounts
WHERE NOT EXISTS (
  SELECT 1 FROM public.gl_accounts g2 
  WHERE g2.organization_id = gl_accounts.organization_id AND g2.code = '4200'
)
ON CONFLICT DO NOTHING;

-- Seed Accumulated Depreciation contra-asset (1500)
INSERT INTO public.gl_accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active)
SELECT DISTINCT organization_id, '1500', 'Accumulated Depreciation', 'asset', 'credit', true, true, true
FROM public.gl_accounts
WHERE NOT EXISTS (
  SELECT 1 FROM public.gl_accounts g2 
  WHERE g2.organization_id = gl_accounts.organization_id AND g2.code = '1500'
)
ON CONFLICT DO NOTHING;

-- Seed Fixed Assets account (1400)
INSERT INTO public.gl_accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active)
SELECT DISTINCT organization_id, '1400', 'Fixed Assets', 'asset', 'debit', true, true, true
FROM public.gl_accounts
WHERE NOT EXISTS (
  SELECT 1 FROM public.gl_accounts g2 
  WHERE g2.organization_id = gl_accounts.organization_id AND g2.code = '1400'
)
ON CONFLICT DO NOTHING;

-- =============================================
-- 2. REPLACE post_bill_journal — routes through unified engine
-- =============================================
CREATE OR REPLACE FUNCTION public.post_bill_journal(_bill_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bill RECORD;
  _expense_acct_id uuid;
  _ap_id uuid;
  _amount numeric;
BEGIN
  SELECT * INTO _bill FROM public.bills WHERE id = _bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', _bill_id; END IF;

  _expense_acct_id := get_gl_account_id(_bill.organization_id, '5200');
  _ap_id := get_gl_account_id(_bill.organization_id, '2100');
  IF _expense_acct_id IS NULL OR _ap_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _bill.organization_id;
  END IF;

  _amount := COALESCE(_bill.total_amount, _bill.amount);

  RETURN post_journal_entry(
    _bill.organization_id,
    'bill',
    _bill.id,
    COALESCE(_bill.bill_date::date, CURRENT_DATE),
    'Bill ' || _bill.bill_number || ' — ' || _bill.vendor_name,
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _expense_acct_id, 'debit', _amount, 'credit', 0, 'description', 'COGS: ' || _bill.bill_number),
      jsonb_build_object('gl_account_id', _ap_id, 'debit', 0, 'credit', _amount, 'description', 'AP: ' || _bill.bill_number)
    )
  );
END;
$$;

-- =============================================
-- 3. REPLACE post_bill_payment_journal — routes through unified engine
-- =============================================
CREATE OR REPLACE FUNCTION public.post_bill_payment_journal(_bill_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bill RECORD;
  _ap_id uuid;
  _cash_id uuid;
  _amount numeric;
BEGIN
  SELECT * INTO _bill FROM public.bills WHERE id = _bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', _bill_id; END IF;

  _ap_id := get_gl_account_id(_bill.organization_id, '2100');
  _cash_id := get_gl_account_id(_bill.organization_id, '1100');
  IF _ap_id IS NULL OR _cash_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _bill.organization_id;
  END IF;

  _amount := COALESCE(_bill.total_amount, _bill.amount);

  RETURN post_journal_entry(
    _bill.organization_id,
    'bill_payment',
    _bill.id,
    CURRENT_DATE,
    'Payment: Bill ' || _bill.bill_number,
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _ap_id, 'debit', _amount, 'credit', 0, 'description', 'AP cleared: ' || _bill.bill_number),
      jsonb_build_object('gl_account_id', _cash_id, 'debit', 0, 'credit', _amount, 'description', 'Cash out: ' || _bill.bill_number)
    )
  );
END;
$$;

-- =============================================
-- 4. REPLACE post_expense_journal — routes through unified engine
-- =============================================
CREATE OR REPLACE FUNCTION public.post_expense_journal(_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _exp RECORD;
  _expense_acct_id uuid;
  _cash_id uuid;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found: %', _expense_id; END IF;

  _expense_acct_id := get_gl_account_id(_exp.organization_id, '5100');
  _cash_id := get_gl_account_id(_exp.organization_id, '1100');
  IF _expense_acct_id IS NULL OR _cash_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _exp.organization_id;
  END IF;

  RETURN post_journal_entry(
    _exp.organization_id,
    'expense',
    _exp.id,
    COALESCE(_exp.expense_date::date, CURRENT_DATE),
    'Expense: ' || COALESCE(_exp.description, _exp.category),
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _expense_acct_id, 'debit', _exp.amount, 'credit', 0, 'description', 'Expense: ' || COALESCE(_exp.description, _exp.category)),
      jsonb_build_object('gl_account_id', _cash_id, 'debit', 0, 'credit', _exp.amount, 'description', 'Cash out: ' || COALESCE(_exp.description, _exp.category))
    )
  );
END;
$$;

-- =============================================
-- 5. NEW: post_asset_disposal_journal
-- Handles disposal with gain/loss calculation
-- =============================================
CREATE OR REPLACE FUNCTION public.post_asset_disposal_journal(_asset_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _asset RECORD;
  _cash_id uuid;
  _fixed_asset_id uuid;
  _accum_depr_id uuid;
  _gain_id uuid;
  _loss_id uuid;
  _book_value numeric;
  _disposal_amount numeric;
  _gain_loss numeric;
  _lines jsonb;
BEGIN
  SELECT * INTO _asset FROM public.assets WHERE id = _asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found: %', _asset_id; END IF;

  IF _asset.status != 'disposed' THEN
    RAISE EXCEPTION 'Asset must be in disposed status to post disposal journal';
  END IF;

  -- Resolve GL accounts
  _cash_id := get_gl_account_id(_asset.organization_id, '1100');
  _fixed_asset_id := get_gl_account_id(_asset.organization_id, '1400');
  _accum_depr_id := get_gl_account_id(_asset.organization_id, '1500');
  _gain_id := get_gl_account_id(_asset.organization_id, '4200');
  _loss_id := get_gl_account_id(_asset.organization_id, '6100');

  IF _cash_id IS NULL OR _fixed_asset_id IS NULL OR _accum_depr_id IS NULL
     OR _gain_id IS NULL OR _loss_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not fully seeded for org %', _asset.organization_id;
  END IF;

  _book_value := GREATEST(_asset.current_book_value, 0);
  _disposal_amount := COALESCE(_asset.disposal_price, 0);
  _gain_loss := _disposal_amount - _book_value;

  -- Build journal lines:
  -- DR Cash (disposal proceeds)
  -- DR Accumulated Depreciation (reverse contra)
  -- CR Fixed Assets (remove asset at cost)
  -- DR/CR Gain or Loss

  _lines := jsonb_build_array(
    -- Remove asset at original cost (credit fixed assets)
    jsonb_build_object(
      'gl_account_id', _fixed_asset_id,
      'debit', 0,
      'credit', _asset.purchase_price,
      'description', 'Remove: ' || _asset.name || ' (' || _asset.asset_tag || ')'
    ),
    -- Reverse accumulated depreciation
    jsonb_build_object(
      'gl_account_id', _accum_depr_id,
      'debit', _asset.accumulated_depreciation,
      'credit', 0,
      'description', 'Accum depr reversal: ' || _asset.asset_tag
    )
  );

  -- Cash received (if any)
  IF _disposal_amount > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object(
        'gl_account_id', _cash_id,
        'debit', _disposal_amount,
        'credit', 0,
        'description', 'Disposal proceeds: ' || _asset.asset_tag
      )
    );
  END IF;

  -- Gain or loss
  IF _gain_loss > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object(
        'gl_account_id', _gain_id,
        'debit', 0,
        'credit', _gain_loss,
        'description', 'Gain on disposal: ' || _asset.asset_tag
      )
    );
  ELSIF _gain_loss < 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object(
        'gl_account_id', _loss_id,
        'debit', ABS(_gain_loss),
        'credit', 0,
        'description', 'Loss on disposal: ' || _asset.asset_tag
      )
    );
  ELSE
    -- Break-even: need a balancing zero — disposal proceeds = book value
    -- Already balanced by cash + accum depr = fixed asset cost
    NULL;
  END IF;

  RETURN post_journal_entry(
    _asset.organization_id,
    'asset_disposal',
    _asset.id,
    COALESCE(_asset.disposal_date::date, CURRENT_DATE),
    'Asset Disposal: ' || _asset.name || ' (' || _asset.asset_tag || ')',
    _lines
  );
END;
$$;

-- =============================================
-- 6. Seed document sequences for new types
-- =============================================
INSERT INTO public.document_sequences (organization_id, document_type, prefix, next_number)
SELECT DISTINCT organization_id, 'asset_disposal', 'JE-DISP-', 1
FROM public.gl_accounts
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_sequences ds 
  WHERE ds.organization_id = gl_accounts.organization_id AND ds.document_type = 'asset_disposal'
)
ON CONFLICT DO NOTHING;

-- =============================================
-- 7. Update invoice helpers to also route through unified engine
-- =============================================
CREATE OR REPLACE FUNCTION public.post_invoice_journal(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv RECORD;
  _ar_id uuid;
  _rev_id uuid;
  _amount numeric;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', _invoice_id; END IF;

  _ar_id := get_gl_account_id(_inv.organization_id, '1200');
  _rev_id := get_gl_account_id(_inv.organization_id, '4100');
  IF _ar_id IS NULL OR _rev_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _inv.organization_id;
  END IF;

  _amount := COALESCE(_inv.total_amount, _inv.amount);

  RETURN post_journal_entry(
    _inv.organization_id,
    'invoice',
    _inv.id,
    COALESCE(_inv.invoice_date::date, CURRENT_DATE),
    'Invoice ' || _inv.invoice_number || ' — ' || _inv.client_name,
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _ar_id, 'debit', _amount, 'credit', 0, 'description', 'AR: ' || _inv.invoice_number),
      jsonb_build_object('gl_account_id', _rev_id, 'debit', 0, 'credit', _amount, 'description', 'Revenue: ' || _inv.invoice_number)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_invoice_payment_journal(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv RECORD;
  _cash_id uuid;
  _ar_id uuid;
  _amount numeric;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', _invoice_id; END IF;

  _cash_id := get_gl_account_id(_inv.organization_id, '1100');
  _ar_id := get_gl_account_id(_inv.organization_id, '1200');
  IF _cash_id IS NULL OR _ar_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _inv.organization_id;
  END IF;

  _amount := COALESCE(_inv.total_amount, _inv.amount);

  RETURN post_journal_entry(
    _inv.organization_id,
    'invoice_payment',
    _inv.id,
    CURRENT_DATE,
    'Payment: Invoice ' || _inv.invoice_number,
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _cash_id, 'debit', _amount, 'credit', 0, 'description', 'Cash in: ' || _inv.invoice_number),
      jsonb_build_object('gl_account_id', _ar_id, 'debit', 0, 'credit', _amount, 'description', 'AR cleared: ' || _inv.invoice_number)
    )
  );
END;
$$;
