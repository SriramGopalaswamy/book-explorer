-- ══════════════════════════════════════════════════════════════════════
-- GBC-40 / GBC-41 / GBC-63 / GBC-64
-- T7-redo: GL + inventory side effects on document status transitions
--
-- Lovable's first T7 pass shipped log_status_transition() which only writes
-- to document_status_transitions. This migration adds the four missing
-- side-effect triggers that the audit's GBC-40/41/63/64 actually require:
--
--   GBC-40: credit_notes.status -> 'issued' posts AR-reduction journal entry
--   GBC-41: vendor_credits.status -> 'issued' posts AP-reduction journal
--   GBC-63: deliveries.status -> 'returned' posts stock_in to stock_ledger
--   GBC-64: sales_returns.status -> 'approved' posts stock_in (and optional JE)
--
-- Pattern follows the existing fn_auto_post_invoice_journal /
-- fn_auto_post_bill_journal triggers in 20260312401000_accounting_automation_triggers.sql:
--   - SECURITY DEFINER, search_path pinned
--   - GL accounts resolved via code-prefix or name ILIKE (defensive — tolerates
--     orgs whose CoA hasn't been seeded; trigger is a no-op rather than failing)
--   - Idempotent via journal_entries.document_sequence_number unique-per-org
--   - Idempotent stock_ledger inserts via (reference_type, reference_id) check
-- ══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- GBC-40: credit_notes -> AR reduction journal entry
-- DR Sales Returns / Allowances (revenue contra)   ← amount
-- CR Accounts Receivable                            ← amount
-- Effect: customer's outstanding receivable goes down by `amount`.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_auto_post_credit_note_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _je_id    UUID;
  _ar_acct  UUID;
  _ret_acct UUID;
  _seq      TEXT;
  _amount   NUMERIC;
BEGIN
  -- Fire only when transitioning INTO 'issued' (and not already past it).
  IF NEW.status NOT IN ('issued', 'applied') THEN RETURN NEW; END IF;
  IF OLD.status IN ('issued', 'applied') THEN RETURN NEW; END IF;

  _seq := 'CN-JE-' || NEW.credit_note_number;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE organization_id = NEW.organization_id
      AND document_sequence_number = _seq
  ) THEN RETURN NEW; END IF;

  -- AR (asset, code 12xx or name "receivable")
  SELECT id INTO _ar_acct FROM public.gl_accounts
  WHERE organization_id = NEW.organization_id
    AND account_type = 'asset'
    AND (code LIKE '12%' OR name ILIKE '%receivable%')
    AND is_active = TRUE
  ORDER BY code ASC LIMIT 1;

  -- Sales Returns / Allowances. Try contra-revenue first; fall back to revenue.
  SELECT id INTO _ret_acct FROM public.gl_accounts
  WHERE organization_id = NEW.organization_id
    AND (name ILIKE '%sales return%' OR name ILIKE '%returns and allowance%' OR code LIKE '41%')
    AND is_active = TRUE
  ORDER BY code ASC LIMIT 1;

  IF _ret_acct IS NULL THEN
    SELECT id INTO _ret_acct FROM public.gl_accounts
    WHERE organization_id = NEW.organization_id
      AND account_type = 'revenue'
      AND is_active = TRUE
    ORDER BY code ASC LIMIT 1;
  END IF;

  IF _ar_acct IS NULL OR _ret_acct IS NULL THEN
    -- CoA not seeded for this org; skip silently to avoid blocking the
    -- workflow. The audit gap is logged in document_status_transitions.
    RETURN NEW;
  END IF;

  _amount := COALESCE(NEW.amount, 0);
  IF _amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.journal_entries
    (organization_id, document_sequence_number, entry_date, memo,
     status, is_posted, source_type, created_by)
  VALUES
    (NEW.organization_id, _seq,
     COALESCE(NEW.issue_date, CURRENT_DATE),
     'Auto: Credit Note ' || NEW.credit_note_number || ' (AR reduction)',
     'posted', TRUE, 'credit_note', COALESCE(NEW.user_id, auth.uid()))
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines
    (journal_entry_id, gl_account_id, debit, credit, description)
  VALUES
    (_je_id, _ret_acct, _amount, 0, 'Sales Returns - ' || COALESCE(NEW.client_name, 'Customer')),
    (_je_id, _ar_acct,  0,       _amount, 'AR reduction - CN ' || NEW.credit_note_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_note_auto_journal ON public.credit_notes;
CREATE TRIGGER trg_credit_note_auto_journal
  AFTER INSERT OR UPDATE OF status ON public.credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_credit_note_journal();

-- ══════════════════════════════════════════════════════════════════════
-- GBC-41: vendor_credits -> AP reduction journal entry
-- DR Accounts Payable                              ← amount
-- CR Purchase Returns / Allowances (expense contra) ← amount
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_auto_post_vendor_credit_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _je_id    UUID;
  _ap_acct  UUID;
  _ret_acct UUID;
  _seq      TEXT;
  _amount   NUMERIC;
BEGIN
  IF NEW.status NOT IN ('issued', 'applied') THEN RETURN NEW; END IF;
  IF OLD.status IN ('issued', 'applied') THEN RETURN NEW; END IF;

  _seq := 'VC-JE-' || NEW.vendor_credit_number;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE organization_id = NEW.organization_id
      AND document_sequence_number = _seq
  ) THEN RETURN NEW; END IF;

  -- AP (liability, code 20xx or name "payable")
  SELECT id INTO _ap_acct FROM public.gl_accounts
  WHERE organization_id = NEW.organization_id
    AND account_type = 'liability'
    AND (code LIKE '20%' OR name ILIKE '%payable%')
    AND is_active = TRUE
  ORDER BY code ASC LIMIT 1;

  -- Purchase Returns. Try contra-expense first; fall back to expense.
  SELECT id INTO _ret_acct FROM public.gl_accounts
  WHERE organization_id = NEW.organization_id
    AND (name ILIKE '%purchase return%' OR name ILIKE '%purchase allowance%' OR code LIKE '52%')
    AND is_active = TRUE
  ORDER BY code ASC LIMIT 1;

  IF _ret_acct IS NULL THEN
    SELECT id INTO _ret_acct FROM public.gl_accounts
    WHERE organization_id = NEW.organization_id
      AND account_type IN ('expense', 'cogs')
      AND is_active = TRUE
    ORDER BY code ASC LIMIT 1;
  END IF;

  IF _ap_acct IS NULL OR _ret_acct IS NULL THEN RETURN NEW; END IF;

  _amount := COALESCE(NEW.amount, 0);
  IF _amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.journal_entries
    (organization_id, document_sequence_number, entry_date, memo,
     status, is_posted, source_type, created_by)
  VALUES
    (NEW.organization_id, _seq,
     COALESCE(NEW.issue_date, CURRENT_DATE),
     'Auto: Vendor Credit ' || NEW.vendor_credit_number || ' (AP reduction)',
     'posted', TRUE, 'vendor_credit', COALESCE(NEW.user_id, auth.uid()))
  RETURNING id INTO _je_id;

  INSERT INTO public.journal_lines
    (journal_entry_id, gl_account_id, debit, credit, description)
  VALUES
    (_je_id, _ap_acct,  _amount, 0, 'AP reduction - VC ' || NEW.vendor_credit_number),
    (_je_id, _ret_acct, 0,       _amount, 'Purchase Returns - ' || COALESCE(NEW.vendor_name, 'Vendor'));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_credit_auto_journal ON public.vendor_credits;
