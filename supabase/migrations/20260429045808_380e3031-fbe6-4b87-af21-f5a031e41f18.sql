DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_financial_records_je_type') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT uq_financial_records_je_type UNIQUE (journal_entry_id, type);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_sync_financial_records()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_je_id UUID; v_org_id UUID; v_date DATE; v_memo TEXT; v_user_id UUID; r RECORD;
BEGIN
  v_je_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF v_je_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT je.organization_id, je.entry_date, je.memo, je.created_by INTO v_org_id, v_date, v_memo, v_user_id
    FROM public.journal_entries je WHERE je.id = v_je_id;
  IF NOT FOUND OR v_org_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  FOR r IN
    SELECT ga.account_type AS acct_type,
           COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS net_debit,
           ga.name AS acct_name
    FROM public.journal_lines jl
    JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE jl.journal_entry_id = v_je_id AND ga.account_type IN ('revenue','expense')
    GROUP BY ga.account_type, ga.name
  LOOP
    DECLARE v_amount NUMERIC := ABS(r.net_debit); v_uid UUID := COALESCE(v_user_id,'00000000-0000-0000-0000-000000000000'::UUID);
    BEGIN
      IF v_amount <= 0 THEN CONTINUE; END IF;
      INSERT INTO public.financial_records (user_id, organization_id, type, category, amount, description, record_date, journal_entry_id)
      VALUES (v_uid, v_org_id, r.acct_type, r.acct_name, v_amount, COALESCE(v_memo, r.acct_name), v_date, v_je_id)
      ON CONFLICT (journal_entry_id, type) DO UPDATE SET
        amount = EXCLUDED.amount, category = EXCLUDED.category, description = EXCLUDED.description,
        record_date = EXCLUDED.record_date, updated_at = now();
    END;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sync_financial_records ON public.journal_lines;
CREATE TRIGGER trg_sync_financial_records AFTER INSERT OR UPDATE OF debit, credit, gl_account_id, journal_entry_id
  ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_financial_records();