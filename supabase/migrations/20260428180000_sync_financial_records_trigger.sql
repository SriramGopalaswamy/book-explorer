-- Item 23: trg_sync_financial_records
--
-- Keeps financial_records in sync with journal_lines.
-- On every INSERT or UPDATE of a journal_line row, recalculate the aggregated
-- revenue and expense amounts for the parent journal_entry and upsert them
-- into financial_records (one row per account_type per journal_entry).
--
-- financial_records.journal_entry_id is the join key.
-- A unique constraint (journal_entry_id, type) is added here to support ON CONFLICT.
--
-- IMPORTANT: direct writes to financial_records are now BLOCKED for revenue/expense
-- rows that have a journal_entry_id — the trigger is the sole writer for those rows.
-- (See CLAUDE.md for the architectural note.)

-- ─── Unique constraint to enable ON CONFLICT upsert ───────────────────────────
ALTER TABLE public.financial_records
  ADD CONSTRAINT uq_financial_records_je_type
  UNIQUE (journal_entry_id, type);

-- ─── Trigger function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_sync_financial_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_je_id   UUID;
  v_org_id  UUID;
  v_date    DATE;
  v_memo    TEXT;
  v_user_id UUID;

  r RECORD;
BEGIN
  v_je_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF v_je_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Fetch journal_entry header
  SELECT je.organization_id, je.entry_date, je.memo, je.created_by
    INTO v_org_id, v_date, v_memo, v_user_id
    FROM public.journal_entries je
    WHERE je.id = v_je_id;

  IF NOT FOUND OR v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Aggregate net amounts per revenue/expense account type for this entry
  FOR r IN
    SELECT
      ga.account_type                                        AS acct_type,
      COALESCE(SUM(jl.debit),  0) - COALESCE(SUM(jl.credit), 0) AS net_debit,
      ga.name                                                AS acct_name
    FROM public.journal_lines jl
    JOIN public.gl_accounts    ga ON ga.id = jl.gl_account_id
    WHERE jl.journal_entry_id = v_je_id
      AND ga.account_type IN ('revenue', 'expense')
    GROUP BY ga.account_type, ga.name
  LOOP
    -- expense: debit-positive net; revenue: credit-positive (use absolute)
    DECLARE
      v_amount NUMERIC;
      v_type   TEXT;
    BEGIN
      v_type   := r.acct_type;
      v_amount := ABS(r.net_debit);

      IF v_amount <= 0 THEN
        CONTINUE;
      END IF;

      -- Resolve a user_id for the NOT NULL constraint; use created_by or a
      -- sentinel system UUID when the journal_entry has no created_by.
      DECLARE v_uid UUID := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::UUID);
      BEGIN
        INSERT INTO public.financial_records (
          user_id, organization_id, type, category, amount,
          description, record_date, journal_entry_id
        )
        VALUES (
          v_uid, v_org_id, v_type, r.acct_name, v_amount,
          COALESCE(v_memo, r.acct_name), v_date, v_je_id
        )
        ON CONFLICT (journal_entry_id, type) DO UPDATE SET
          amount      = EXCLUDED.amount,
          category    = EXCLUDED.category,
          description = EXCLUDED.description,
          record_date = EXCLUDED.record_date,
          updated_at  = now();
      END;
    END;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_financial_records ON public.journal_lines;
CREATE TRIGGER trg_sync_financial_records
  AFTER INSERT OR UPDATE OF debit, credit, gl_account_id, journal_entry_id
  ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_financial_records();
