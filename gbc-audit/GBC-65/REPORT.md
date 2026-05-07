# GBC-65: Sales Invoices — big-data performance wall

**Severity:** High · **Category:** Screen Review — Sales · **Status:** needs-input

## Root cause
Page fetches entire invoice history; `useMemo` filter (lines 208–216) runs over the full array on every keystroke. Fine at 50 invoices; unusable past 5,000.

## Council verdict (compressed)
- Cursor pagination + server-side search (GBC-14 / GBC-31 template).
- For headline KPIs at the top of the page (Total Sales, Outstanding Receivables), replace JS reducers with SQL aggregation functions.
- Inherit GBC-12 (server-side PDF) for bulk-export "Print all 5,000 invoices" workflows.

## Status
needs-input — pagination + RPC + server-side compute. Template across all "list + search" Financial Suite screens.

## Risks
1. The page is the most-used customer-facing screen; phased rollout behind a feature flag.
2. Lint/build/test could not run in this sandbox.
