
-- Validation trigger: block posting of imbalanced journal entries
CREATE OR REPLACE FUNCTION public.validate_journal_balance_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_debit numeric;
  v_total_credit numeric;
  v_diff numeric;
BEGIN
  -- Only validate when status changes TO 'posted'
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;

    v_diff := ABS(v_total_debit - v_total_credit);

    IF v_diff > 0.01 THEN
      RAISE EXCEPTION 'Cannot post imbalanced journal entry %. Debits=%, Credits=%, Difference=%',
        NEW.document_sequence_number, v_total_debit, v_total_credit, v_diff;
    END IF;

    -- Also ensure at least one line exists
    IF v_total_debit = 0 AND v_total_credit = 0 THEN
      RAISE EXCEPTION 'Cannot post journal entry % with no lines',
        NEW.document_sequence_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_journal_balance ON public.journal_entries;
CREATE TRIGGER trg_validate_journal_balance
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_journal_balance_on_post();
