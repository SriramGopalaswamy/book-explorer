# GBC-34: Banking — invisible-data + broken sort

**Severity:** Low · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useBankTransactions()` in `useBanking.ts` defaults to `.limit(20)`; client filters/sorts the 20-row slice. Search misses all but the most recent transactions; sort is on the slice, not the full set.

## Council verdict (compressed)
Same pattern as GBC-31: cursor pagination + server-side search + server-side ORDER BY in a SQL function.

## Status
needs-input — pagination + search RPC.

## Risks
1. Reconciliation flows that match against historical transactions need access to the full set; ensure pagination doesn't break those.
2. Lint/build/test could not run in this sandbox.
