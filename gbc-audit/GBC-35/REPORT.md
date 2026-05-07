# GBC-35: Vendors — dangerous deletion (no referential guard)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`deleteMutation` runs `.delete().eq("id", id)` on `vendors` directly. The Customers screen has a guard preventing delete when invoices/quotes exist — Vendors copy-paste forgot it. Result: orphan bills, orphan vendor payments, broken FK chains (or a hard-fail at delete time depending on FK constraint mode).

## Council verdict (compressed)
- Add a precheck: `SELECT 1 FROM bills WHERE vendor_id = $1 LIMIT 1; SELECT 1 FROM vendor_payments WHERE vendor_id = $1 LIMIT 1; SELECT 1 FROM purchase_orders WHERE vendor_id = $1 LIMIT 1`. If any returns a row, refuse with a "this vendor has linked transactions" message.
- Better: prefer **soft delete** (set `deleted_at`) so referential integrity stays intact. Aligns with GBC-4.

## Status
needs-input — code change in `src/hooks/useVendors.ts` and `Vendors.tsx`. Soft-delete is the recommended path.

## Risks
1. Hard delete is currently allowed; existing UX may expect it. Communicate the change.
2. Lint/build/test could not run in this sandbox.
