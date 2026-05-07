# GBC-58: Inventory Adjustments — missing line items (broken feature)

**Severity:** Low (per Jira) — should be **High** (feature is non-functional) · **Category:** Screen Review — Inventory · **Status:** needs-input

## Root cause
"New Adjustment" form captures Warehouse + Reason only; no item selector or quantity input. The created `stock_adjustments` row has no children → stock is never actually adjusted.

## Council verdict (compressed)
- Add a Line Items table to the form: per-row `item`, `quantity`, optional `unit_cost`, `reason_code`.
- On save, write the header to `stock_adjustments` and child rows to `stock_adjustment_lines` (or whatever the line table is named — verify schema).
- Trigger on `stock_adjustment_lines` posts to `stock_ledger` so the actual stock is updated.

## Status
needs-input — UI + schema check + trigger. Severity should be re-rated High.

## Risks
1. If the line table doesn't exist yet, this is also a schema migration.
2. Lint/build/test could not run in this sandbox.
