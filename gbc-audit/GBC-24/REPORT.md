# GBC-24: Manufacturing Consumption — missing Work Order # column in UI

**Severity:** Low · **Category:** Screen Review — Manufacturing · **Status:** needs-input

## Root cause
Material consumption rows are inserted correctly (auto-derived from BOM in `useUpdateWOStatus` / `useRecordProduction`). The Consumption table fetches `material_consumption` but the column rendering in the UI omits the `work_order_number` (resolved through `work_orders.work_order_number`). Users see an unlabelled list of consumption events.

This is the same finding as **GBC-25 sub-issue C**.

## Council verdict (compressed)
- Update the consumption hook to join `work_orders(work_order_number, status)` via Supabase foreign-key syntax: `select("*, work_orders(work_order_number, status)")`.
- Add a `Work Order #` column to the table render with a link to the WO detail page.
- Verify the FK constraint name; if it differs, use the explicit join syntax.

## Status
needs-input — `useConsumption` hook + Consumption.tsx column add. ~10 lines.

## Risks
1. If the FK isn't named per Supabase's auto-detection, the join syntax differs.
2. Lint/build/test could not run in this sandbox.
