# GBC-59: Purchase Orders — delete-and-reinsert edit pattern

**Severity:** High · **Category:** Screen Review — Procurement · **Status:** needs-input

## Root cause
Editing a PO: delete all line items → re-insert the new list, both from the browser. Network drop between steps wipes the PO clean. Same anti-pattern as GBC-61 (Purchase Returns), GBC-36 (Quotes Convert), GBC-39 (Reimbursements approve).

## Council verdict (compressed)
- RPC: `update_purchase_order(po_id, header_jsonb, lines_jsonb[])` that does the delete+insert in a transaction.
- Better: per-line `INSERT ... ON CONFLICT UPDATE` and `DELETE WHERE id NOT IN (...)` (preserves audit history).

## Status
needs-input — new RPC + hook rewrite. Common pattern across procurement/sales screens.

## Risks
1. Audit-history preservation matters for compliance; prefer the "diff" approach over "delete-all".
2. Lint/build/test could not run in this sandbox.
