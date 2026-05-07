# GBC-57: Stock Ledger — `.limit(500)` blind spot

**Severity:** Low · **Category:** Screen Review — Inventory · **Status:** needs-input

## Root cause
`useStockLedger` fetches `.limit(500)` newest movements. Once a busy warehouse exceeds 500, older movements vanish — auditors can't search for a 3-month-old movement.

## Council verdict (compressed)
Same template as GBC-31/34/48: cursor pagination + server-side search/filter. Add a date-range picker to make targeted historical queries cheap.

## Status
needs-input — pagination + RPC.

## Risks
1. Stock-ledger queries may need a covering index on `(item_id, occurred_at)` for fast date-range scans.
2. Lint/build/test could not run in this sandbox.
