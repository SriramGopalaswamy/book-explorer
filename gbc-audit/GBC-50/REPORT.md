# GBC-50: Analytics — million-row chart bombs

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useMonthlyTrend()` downloads every journal line of the last 12 months to draw a 12-bar chart. 30k+ rows for a chart that displays 12 numbers.

## Council verdict (compressed)
Same template as GBC-42 (CashFlow). Replace each chart's hook with a SQL aggregation function returning the bucketed series. Frontend draws from the bucketed result.

## Status
needs-input — per-chart RPCs.

## Risks
1. Each chart has slightly different bucketing (calendar month vs. fiscal). Implement matching SQL.
2. Lint/build/test could not run in this sandbox.
