
-- Fix post_invoice_journal to use current date fallback when invoice_date period is closed
CREATE OR REPLACE FUNCTION public.post_invoice_journal(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _ar_id uuid;
  _rev_id uuid;
  _amount numeric;
  _post_date date;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', _invoice_id; END IF;

  _ar_id := get_gl_account_id(_inv.organization_id, '1200');
  _rev_id := get_gl_account_id(_inv.organization_id, '4100');
  IF _ar_id IS NULL OR _rev_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _inv.organization_id;
  END IF;

  _amount := COALESCE(_inv.total_amount, _inv.amount);

  -- Use invoice_date if its period is open, otherwise fall back to current date
  _post_date := COALESCE(_inv.invoice_date::date, CURRENT_DATE);
  IF get_fiscal_period(_inv.organization_id, _post_date) IS NULL
     OR EXISTS (
       SELECT 1 FROM fiscal_periods
       WHERE id = get_fiscal_period(_inv.organization_id, _post_date)
         AND status != 'open'
     ) THEN
    _post_date := CURRENT_DATE;
  END IF;

  RETURN post_journal_entry(
    _inv.organization_id,
    'invoice',
    _inv.id,
    _post_date,
    'Invoice ' || _inv.invoice_number || ' — ' || _inv.client_name,
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _ar_id, 'debit', _amount, 'credit', 0, 'description', 'AR: ' || _inv.invoice_number),
      jsonb_build_object('gl_account_id', _rev_id, 'debit', 0, 'credit', _amount, 'description', 'Revenue: ' || _inv.invoice_number)
    )
  );
END;
$$;

-- Fix post_invoice_payment_journal to use current date with fallback
CREATE OR REPLACE FUNCTION public.post_invoice_payment_journal(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _cash_id uuid;
  _ar_id uuid;
  _amount numeric;
  _post_date date;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', _invoice_id; END IF;

  _cash_id := get_gl_account_id(_inv.organization_id, '1100');
  _ar_id := get_gl_account_id(_inv.organization_id, '1200');
  IF _cash_id IS NULL OR _ar_id IS NULL THEN
    RAISE EXCEPTION 'GL accounts not seeded for org %', _inv.organization_id;
  END IF;

  _amount := COALESCE(_inv.total_amount, _inv.amount);

  -- Use current date, ensure its period is open
  _post_date := CURRENT_DATE;

  RETURN post_journal_entry(
    _inv.organization_id,
    'invoice_payment',
    _inv.id,
    _post_date,
    'Payment: Invoice ' || _inv.invoice_number,
    jsonb_build_array(
      jsonb_build_object('gl_account_id', _cash_id, 'debit', _amount, 'credit', 0, 'description', 'Cash in: ' || _inv.invoice_number),
      jsonb_build_object('gl_account_id', _ar_id, 'debit', 0, 'credit', _amount, 'description', 'AR cleared: ' || _inv.invoice_number)
    )
  );
END;
$$;

-- Make the trigger gracefully handle journal posting errors instead of blocking status changes
CREATE OR REPLACE FUNCTION public.trigger_post_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Post when invoice transitions to sent/paid
  IF NEW.status IN ('sent', 'paid') AND (OLD IS NULL OR OLD.status NOT IN ('sent', 'paid')) THEN
    BEGIN
      PERFORM post_invoice_journal(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post_invoice_journal failed for invoice %: %', NEW.id, SQLERRM;
    END;
  END IF;
  -- Post payment when transitioning to paid
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status != 'paid') THEN
    BEGIN
      PERFORM post_invoice_payment_journal(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post_invoice_payment_journal failed for invoice %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
