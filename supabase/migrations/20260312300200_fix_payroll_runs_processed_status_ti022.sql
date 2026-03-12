-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: TI-022 — Payroll runs with invalid status 'processed'
--
-- Migration 20260310130000 updated the payroll_runs_status_check constraint
-- to remove 'processed' from the valid set, but did not migrate existing
-- rows that already had status='processed'.
--
-- 'processed' was semantically equivalent to 'completed' in the old model.
-- This migration remaps all such rows to 'completed'.
--
-- Also handles TI-014 overlap: payroll_runs rows in any other undefined
-- state are mapped to 'failed' for human review.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _updated INT;
BEGIN
  -- Remap 'processed' → 'completed' (safe semantic equivalence)
  UPDATE public.payroll_runs
  SET status = 'completed', updated_at = now()
  WHERE status = 'processed';

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-022: remapped % payroll_run(s) from "processed" to "completed"', _updated;

  -- Catch any other status values outside the valid set (TI-014 overlap)
  UPDATE public.payroll_runs
  SET status = 'failed', updated_at = now()
  WHERE status NOT IN (
    'draft', 'processing', 'computed', 'under_review',
    'approved', 'locked', 'completed', 'finalized', 'failed', 'cancelled'
  );

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE WARNING 'TI-022/TI-014: remapped % payroll_run(s) with unknown status to "failed" — review required', _updated;
  END IF;
END;
$$;
