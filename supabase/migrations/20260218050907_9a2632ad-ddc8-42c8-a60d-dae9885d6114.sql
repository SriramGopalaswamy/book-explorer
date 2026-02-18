
-- ============================================================
-- Sync financial_records → chart_of_accounts.current_balance
-- ============================================================
-- The trigger matches records by:
--   financial_records.type   ↔  chart_of_accounts.account_type  (revenue/expense)
--   financial_records.category ↔ chart_of_accounts.account_name  (case-insensitive)
--   financial_records.user_id  ↔ chart_of_accounts.user_id
-- ============================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.sync_coa_balance_from_financial_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Handle DELETE — subtract the old amount
  IF TG_OP = 'DELETE' THEN
    UPDATE public.chart_of_accounts
    SET current_balance = current_balance - OLD.amount,
        updated_at = now()
    WHERE user_id = OLD.user_id
      AND account_type = OLD.type
      AND LOWER(account_name) = LOWER(OLD.category);
    RETURN OLD;
  END IF;

  -- Handle UPDATE — reverse old, apply new
  IF TG_OP = 'UPDATE' THEN
    -- Reverse the old entry
    UPDATE public.chart_of_accounts
    SET current_balance = current_balance - OLD.amount,
        updated_at = now()
    WHERE user_id = OLD.user_id
      AND account_type = OLD.type
      AND LOWER(account_name) = LOWER(OLD.category);

    -- Apply the new entry
    UPDATE public.chart_of_accounts
    SET current_balance = current_balance + NEW.amount,
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND account_type = NEW.type
      AND LOWER(account_name) = LOWER(NEW.category);

    RETURN NEW;
  END IF;

  -- Handle INSERT — add the new amount
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chart_of_accounts
    SET current_balance = current_balance + NEW.amount,
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND account_type = NEW.type
      AND LOWER(account_name) = LOWER(NEW.category);
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 2. Attach the trigger to financial_records
DROP TRIGGER IF EXISTS trg_sync_coa_balance ON public.financial_records;

CREATE TRIGGER trg_sync_coa_balance
AFTER INSERT OR UPDATE OR DELETE ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_coa_balance_from_financial_records();

-- 3. Backfill: recompute current_balance for all existing CoA accounts
--    from the full financial_records history (per user + type + category)
UPDATE public.chart_of_accounts coa
SET current_balance = COALESCE(
  (
    SELECT SUM(fr.amount)
    FROM public.financial_records fr
    WHERE fr.user_id = coa.user_id
      AND fr.type = coa.account_type
      AND LOWER(fr.category) = LOWER(coa.account_name)
  ), 0
),
updated_at = now();
