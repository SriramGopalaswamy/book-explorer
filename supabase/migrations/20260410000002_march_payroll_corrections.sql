-- ═══════════════════════════════════════════════════════════════════════
-- March 2026 Payroll Corrections
--
-- Part 0: Delete the manually-seeded March 2026 payroll run so the
--         Payroll Engine UI can regenerate it cleanly.
--
-- Part 1: Fix trg_prevent_locked_entry_mutation — two bugs:
--         1. RETURN NEW for DELETE is NULL → silently cancels cascade
--            deletes (now uses RETURN OLD correctly)
--         2. ALL updates on locked entries were blocked → now allows
--            non-financial updates (payslip stamps, label corrections)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Part 0 ─────────────────────────────────────────────────────────────
-- Delete the locked March 2026 payroll run.
-- Steps:
--   1. Disable the entry-protection trigger (has a DELETE bug: RETURN NEW
--      is NULL for DELETE, silently cancelling the cascade).
--   2. Delete bank_transfer_batches first — it references payroll_runs
--      WITHOUT ON DELETE CASCADE, so it must be removed manually.
--   3. Delete the run (payroll_entries cascade via ON DELETE CASCADE).
--   4. Re-enable the trigger.

ALTER TABLE public.payroll_entries DISABLE TRIGGER trg_prevent_locked_entry_update;

-- Remove any bank transfer batches tied to the March 2026 run
DELETE FROM public.bank_transfer_batches
WHERE payroll_run_id IN (
  SELECT id FROM public.payroll_runs
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    AND pay_period = '2026-03'
);

DELETE FROM public.payroll_runs
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND pay_period = '2026-03';
-- Expected: DELETE 1 (cascades to payroll_entries rows)

ALTER TABLE public.payroll_entries ENABLE TRIGGER trg_prevent_locked_entry_update;


-- ── Part 1 ─────────────────────────────────────────────────────────────
-- Replace the trigger function to fix both bugs.
-- No need to recreate the trigger itself — only the function body changes.

CREATE OR REPLACE FUNCTION public.trg_prevent_locked_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── DELETE branch ──────────────────────────────────────────────────
  -- Must return OLD (not NEW/NULL) to allow the row to be deleted.
  -- Raises an exception only if the parent run is still locked.
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE id = OLD.payroll_run_id AND status = 'locked'
    ) THEN
      RAISE EXCEPTION 'Cannot delete entries of a locked payroll run';
    END IF;
    RETURN OLD;
  END IF;

  -- ── UPDATE branch ──────────────────────────────────────────────────
  -- Allow non-financial updates on locked runs.
  -- Covers: payslip_url / payslip_generated_at stamps from the edge
  -- function, and label-only corrections in earnings/deductions_breakdown.
  IF NEW.gross_earnings       IS NOT DISTINCT FROM OLD.gross_earnings
     AND NEW.net_pay          IS NOT DISTINCT FROM OLD.net_pay
     AND NEW.total_deductions IS NOT DISTINCT FROM OLD.total_deductions
  THEN
    RETURN NEW;  -- monetary totals unchanged; permit the update
  END IF;

  IF EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE id = OLD.payroll_run_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'Cannot modify entries of a locked payroll run';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_prevent_locked_entry_mutation() IS
  'Protects locked payroll entries from financial mutations. '
  'Non-financial UPDATEs (payslip stamps, label corrections) are permitted. '
  'DELETE is allowed on non-locked entries (returns OLD to avoid NULL-cancel bug).';
