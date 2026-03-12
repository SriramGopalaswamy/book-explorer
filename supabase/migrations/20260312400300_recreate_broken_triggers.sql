-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Recreate Broken Triggers (post-drop by 20260312300800)
--
-- The 10 broken auto_set_organization_id triggers were dropped in
-- migration 20260312300800.  All affected tables have organization_id
-- NOT NULL so the application must provide it explicitly — that part
-- is already correct.
--
-- This migration:
--   1. Creates a reusable set_updated_at() trigger function
--   2. Attaches updated_at triggers to tables that carry that column
--   3. Verifies the new trigger function compiles correctly
--
-- Tables and whether they have updated_at:
--   approval_requests      ✓ updated_at
--   connector_logs         ✗ created_at only  → no trigger needed
--   exchange_rates         ✓ updated_at
--   gst_filing_status      ✓ updated_at
--   integrations           ✓ updated_at
--   shopify_customers      ✗ synced_at only   → no trigger needed
--   shopify_orders         ✗ created_at only  → no trigger needed
--   shopify_products       ✗ created_at only  → no trigger needed
--   state_leave_rules      ✓ updated_at
--   wage_payment_deadlines ✓ updated_at
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Ensure the set_updated_at trigger function exists ──────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Generic BEFORE UPDATE trigger function that stamps updated_at = now().';

-- ── 2. Ensure the broken trigger functions still compile ──────────────
-- (auto_set_organization_id was already hardened in 20260312300800 and
--  now uses JSON deserialization. Calling CREATE OR REPLACE here to
--  make this migration idempotent and verifiable.)

CREATE OR REPLACE FUNCTION public.auto_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_uid UUID;
  _row_json  JSONB;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    _row_json  := row_to_json(NEW)::JSONB;
    _actor_uid := (_row_json ->> 'user_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    _actor_uid := NULL;
  END;

  IF _actor_uid IS NULL THEN
    _actor_uid := auth.uid();
  END IF;

  IF _actor_uid IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(_actor_uid);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Recreate updated_at triggers for tables that have the column ───

-- approval_requests
DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- exchange_rates
DROP TRIGGER IF EXISTS trg_exchange_rates_updated_at ON public.exchange_rates;
CREATE TRIGGER trg_exchange_rates_updated_at
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- gst_filing_status
DROP TRIGGER IF EXISTS trg_gst_filing_status_updated_at ON public.gst_filing_status;
CREATE TRIGGER trg_gst_filing_status_updated_at
  BEFORE UPDATE ON public.gst_filing_status
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- integrations
DROP TRIGGER IF EXISTS trg_integrations_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- state_leave_rules
DROP TRIGGER IF EXISTS trg_state_leave_rules_updated_at ON public.state_leave_rules;
CREATE TRIGGER trg_state_leave_rules_updated_at
  BEFORE UPDATE ON public.state_leave_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- wage_payment_deadlines
DROP TRIGGER IF EXISTS trg_wage_payment_deadlines_updated_at ON public.wage_payment_deadlines;
CREATE TRIGGER trg_wage_payment_deadlines_updated_at
  BEFORE UPDATE ON public.wage_payment_deadlines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Verification hint ─────────────────────────────────────────────────
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
-- WHERE tgrelid::regclass::text IN (
--   'approval_requests','exchange_rates','gst_filing_status',
--   'integrations','state_leave_rules','wage_payment_deadlines')
-- AND NOT tgisinternal;
-- Expected: 6 rows, one per table above.