CREATE TRIGGER trg_vendor_credit_auto_journal
  AFTER INSERT OR UPDATE OF status ON public.vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_vendor_credit_journal();

-- ══════════════════════════════════════════════════════════════════════
-- GBC-63: deliveries -> stock_in on 'returned'
-- For each delivery_note_item, post a 'return' transaction_type into
-- stock_ledger so the warehouse balance reflects the units coming back.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_auto_post_delivery_return_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _line RECORD;
  _bal_qty   NUMERIC;
  _bal_value NUMERIC;
  _existing_count INT;
BEGIN
  IF NEW.status <> 'returned' THEN RETURN NEW; END IF;
  IF OLD.status = 'returned' THEN RETURN NEW; END IF;

  -- Idempotency: already posted return movements for this delivery?
  SELECT COUNT(*) INTO _existing_count
  FROM public.stock_ledger
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'delivery_return'
    AND reference_id = NEW.id;
  IF _existing_count > 0 THEN RETURN NEW; END IF;

  FOR _line IN
    SELECT dni.item_id, dni.shipped_quantity, dni.warehouse_id, dni.description
    FROM public.delivery_note_items dni
    WHERE dni.delivery_note_id = NEW.id
      AND dni.item_id IS NOT NULL
      AND dni.warehouse_id IS NOT NULL
      AND dni.shipped_quantity > 0
  LOOP
    -- Compute new balance from the latest ledger row for this item/warehouse.
    SELECT COALESCE(balance_qty, 0), COALESCE(balance_value, 0)
      INTO _bal_qty, _bal_value
    FROM public.stock_ledger
    WHERE organization_id = NEW.organization_id
      AND item_id = _line.item_id
      AND warehouse_id = _line.warehouse_id
    ORDER BY posted_at DESC
    LIMIT 1;

    _bal_qty := COALESCE(_bal_qty, 0) + _line.shipped_quantity;

    INSERT INTO public.stock_ledger
      (organization_id, item_id, warehouse_id, transaction_type, quantity,
       rate, value, balance_qty, balance_value,
       reference_type, reference_id, notes, posted_by)
    VALUES
      (NEW.organization_id, _line.item_id, _line.warehouse_id,
       'return', _line.shipped_quantity, 0, 0,
       _bal_qty, COALESCE(_bal_value, 0),
       'delivery_return', NEW.id,
       'Auto: delivery ' || COALESCE(NEW.dn_number, NEW.id::text) || ' returned',
       COALESCE(auth.uid(), NEW.dispatched_by));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_return_auto_stock ON public.delivery_notes;
