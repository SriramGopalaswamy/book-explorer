# GBC-38: Bills — God Component (1,400 lines), `.limit(500)` cap

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useQuery` for bills hardcodes `.limit(500)`; same invisible-data pattern as GBC-31/34. The screen also bundles AI scanning + TDS/GST calculation into one 1,400-line file (GBC-21 pattern at the screen level).

## Council verdict (compressed)
- Pagination + server-side search (GBC-14 / GBC-31 template).
- Extract sub-components: `BillsTable`, `BillFormDialog`, `AIInvoiceScannerSection`, `TdsGstCalculator`. Aligns with GBC-21.
- Move TDS/GST math to a SQL function (GBC-1 pattern).

## Status
needs-input — pagination + extract + RPC math.

## Risks
1. Bills.tsx is heavily used; do extractions one section per PR, with the CLAUDE.md regression-prevention protocol.
2. Lint/build/test could not run in this sandbox.
