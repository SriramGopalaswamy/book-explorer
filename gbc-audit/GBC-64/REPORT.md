# GBC-64: Sales Return — disconnected from stock ledger

**Severity:** High · **Category:** Screen Review — Sales · **Status:** needs-input

## Root cause
Approving a sales return creates the credit note correctly but does not insert a `stock_in` movement — returned units stay missing from the inventory view.

## Council verdict (compressed)
Same template as GBC-63: trigger or RPC that posts stock IN movements per return line on approval. Pair with the GL fix needed (the credit note creation is also subject to GBC-40 — must post the matching journal entry).

## Status
needs-input — trigger/RPC for stock_in + GL sync per GBC-40.

## Risks
1. If the credit-note GL sync (GBC-40) hasn't landed, the financial side is also broken; coordinate.
2. Lint/build/test could not run in this sandbox.
