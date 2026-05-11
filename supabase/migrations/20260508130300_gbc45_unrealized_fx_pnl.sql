-- ══════════════════════════════════════════════════════════════════════
-- GBC-45 — Unrealized FX Gain/Loss per IAS 21
--
-- For non-INR outstanding receivables (invoices) and payables (bills),
-- compute the difference between:
--   - the rate at which the doc was originally booked (invoices.exchange_rate
--     / bills.exchange_rate), and
--   - the most recent rate ON OR BEFORE p_as_of (latest effective_date
--     <= p_as_of in exchange_rates, filtered by org).
--
-- "Unrealized" because the doc is still outstanding — it has not yet been
-- settled in cash, so the gain/loss has not been realized. Settled
-- amounts (paid_total) are excluded.
--
-- Sign convention:
--   - Receivable in foreign currency, rate UP   = gain to us (we'll
--     receive more INR than booked).
--   - Receivable in foreign currency, rate DOWN = loss to us.
--   - Payable in foreign currency, rate UP      = loss to us.
--   - Payable in foreign currency, rate DOWN    = gain to us.
--
-- Returns one row per currency_code with the four components and a net.
-- Returns zero rows for orgs that have no non-INR docs.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.unrealized_fx_pnl(
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  currency_code text,
  receivable_foreign numeric,
  receivable_inr_at_booking numeric,
  receivable_inr_at_as_of numeric,
  receivable_unrealized numeric,
  payable_foreign numeric,
  payable_inr_at_booking numeric,
  payable_inr_at_as_of numeric,
  payable_unrealized numeric,
  net_unrealized numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;

  RETURN QUERY
  WITH as_of_rate AS (
    -- Latest org-scoped INR→FX rate on or before p_as_of, per to_currency.
    SELECT DISTINCT ON (er.to_currency)
           er.to_currency  AS code,
           er.rate         AS rate
    FROM public.exchange_rates er
    WHERE er.organization_id = v_org
      AND er.from_currency = 'INR'
      AND er.effective_date <= p_as_of
    ORDER BY er.to_currency, er.effective_date DESC
  ),
  -- Open receivables in foreign currency: total_amount minus payments received
  open_recv AS (
    SELECT
      COALESCE(NULLIF(i.currency_code, ''), 'INR') AS code,
      COALESCE(i.exchange_rate, 1)                 AS booked_rate,
      GREATEST(
        COALESCE(i.total_amount, i.amount, 0)
          - COALESCE((SELECT SUM(amount) FROM public.payment_receipts pr
                       WHERE pr.invoice_id = i.id
                         AND pr.status NOT IN ('cancelled', 'reversed')), 0),
        0
      ) AS remaining_foreign
    FROM public.invoices i
    WHERE i.organization_id = v_org
      AND i.deleted_at IS NULL
      AND COALESCE(i.status, '') NOT IN ('cancelled', 'void', 'paid')
  ),
  open_pay AS (
    SELECT
      COALESCE(NULLIF(b.currency_code, ''), 'INR') AS code,
      COALESCE(b.exchange_rate, 1)                 AS booked_rate,
      GREATEST(
        COALESCE(b.total_amount, b.amount, 0)
          - COALESCE((SELECT SUM(amount) FROM public.vendor_payments vp
                       WHERE vp.bill_id = b.id
                         AND vp.status NOT IN ('cancelled', 'reversed')), 0),
        0
      ) AS remaining_foreign
    FROM public.bills b
    WHERE b.organization_id = v_org
      AND b.deleted_at IS NULL
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'void', 'paid', 'Paid', 'Cancelled')
  )
  SELECT
    code                                                              AS currency_code,
    ROUND(COALESCE(SUM(recv_foreign), 0), 2)                          AS receivable_foreign,
    ROUND(COALESCE(SUM(recv_inr_booked), 0), 2)                       AS receivable_inr_at_booking,
    ROUND(COALESCE(SUM(recv_inr_asof), 0), 2)                         AS receivable_inr_at_as_of,
    ROUND(COALESCE(SUM(recv_inr_asof) - SUM(recv_inr_booked), 0), 2)  AS receivable_unrealized,
    ROUND(COALESCE(SUM(pay_foreign), 0), 2)                           AS payable_foreign,
    ROUND(COALESCE(SUM(pay_inr_booked), 0), 2)                        AS payable_inr_at_booking,
    ROUND(COALESCE(SUM(pay_inr_asof), 0), 2)                          AS payable_inr_at_as_of,
    ROUND(COALESCE(SUM(pay_inr_booked) - SUM(pay_inr_asof), 0), 2)    AS payable_unrealized,
    ROUND(COALESCE(
      (SUM(recv_inr_asof) - SUM(recv_inr_booked)) +
      (SUM(pay_inr_booked) - SUM(pay_inr_asof)),
      0), 2)                                                          AS net_unrealized
  FROM (
    SELECT
      r.code,
      r.remaining_foreign                AS recv_foreign,
      r.remaining_foreign * r.booked_rate AS recv_inr_booked,
      r.remaining_foreign * COALESCE(ar.rate, r.booked_rate) AS recv_inr_asof,
      0::numeric                          AS pay_foreign,
      0::numeric                          AS pay_inr_booked,
      0::numeric                          AS pay_inr_asof
    FROM open_recv r
    LEFT JOIN as_of_rate ar ON ar.code = r.code
    WHERE r.code <> 'INR' AND r.remaining_foreign > 0

    UNION ALL

    SELECT
      p.code,
      0::numeric,
      0::numeric,
      0::numeric,
      p.remaining_foreign                AS pay_foreign,
      p.remaining_foreign * p.booked_rate AS pay_inr_booked,
      p.remaining_foreign * COALESCE(ar.rate, p.booked_rate) AS pay_inr_asof
    FROM open_pay p
    LEFT JOIN as_of_rate ar ON ar.code = p.code
    WHERE p.code <> 'INR' AND p.remaining_foreign > 0
  ) merged
  GROUP BY code
  ORDER BY code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unrealized_fx_pnl(date) TO authenticated;
