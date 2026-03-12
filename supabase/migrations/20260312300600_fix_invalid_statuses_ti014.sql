-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: TI-014 — Records in undefined states
--
-- 3 tables contain rows whose status value is outside the valid enum:
--   purchase_orders: 1 row
--   bills:           55 rows
--   payroll_runs:    5 rows (partially overlaps with TI-022 fix)
--
-- This migration remaps known legacy values and flags unknowns.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE _updated INT;
BEGIN

  -- ── bills ─────────────────────────────────────────────────────────
  -- Valid statuses from schema: 'draft', 'pending', 'approved', 'paid',
  -- 'partially_paid', 'overdue', 'cancelled', 'void'
  -- Legacy values observed: 'open' (→ 'pending'), 'unpaid' (→ 'pending')
  UPDATE public.bills
  SET status = 'pending', updated_at = now()
  WHERE status IN ('open', 'unpaid');

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE NOTICE 'TI-014 bills: remapped % row(s) (open/unpaid → pending)', _updated;
  END IF;

  -- Any remaining unknown bill status → 'draft' for manual review
  UPDATE public.bills
  SET status = 'draft', updated_at = now()
  WHERE status NOT IN ('draft', 'pending', 'approved', 'paid', 'partially_paid', 'overdue', 'cancelled', 'void');

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE WARNING 'TI-014 bills: % row(s) with unknown status reset to "draft" — manual review required', _updated;
  END IF;

  -- ── purchase_orders ───────────────────────────────────────────────
  -- Valid statuses: 'draft', 'pending', 'approved', 'partially_received',
  --                 'received', 'cancelled', 'closed'
  -- Legacy: 'open' (→ 'pending'), 'ordered' (→ 'approved')
  UPDATE public.purchase_orders
  SET status = 'pending', updated_at = now()
  WHERE status = 'open';

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE NOTICE 'TI-014 purchase_orders: remapped % row(s) (open → pending)', _updated;
  END IF;

  UPDATE public.purchase_orders
  SET status = 'approved', updated_at = now()
  WHERE status = 'ordered';

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE NOTICE 'TI-014 purchase_orders: remapped % row(s) (ordered → approved)', _updated;
  END IF;

  -- Any remaining unknown PO status → 'draft'
  UPDATE public.purchase_orders
  SET status = 'draft', updated_at = now()
  WHERE status NOT IN ('draft', 'pending', 'approved', 'partially_received', 'received', 'cancelled', 'closed');

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE WARNING 'TI-014 purchase_orders: % row(s) with unknown status reset to "draft" — manual review required', _updated;
  END IF;

  -- ── payroll_runs (residual after TI-022 migration) ────────────────
  -- The TI-022 migration already handled 'processed' → 'completed'.
  -- Any remaining invalid values go to 'failed'.
  UPDATE public.payroll_runs
  SET status = 'failed', updated_at = now()
  WHERE status NOT IN (
    'draft', 'processing', 'computed', 'under_review',
    'approved', 'locked', 'completed', 'finalized', 'failed', 'cancelled'
  );

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    RAISE WARNING 'TI-014 payroll_runs: % row(s) with unknown status reset to "failed" — manual review required', _updated;
  END IF;

END;
$$;
