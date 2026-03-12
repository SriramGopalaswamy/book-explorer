-- ═══════════════════════════════════════════════════════════════════════
-- REMEDIATION: TI-010 — Name-only vendor/customer references without FK IDs
--
-- 7 tables have vendor_name/customer_name text fields populated but
-- vendor_id/customer_id FK is NULL:
--   vendor_payments:  1 row
--   bills:            5 rows
--   purchase_orders:  1 row
--   purchase_returns: 1 row
--   payment_receipts: 2 rows
--   sales_orders:     1 row
--   sales_returns:    2 rows
--
-- Fix: match on name (case-insensitive) within the same org and populate
-- the FK. Unmatched rows are flagged with a RAISE WARNING for manual review.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _updated INT;
BEGIN

  -- ── vendor_payments ──────────────────────────────────────────────
  UPDATE public.vendor_payments vp
  SET vendor_id = v.id
  FROM public.vendors v
  WHERE vp.vendor_id IS NULL
    AND vp.vendor_name IS NOT NULL
    AND v.organization_id = vp.organization_id
    AND lower(trim(v.name)) = lower(trim(vp.vendor_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: vendor_payments — backfilled % vendor_id(s)', _updated;

  -- ── bills ─────────────────────────────────────────────────────────
  UPDATE public.bills b
  SET vendor_id = v.id
  FROM public.vendors v
  WHERE b.vendor_id IS NULL
    AND b.vendor_name IS NOT NULL
    AND v.organization_id = b.organization_id
    AND lower(trim(v.name)) = lower(trim(b.vendor_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: bills — backfilled % vendor_id(s)', _updated;

  -- ── purchase_orders ───────────────────────────────────────────────
  UPDATE public.purchase_orders po
  SET vendor_id = v.id
  FROM public.vendors v
  WHERE po.vendor_id IS NULL
    AND po.vendor_name IS NOT NULL
    AND v.organization_id = po.organization_id
    AND lower(trim(v.name)) = lower(trim(po.vendor_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: purchase_orders — backfilled % vendor_id(s)', _updated;

  -- ── purchase_returns ──────────────────────────────────────────────
  UPDATE public.purchase_returns pr
  SET vendor_id = v.id
  FROM public.vendors v
  WHERE pr.vendor_id IS NULL
    AND pr.vendor_name IS NOT NULL
    AND v.organization_id = pr.organization_id
    AND lower(trim(v.name)) = lower(trim(pr.vendor_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: purchase_returns — backfilled % vendor_id(s)', _updated;

  -- ── payment_receipts ──────────────────────────────────────────────
  UPDATE public.payment_receipts pr
  SET customer_id = c.id
  FROM public.customers c
  WHERE pr.customer_id IS NULL
    AND pr.customer_name IS NOT NULL
    AND c.organization_id = pr.organization_id
    AND lower(trim(c.name)) = lower(trim(pr.customer_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: payment_receipts — backfilled % customer_id(s)', _updated;

  -- ── sales_orders ──────────────────────────────────────────────────
  UPDATE public.sales_orders so
  SET customer_id = c.id
  FROM public.customers c
  WHERE so.customer_id IS NULL
    AND so.customer_name IS NOT NULL
    AND c.organization_id = so.organization_id
    AND lower(trim(c.name)) = lower(trim(so.customer_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: sales_orders — backfilled % customer_id(s)', _updated;

  -- ── sales_returns ─────────────────────────────────────────────────
  UPDATE public.sales_returns sr
  SET customer_id = c.id
  FROM public.customers c
  WHERE sr.customer_id IS NULL
    AND sr.customer_name IS NOT NULL
    AND c.organization_id = sr.organization_id
    AND lower(trim(c.name)) = lower(trim(sr.customer_name));

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RAISE NOTICE 'TI-010: sales_returns — backfilled % customer_id(s)', _updated;

END;
$$;

-- Warn about any still-unmatched rows after backfill
DO $$
DECLARE _count INT;
BEGIN
  SELECT count(*) INTO _count FROM public.vendor_payments WHERE vendor_id IS NULL AND vendor_name IS NOT NULL;
  IF _count > 0 THEN RAISE WARNING 'TI-010: % vendor_payments row(s) still have no vendor_id — manual review required', _count; END IF;

  SELECT count(*) INTO _count FROM public.bills WHERE vendor_id IS NULL AND vendor_name IS NOT NULL AND is_deleted = false;
  IF _count > 0 THEN RAISE WARNING 'TI-010: % bills row(s) still have no vendor_id — manual review required', _count; END IF;

  SELECT count(*) INTO _count FROM public.payment_receipts WHERE customer_id IS NULL AND customer_name IS NOT NULL;
  IF _count > 0 THEN RAISE WARNING 'TI-010: % payment_receipts row(s) still have no customer_id — manual review required', _count; END IF;
END;
$$;
