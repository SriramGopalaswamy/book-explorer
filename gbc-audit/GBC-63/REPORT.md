# GBC-63: Deliveries — "Mark Returned" doesn't update inventory

**Severity:** High · **Category:** Screen Review — Sales · **Status:** needs-input

## Root cause
"Mark as Returned" only flips the delivery status text; no `stock_ledger` IN-movement is created. Items returned by customer are physically present in warehouse but invisible to the inventory system.

## Council verdict (compressed)
- Marking a delivery returned must trigger a `stock_in` movement per delivery line.
- Best as a database trigger on `deliveries.status` transitioning to 'returned' — call a SECURITY DEFINER function that inserts the matching stock_ledger rows.
- Alternative: explicit RPC `mark_delivery_returned(delivery_id)` that posts the IN-movements; called from the menu item.

## Status
needs-input — trigger or RPC + hook rewrite.

## Risks
1. Partial returns: the simple status flip can't represent "5 of 10 returned"; consider a separate UI for partial returns that goes through the Sales Return module (GBC-64) instead of this status toggle.
2. Backfill: existing `status='returned'` deliveries may need stock IN movements posted; one-shot script.
3. Lint/build/test could not run in this sandbox.
