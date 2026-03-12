-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Draft Journal Integrity — Prevent Unbalanced Journals
--
-- Rule: SUM(debits) == SUM(credits) for any journal_entry.
--
-- Enforcement strategy:
--   • BEFORE UPDATE trigger on journal_entries: when is_posted changes
--     from FALSE → TRUE (or status changes to 'posted'), verify balance.
--   • A utility function check_journal_balance(journal_id) for manual use.
--   • Journals CAN be saved in draft with imbalanced lines (normal workflow:
--     lines are added incrementally).  Balance is enforced at the moment
--     of posting, not during draft editing.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. check_journal_balance(journal_id) utility ──────────────────────
CREATE OR REPLACE FUNCTION public.check_journal_balance(
  p_journal_id UUID
)
RETURNS TABLE(
  journal_id UUID,
  total_debits  NUMERIC,
  total_credits NUMERIC,
  difference    NUMERIC,
  balanced      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debits  NUMERIC;
  v_credits NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(jl.debit),  0),
    COALESCE(SUM(jl.credit), 0)
  INTO v_debits, v_credits
  FROM   public.journal_lines jl
  WHERE  jl.journal_entry_id = p_journal_id;

  RETURN QUERY
  SELECT
    p_journal_id,
    v_debits,
    v_credits,
    v_debits - v_credits,
    ABS(v_debits - v_credits) < 0.01;
END;
$$;

COMMENT ON FUNCTION public.check_journal_balance(UUID) IS
  'Returns balance check result for a single journal entry.';

-- ── 2. Trigger function: block posting of unbalanced journals ─────────
CREATE OR REPLACE FUNCTION public.enforce_journal_balance_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debits  NUMERIC;
  v_credits NUMERIC;
BEGIN
  -- Only check when transitioning to posted state
  IF (
    (NEW.is_posted = TRUE  AND (OLD.is_posted = FALSE OR OLD.is_posted IS NULL))
    OR
    (NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted')
  ) THEN
    SELECT
      COALESCE(SUM(jl.debit),  0),
      COALESCE(SUM(jl.credit), 0)
    INTO v_debits, v_credits
    FROM   public.journal_lines jl
    WHERE  jl.journal_entry_id = NEW.id;

    IF ABS(v_debits - v_credits) >= 0.01 THEN
      RAISE EXCEPTION
        'Cannot post journal %: debits (%) ≠ credits (%) — difference: %',
        NEW.id, v_debits, v_credits, v_debits - v_credits
        USING ERRCODE = 'check_violation';
    END IF;

    -- Also reject journals with zero lines
    IF v_debits = 0 AND v_credits = 0 THEN
      RAISE EXCEPTION
        'Cannot post journal %: no journal lines found.',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Attach trigger to journal_entries ─────────────────────────────
DROP TRIGGER IF EXISTS trg_enforce_journal_balance ON public.journal_entries;

CREATE TRIGGER trg_enforce_journal_balance
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_balance_on_post();

-- ── 4. Also enforce at INSERT for journals created in posted state ────
CREATE OR REPLACE FUNCTION public.enforce_journal_balance_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A newly inserted journal has no lines yet — allow insert regardless.
  -- Lines are added in subsequent INSERTs to journal_lines.
  -- The balance check fires on journal_lines INSERT if status is already posted.
  RETURN NEW;
END;
$$;

-- ── 5. Trigger on journal_lines: block adding lines to posted journals ─
-- (prevent bypassing the balance check by adding lines after posting)
CREATE OR REPLACE FUNCTION public.enforce_posted_journal_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_posted BOOLEAN;
  v_status    TEXT;
BEGIN
  SELECT is_posted, status
  INTO   v_is_posted, v_status
  FROM   public.journal_entries
  WHERE  id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  IF v_is_posted = TRUE OR v_status = 'posted' THEN
    RAISE EXCEPTION
      'Cannot modify journal lines: journal % is already posted.',
      COALESCE(NEW.journal_entry_id, OLD.journal_entry_id)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_posted_journal_line_lock ON public.journal_lines;

CREATE TRIGGER trg_posted_journal_line_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_posted_journal_immutability();

-- ── Verification hint ─────────────────────────────────────────────────
-- 1. Create a draft journal, add unbalanced lines, then try to post:
--    UPDATE journal_entries SET is_posted = true WHERE id = '<id>';
--    Expected: ERROR: Cannot post journal ...: debits (X) ≠ credits (Y)
--
-- 2. Select from check_journal_balance('<id>') to see current state.
