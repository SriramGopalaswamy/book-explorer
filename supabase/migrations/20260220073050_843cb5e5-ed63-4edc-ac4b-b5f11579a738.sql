
-- ============================================================
-- STAGE 4: COMPUTED TOTAL ENFORCEMENT
-- Purpose: Trigger-maintained totals on invoices, quotes, bills
--          from their respective line items
-- ============================================================

-- Step 1: Invoice totals trigger from invoice_items
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invoice_id UUID;
  _subtotal NUMERIC;
  _cgst NUMERIC;
  _sgst NUMERIC;
  _igst NUMERIC;
  _total NUMERIC;
BEGIN
  -- Determine which invoice to recalculate
  IF TG_OP = 'DELETE' THEN
    _invoice_id := OLD.invoice_id;
  ELSE
    _invoice_id := NEW.invoice_id;
  END IF;

  -- Calculate from line items
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(cgst_amount), 0),
    COALESCE(SUM(sgst_amount), 0),
    COALESCE(SUM(igst_amount), 0)
  INTO _subtotal, _cgst, _sgst, _igst
  FROM public.invoice_items
  WHERE invoice_id = _invoice_id;

  _total := _subtotal + _cgst + _sgst + _igst;

  -- Update the parent invoice
  UPDATE public.invoices 
  SET subtotal = _subtotal,
      cgst_total = _cgst,
      sgst_total = _sgst,
      igst_total = _igst,
      total_amount = _total,
      amount = _total,
      updated_at = now()
  WHERE id = _invoice_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_invoice_totals();

-- Step 2: Quote totals trigger from quote_items
CREATE OR REPLACE FUNCTION public.recalculate_quote_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quote_id UUID;
  _subtotal NUMERIC;
  _cgst NUMERIC;
  _sgst NUMERIC;
  _igst NUMERIC;
  _total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _quote_id := OLD.quote_id;
  ELSE
    _quote_id := NEW.quote_id;
  END IF;

  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(cgst_amount), 0),
    COALESCE(SUM(sgst_amount), 0),
    COALESCE(SUM(igst_amount), 0)
  INTO _subtotal, _cgst, _sgst, _igst
  FROM public.quote_items
  WHERE quote_id = _quote_id;

  _total := _subtotal + _cgst + _sgst + _igst;

  UPDATE public.quotes 
  SET subtotal = _subtotal,
      cgst_total = _cgst,
      sgst_total = _sgst,
      igst_total = _igst,
      total_amount = _total,
      amount = _total,
      updated_at = now()
  WHERE id = _quote_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_quote_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_quote_totals();

-- Step 3: Bill totals trigger from bill_items
CREATE OR REPLACE FUNCTION public.recalculate_bill_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bill_id UUID;
  _subtotal NUMERIC;
  _total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _bill_id := OLD.bill_id;
  ELSE
    _bill_id := NEW.bill_id;
  END IF;

  SELECT 
    COALESCE(SUM(amount), 0)
  INTO _subtotal
  FROM public.bill_items
  WHERE bill_id = _bill_id;

  -- Bills use amount + tax_amount = total_amount
  UPDATE public.bills 
  SET amount = _subtotal,
      total_amount = _subtotal + COALESCE(tax_amount, 0),
      updated_at = now()
  WHERE id = _bill_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_bill_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_bill_totals();

-- Step 4: Backfill existing invoice totals from line items
WITH invoice_sums AS (
  SELECT 
    invoice_id,
    SUM(amount) AS subtotal,
    SUM(cgst_amount) AS cgst,
    SUM(sgst_amount) AS sgst,
    SUM(igst_amount) AS igst
  FROM public.invoice_items
  GROUP BY invoice_id
)
UPDATE public.invoices i
SET subtotal = s.subtotal,
    cgst_total = s.cgst,
    sgst_total = s.sgst,
    igst_total = s.igst,
    total_amount = s.subtotal + s.cgst + s.sgst + s.igst,
    amount = s.subtotal + s.cgst + s.sgst + s.igst
FROM invoice_sums s
WHERE i.id = s.invoice_id;

-- Step 5: Backfill existing quote totals from line items
WITH quote_sums AS (
  SELECT 
    quote_id,
    SUM(amount) AS subtotal,
    SUM(cgst_amount) AS cgst,
    SUM(sgst_amount) AS sgst,
    SUM(igst_amount) AS igst
  FROM public.quote_items
  GROUP BY quote_id
)
UPDATE public.quotes q
SET subtotal = s.subtotal,
    cgst_total = s.cgst,
    sgst_total = s.sgst,
    igst_total = s.igst,
    total_amount = s.subtotal + s.cgst + s.sgst + s.igst,
    amount = s.subtotal + s.cgst + s.sgst + s.igst
FROM quote_sums s
WHERE q.id = s.quote_id;

-- Step 6: Backfill existing bill totals from line items
WITH bill_sums AS (
  SELECT 
    bill_id,
    SUM(amount) AS subtotal
  FROM public.bill_items
  GROUP BY bill_id
)
UPDATE public.bills b
SET amount = s.subtotal,
    total_amount = s.subtotal + COALESCE(b.tax_amount, 0)
FROM bill_sums s
WHERE b.id = s.bill_id;
