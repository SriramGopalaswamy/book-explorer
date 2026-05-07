# GBC-55: Inventory Items — manual stock-level overwrite

**Severity:** High · **Category:** Screen Review — Inventory · **Status:** needs-input

## Root cause
Edit Item dialog has a free-text `Current Stock` field. Stock should only mutate via Stock Adjustments / Sales / Purchase Receipts (the `stock_ledger` is the source of truth). Manual edit bypasses the ledger → reported stock diverges silently from physical reality.

## Council verdict (compressed)
- Remove the editable input. Display stock as read-only.
- Provide a clearly-labelled "Stock Adjustment" CTA on the same dialog that opens the Adjustments flow (which is itself broken — see GBC-58).
- Better: revoke RLS UPDATE on `items.current_stock` for non-system roles; let the trigger that posts to `stock_ledger` be the only writer.

## Status
needs-input — UI change + RLS hardening + dependency on GBC-58 fix.

## Risks
1. Existing operational habits may rely on the field; communicate clearly.
2. Lint/build/test could not run in this sandbox.