CREATE TRIGGER trg_delivery_return_auto_stock
  AFTER INSERT OR UPDATE OF status ON public.delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_delivery_return_stock();

-- ══════════════════════════════════════════════════════════════════════
-- GBC-64: sales_returns -> stock_in on 'approved'
-- For each sales_return_items row, restore the qty into the warehouse
-- recorded on the originating delivery_note (best-effort lookup).
-- A future iteration could also post the matching credit_note JE here,
-- but credit_note creation triggers the GBC-40 path on its own status flip.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_auto_post_sales_return_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _line RECORD;
  _wh   UUID;
  _bal_qty   NUMERIC;
  _bal_value NUMERIC;
  _existing_count INT;
BEGIN
  IF NEW.status NOT IN ('approved', 'received') THEN RETURN NEW; END IF;
  IF OLD.status IN ('approved', 'received') THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO _existing_count
  FROM public.stock_ledger
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'sales_return'
    AND reference_id = NEW.id;
  IF _existing_count > 0 THEN RETURN NEW; END IF;

  FOR _line IN
    SELECT sri.item_id, sri.quantity, sri.description
    FROM public.sales_return_items sri
    WHERE sri.sales_return_id = NEW.id
      AND sri.item_id IS NOT NULL
      AND sri.quantity > 0
  LOOP
    -- Resolve warehouse: prefer the one on the originating delivery line, else
    -- fall back to the org's default warehouse.
    _wh := NULL;
    IF NEW.delivery_note_id IS NOT NULL THEN
      SELECT dni.warehouse_id INTO _wh
      FROM public.delivery_note_items dni
      WHERE dni.delivery_note_id = NEW.delivery_note_id
        AND dni.item_id = _line.item_id
      LIMIT 1;
    END IF;
    IF _wh IS NULL THEN
      SELECT id INTO _wh FROM public.warehouses
      WHERE organization_id = NEW.organization_id AND is_default = TRUE
      LIMIT 1;
    END IF;
    IF _wh IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(balance_qty, 0), COALESCE(balance_value, 0)
      INTO _bal_qty, _bal_value
    FROM public.stock_ledger
    WHERE organization_id = NEW.organization_id
      AND item_id = _line.item_id
      AND warehouse_id = _wh
    ORDER BY posted_at DESC
    LIMIT 1;

    _bal_qty := COALESCE(_bal_qty, 0) + _line.quantity;

    INSERT INTO public.stock_ledger
      (organization_id, item_id, warehouse_id, transaction_type, quantity,
       rate, value, balance_qty, balance_value,
       reference_type, reference_id, notes, posted_by)
    VALUES
      (NEW.organization_id, _line.item_id, _wh,
       'return', _line.quantity, 0, 0,
       _bal_qty, COALESCE(_bal_value, 0),
       'sales_return', NEW.id,
       'Auto: sales return ' || COALESCE(NEW.return_number, NEW.id::text),
       COALESCE(auth.uid(), NEW.created_by));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_return_auto_stock ON public.sales_returns;
CREATE TRIGGER trg_sales_return_auto_stock
  AFTER INSERT OR UPDATE OF status ON public.sales_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_sales_return_stock();
