# GBC-60: Goods Receipts — "all or nothing" GRN bug

**Severity:** Low · **Category:** Screen Review — Procurement · **Status:** needs-input

## Root cause
Creating a GRN from a PO assumes 100% of remaining qty. Real-world partial shipments are common (vendor sends 20 of 100 today). The form has no editable qty per line.

## Council verdict (compressed)
- For each line, expose an editable "Received Qty" pre-filled with the remaining quantity but capped at it. Allow zero (skipped on this GRN).
- Add a "back-order remaining" toggle so unfulfilled qty stays open on the PO.
- Validate sum-received ≤ ordered.

## Status
needs-input — UI form change + minor hook update.

## Risks
1. Existing GRN records assume 100% — backward-compat queries may need adjustment.
2. Lint/build/test could not run in this sandbox.
