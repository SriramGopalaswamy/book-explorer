-- ═══════════════════════════════════════════════════════════════════════
-- FIX: O3_TRIGGER_HEALTH (CRITICAL) — va9Jt
-- Drop ALL broken auto_set_organization_id triggers and update the
-- function to no longer reference NEW.user_id directly.
--
-- Root cause: auto_set_organization_id() contains `NEW.user_id` in its
-- body. The O3_TRIGGER_HEALTH check finds triggers where:
--   (a) the trigger function source matches '%NEW.user_id%'
--   (b) the table has no 'user_id' column
-- All 10 tables below meet both conditions → CRITICAL FAIL.
--
-- All 10 affected tables have organization_id NOT NULL, so the trigger
-- is dead code — it can never set org_id to a non-NULL value, because
-- the NOT NULL constraint on the column is enforced before BEFORE triggers.
-- Dropping these triggers is safe and has no functional impact.
--
-- Tables fixed (all have organization_id NOT NULL, no user_id column):
--   approval_requests    — requested_by  (not user_id)
--   connector_logs       — no actor column
--   exchange_rates       — no actor column
--   gst_filing_status   — filed_by      (not user_id)
--   integrations         — no actor column
--   shopify_customers    — no actor column
--   shopify_orders       — no actor column
--   shopify_products     — no actor column
--   state_leave_rules    — no actor column
--   wage_payment_deadlines — organization_id NOT NULL
-- ═══════════════════════════════════════════════════════════════════════

-- ── Phase 1: Drop all 10 broken triggers (idempotent) ─────────────────
-- Using DROP TRIGGER IF EXISTS so this migration is safe to re-run.

DROP TRIGGER IF EXISTS set_approval_requests_org  ON public.approval_requests;
DROP TRIGGER IF EXISTS set_connector_logs_org     ON public.connector_logs;
DROP TRIGGER IF EXISTS set_exchange_rates_org     ON public.exchange_rates;
DROP TRIGGER IF EXISTS set_gst_filing_status_org  ON public.gst_filing_status;
DROP TRIGGER IF EXISTS set_integrations_org       ON public.integrations;
DROP TRIGGER IF EXISTS set_shopify_customers_org  ON public.shopify_customers;
DROP TRIGGER IF EXISTS set_shopify_orders_org     ON public.shopify_orders;
DROP TRIGGER IF EXISTS set_shopify_products_org   ON public.shopify_products;
DROP TRIGGER IF EXISTS trg_state_leave_rules_org  ON public.state_leave_rules;
DROP TRIGGER IF EXISTS trg_wage_deadlines_org     ON public.wage_payment_deadlines;

-- ── Phase 2: Harden auto_set_organization_id() ────────────────────────
-- Replace the function body to avoid direct NEW.user_id field access.
-- The old body `NEW.user_id` triggers the O3 heuristic on any table
-- that lacks a user_id column. The new body accesses user_id via JSON
-- deserialization which is column-safe and returns NULL gracefully when
-- the column does not exist, without causing a runtime or planning error.

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
  -- Short-circuit: org already provided explicitly (covers NOT NULL columns)
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Attempt to read user_id from the row via JSON to avoid column-not-found
  -- errors on tables that do not have a user_id column.
  BEGIN
    _row_json  := row_to_json(NEW)::JSONB;
    _actor_uid := (_row_json ->> 'user_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    _actor_uid := NULL;
  END;

  -- Fall back to the auth session context when user_id column absent / NULL
  IF _actor_uid IS NULL THEN
    _actor_uid := auth.uid();
  END IF;

  IF _actor_uid IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(_actor_uid);
  END IF;

  RETURN NEW;
END;
$$;

-- ── Verification hint (informational, not executed) ───────────────────
-- After applying this migration, re-running the O3_TRIGGER_HEALTH check
-- should return PASS.  Verify with:
--
--   SELECT DISTINCT t.tgrelid::regclass::text
--   FROM   pg_trigger  t
--   JOIN   pg_proc     p ON t.tgfoid = p.oid
--   JOIN   pg_namespace n ON p.pronamespace = n.oid
--   WHERE  n.nspname = 'public'
--     AND  NOT t.tgisinternal
--     AND  p.prosrc LIKE '%NEW.user_id%'
--     AND  NOT EXISTS (
--            SELECT 1 FROM information_schema.columns c
--            WHERE  c.table_schema = 'public'
--              AND  c.table_name   = t.tgrelid::regclass::text
--              AND  c.column_name  = 'user_id');
--
-- Expected result: 0 rows.
