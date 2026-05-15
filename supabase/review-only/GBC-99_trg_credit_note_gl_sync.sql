-- ─────────────────────────────────────────────────────────────────────────────
-- REVIEW-ONLY MIGRATION — DO NOT APPLY DIRECTLY
-- GBC-99: trg_credit_note_gl_sync trigger on credit_notes
--
-- Purpose: when a credit_note transitions to a posted state (status =
-- 'applied' or 'issued'), automatically post the GL impact:
--   DR  Sales Returns (contra-revenue)
--   CR  Accounts Receivable (customer)
-- and the GST reversal lines (DR Output GST). Reverses on void.
--
-- Assumptions to verify before applying:
--   1. credit_notes carries: organization_id, total_amount, tax_amount,
--      customer_id, status, journal_entry_id (nullable).
--   2. gl_accounts has rows with `system_code` IN
--      ('SALES_RETURNS','ACCOUNTS_RECEIVABLE','OUTPUT_GST') for the org.
--   3. journal_entries / journal_lines schemas match the payroll posting
--      pattern used by trg_sync_financial_records.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_credit_note_gl_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_je_id        uuid;
  v_ar_account   uuid;
  v_sr_account   uuid;
  v_gst_account  uuid;
  v_taxable      numeric;
BEGIN
  -- ── Posting transition: draft/issued → applied ────────────────────────
  IF (TG_OP = 'UPDATE'
      AND NEW.status = 'applied'
      AND OLD.status IS DISTINCT FROM 'applied'
      AND NEW.journal_entry_id IS NULL)
  THEN
    SELECT id INTO v_ar_account FROM public.gl_accounts
     WHERE organization_id = NEW.organization_id AND system_code = 'ACCOUNTS_RECEIVABLE' LIMIT 1;
    SELECT id INTO v_sr_account FROM public.gl_accounts
     WHERE organization_id = NEW.organization_id AND system_code = 'SALES_RETURNS' LIMIT 1;
    SELECT id INTO v_gst_account FROM public.gl_accounts
     WHERE organization_id = NEW.organization_id AND system_code = 'OUTPUT_GST' LIMIT 1;

    IF v_ar_account IS NULL OR v_sr_account IS NULL THEN
      RAISE EXCEPTION 'Missing system GL accounts for credit note GL sync (org %)', NEW.organization_id;
    END IF;

    v_taxable := COALESCE(NEW.total_amount, 0) - COALESCE(NEW.tax_amount, 0);

    INSERT INTO public.journal_entries(
      organization_id, entry_date, source_type, source_id,
      description, posted, created_by
    )
    VALUES (
      NEW.organization_id, COALESCE(NEW.credit_note_date, CURRENT_DATE),
      'credit_note', NEW.id,
      'Credit Note ' || COALESCE(NEW.credit_note_number, NEW.id::text),
      true, auth.uid()
    )
    RETURNING id INTO v_je_id;

    -- DR Sales Returns (taxable portion)
    INSERT INTO public.journal_lines(journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_sr_account, v_taxable, 0, 'Sales return — taxable', NEW.organization_id);

    -- DR Output GST (reversal of GST on original invoice)
    IF v_gst_account IS NOT NULL AND COALESCE(NEW.tax_amount,0) > 0 THEN
      INSERT INTO public.journal_lines(journal_entry_id, account_id, debit, credit, description, organization_id)
      VALUES (v_je_id, v_gst_account, NEW.tax_amount, 0, 'GST reversal', NEW.organization_id);
    END IF;

    -- CR Accounts Receivable (full credit note value)
    INSERT INTO public.journal_lines(journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_ar_account, 0, NEW.total_amount, 'AR reduction', NEW.organization_id);

    NEW.journal_entry_id := v_je_id;
    RETURN NEW;
  END IF;

  -- ── Void transition: applied → void → swap debits/credits on existing JE ──
  IF (TG_OP = 'UPDATE'
      AND NEW.status = 'void'
      AND OLD.status = 'applied'
      AND OLD.journal_entry_id IS NOT NULL)
  THEN
    INSERT INTO public.journal_entries(
      organization_id, entry_date, source_type, source_id,
      description, posted, created_by
    )
    VALUES (
      NEW.organization_id, CURRENT_DATE,
      'credit_note_void', NEW.id,
      'VOID Credit Note ' || COALESCE(NEW.credit_note_number, NEW.id::text),
      true, auth.uid()
    )
    RETURNING id INTO v_je_id;

    INSERT INTO public.journal_lines(journal_entry_id, account_id, debit, credit, description, organization_id)
    SELECT v_je_id, account_id, credit, debit, 'VOID: ' || COALESCE(description,''), organization_id
    FROM public.journal_lines
    WHERE journal_entry_id = OLD.journal_entry_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_note_gl_sync ON public.credit_notes;
CREATE TRIGGER trg_credit_note_gl_sync
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_credit_note_gl_sync();
