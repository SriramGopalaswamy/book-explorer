# GBC-42: CashFlow — over-fetch for chart (12k+ rows)

**Severity:** Medium · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useCashFlowData` runs `select("*")` over 6 months of `bank_transactions` to draw a 6-point trend chart. At 2k transactions/month this is 12k rows downloaded for 6 numbers.

## Council verdict (compressed)
- Aggregate server-side. A `cashflow_monthly_trend(from, to)` SQL function returns one row per month with `month, inflow, outflow, net`. Frontend draws the chart from 6 rows.
- Companion fix to GBC-27 (over-fetching) and GBC-50 (Analytics performance bombs).

## Status
needs-input — new aggregation function + hook rewrite.

## Risks
1. Caching: aggregation over real-time data must be marked `STABLE`, not `IMMUTABLE`. Cached at the request level, not session.
2. Lint/build/test could not run in this sandbox.
