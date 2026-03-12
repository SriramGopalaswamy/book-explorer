-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: RC-040 — 8 stale open accounting periods
--
-- 8 fiscal/accounting periods have status='open' but their end_date has
-- passed. Stale open periods block period-locking guards and allow
-- retroactive journal entries to posted periods.
--
-- Fix: close all open periods whose end_date is in the past.
-- A notification mechanism is not in scope here — see W3 in the todo plan.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE _updated INT;
BEGIN
  UPDATE public.fiscal_periods
  SET
    status    = 'closed',
    closed_at = COALESCE(closed_at, now()),
    updated_at = now()
  WHERE status = 'open'
    AND end_date < CURRENT_DATE;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'RC-040: closed % stale open fiscal period(s)', _updated;
END;
$$;
