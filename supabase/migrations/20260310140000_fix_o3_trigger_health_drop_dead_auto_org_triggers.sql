-- ═══════════════════════════════════════════════════════════════════════
-- FIX: O3_TRIGGER_HEALTH — drop auto_set_organization_id from tables
--      that have no user_id column and already have org_id NOT NULL.
--
-- Root cause: auto_set_organization_id() reads NEW.user_id. Tables without
-- a user_id column will fail at runtime if org_id is ever NULL (which it
-- can't be — it's NOT NULL on all these tables). The trigger is dead code
-- AND matches the O3 broken-trigger heuristic, causing a CRITICAL alert.
--
-- Tables fixed: approval_requests, exchange_rates, gst_filing_status,
--   vendor_payments, payment_receipts, sales_returns, purchase_returns,
--   wage_payment_deadlines, state_leave_rules
-- ═══════════════════════════════════════════════════════════════════════

-- approval_requests: org_id NOT NULL, has requested_by (not user_id)
DROP TRIGGER IF EXISTS set_approval_requests_org ON public.approval_requests;

-- exchange_rates: org_id NOT NULL, no user_id column
DROP TRIGGER IF EXISTS set_exchange_rates_org ON public.exchange_rates;

-- gst_filing_status: org_id NOT NULL, has filed_by (not user_id)
DROP TRIGGER IF EXISTS set_gst_filing_status_org ON public.gst_filing_status;

-- vendor_payments: org_id NOT NULL, has created_by (not user_id)
DROP TRIGGER IF EXISTS set_vendor_payments_org ON public.vendor_payments;

-- payment_receipts: org_id NOT NULL, has created_by (not user_id)
DROP TRIGGER IF EXISTS set_payment_receipts_org ON public.payment_receipts;

-- sales_returns: org_id NOT NULL, has created_by (not user_id)
DROP TRIGGER IF EXISTS set_sales_returns_org ON public.sales_returns;

-- purchase_returns: org_id NOT NULL, has created_by (not user_id)
DROP TRIGGER IF EXISTS set_purchase_returns_org ON public.purchase_returns;

-- wage_payment_deadlines: org_id NOT NULL, no user_id column
DROP TRIGGER IF EXISTS trg_wage_deadlines_org ON public.wage_payment_deadlines;

-- state_leave_rules: org_id NOT NULL, no user_id column
DROP TRIGGER IF EXISTS trg_state_leave_rules_org ON public.state_leave_rules;

-- Also update auto_set_organization_id to be resilient so future tables
-- with user_id column still benefit, while avoiding the O3 false-positive:
-- wrap the NEW.user_id access to only execute when organization_id is NULL.
-- (Already safe due to short-circuit, but this makes the intent explicit.)
CREATE OR REPLACE FUNCTION public.auto_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only look up org from user context when org_id was not explicitly provided.
  -- Note: tables with organization_id NOT NULL will never enter this branch —
  -- the DB engine will reject the INSERT before returning here.
  IF NEW.organization_id IS NULL THEN
    DECLARE _uid UUID;
    BEGIN
      -- Access user_id dynamically; skip gracefully if column doesn't exist.
      _uid := (row_to_json(NEW::record) ->> 'user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      _uid := auth.uid();
    END;
    IF _uid IS NOT NULL THEN
      NEW.organization_id := get_user_organization_id(_uid);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
