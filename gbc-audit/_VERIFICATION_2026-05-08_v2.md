# GBC verification — 2026-05-08 (refresh after merge of PR #237)

Source-tree verification refreshed against `main` HEAD `1e720aa`. Lovable shipped 5 more migrations since the prior verification (`20260508072530..120818`): `is_org_admin*` helper fns, `get_user_org()`, the RLS rewrite that uses it (Phase 4), trigram indexes for PO ILIKE searches + `get_invoice_kpis` / `get_purchase_order_kpis` aggregation fns, and performance indexes on hot list queries.

## Tally (delta vs. previous verification)

| Status | Previous | Now | Δ |
|---|---:|---:|---|
| **resolved**    | 17 | **18** | +1 |
| **partial**     | 28 | **31** | +3 |
| **needs-input** | 20 | **16** | -4 |

65 total ✓. Movement is positive — 4 issues left the `needs-input` bucket entirely.

## Movement since last check

**New `resolved`:**
- **GBC-56** — `useSetDefaultWarehouse` hook is now actually wired into a `<DropdownMenuItem>` (probe confirms both pieces present together).

**`needs-input` → `partial`** (artifact now exists, full closure still pending):
- **GBC-22** — direct `supabase.from(...)` inside `useEffect` no longer detected on the strict regex; some patterns still exist with looser shape.
- **GBC-42** — `cash_flow_summary` SQL function shipped (counts toward T9).
- **GBC-47** — `enabled: !!orgId` re-added on all 7 statutory hooks; verified 7/7 in current main.
- **GBC-48** — trigram / FTS index pattern detected for e-way bill area.
- **GBC-50** — `get_invoice_kpis` and `get_purchase_order_kpis` aggregation functions land (not strict time-series but covers the chart KPI use case).

**Still `needs-input`:**
GBC-4 (soft-delete views), GBC-5 (Zustand — intentional), GBC-12 (server-side PDF), GBC-16 (`useWriteAuditLog` still exported), GBC-20 (no react-hook-form adoption — count = 0), GBC-21 (Settings.tsx still 1846 lines), GBC-23 (351 raw `<button>`), GBC-24 (Manufacturing WO column), GBC-27 (172 `select("*")`), GBC-30 (empty Jira description), GBC-33 (per-country GSTIN map), GBC-45 (`unrealized_fx_pnl`), GBC-49 (fake IRN still in `useEInvoices.ts`), GBC-52 (workflow auto-save), GBC-54 (CA-audit stale flag), GBC-60 (partial-GRN UI).

## Full 65-row table

| Key | Status | Notes |
|---|---|---|
| GBC-1  | partial      | `process_payroll_entries_batch` exists; BulkUpload + Manufacturing RPCs missing |
| GBC-2  | partial      | `_sync_org_id_from_parent` trigger live; 3/8 detail tables enrolled |
| GBC-3  | partial      | (same as GBC-2) |
| GBC-4  | needs-input  | no `v_*_active` views |
| GBC-5  | needs-input  | no Zustand (intentional — React Query is the store) |
| GBC-6  | partial      | 328/336 SECURITY DEFINER fns pin search_path |
| GBC-7  | **resolved** | invoice-assets path-tenancy + regression test |
| GBC-8  | partial      | partial jsonb_diff usage on some audit triggers |
| GBC-9  | partial      | `organizations.timezone`, `org_now()`, `get_org_timezone()` shipped |
| GBC-10 | **resolved** | 18/18 target tables have `version` column |
| GBC-11 | partial      | `background_jobs` / `job_queue` table present |
| GBC-12 | needs-input  | no server-side PDF edge function |
| GBC-13 | **resolved** | `export_audit_log` + `record_export()` RPC |
| GBC-14 | **resolved** | search_vector + GIN + `search_documents()` RPC |
| GBC-15 | **resolved** | invoice-assets path-tenancy live |
| GBC-16 | needs-input  | `useWriteAuditLog` still exported in `useAuditLogs.ts` |
| GBC-17 | **resolved** | memo-attachments regression test pinning |
| GBC-18 | partial      | some `is_org_admin*` role-checks; full impersonation audit pending |
| GBC-19 | partial      | typed client; **293 `as any` casts** still in `from("X" as any)` |
| GBC-20 | needs-input  | `useForm` count = 0 |
| GBC-21 | needs-input  | Settings.tsx = 1846 lines |
| GBC-22 | partial      | strict useEffect+supabase pattern not detected |
| GBC-23 | needs-input  | 351 raw `<button>` (some are intentional library code) |
| GBC-24 | needs-input  | Manufacturing Consumption work_order_number column missing |
| GBC-25 | partial      | sub-A closed by GBC-28; WhatsApp escape signal present, UI deferred |
| GBC-26 | partial      | (same as GBC-19) |
| GBC-27 | needs-input  | 172 `.select("*")` |
| GBC-28 | **resolved** | queryKey punch-list + regression test |
| GBC-29 | **resolved** | Dashboard zero-flash guard |
| GBC-30 | needs-input  | empty Jira description |
| GBC-31 | partial      | `search_documents` RPC available; UI wiring TBC |
| GBC-32 | partial      | `gl_account_balance` RPC live |
| GBC-33 | needs-input  | hardcoded GSTIN format check still in Customers.tsx |
| GBC-34 | partial      | `search_documents` RPC; Banking UI TBC |
| GBC-35 | **resolved** | `guard_vendor_delete` trigger live |
| GBC-36 | **resolved** | RPC + Quotes.tsx wired |
| GBC-37 | partial      | RPC ready; Expenses dialog lacks bank-account picker |
| GBC-38 | partial      | bills atomic RPCs wired; god-component split deferred |
| GBC-39 | partial      | RPC ready; legacy financial_records insert path keeps it unwired |
| GBC-40 | partial      | trigger in source; **awaiting Lovable apply + smoke test** |
| GBC-41 | partial      | (same as GBC-40, vendor_credits side) |
| GBC-42 | partial      | `cash_flow_summary` SQL fn shipped |
| GBC-43 | **resolved** | RPC + `useCreatePaymentReceipt` wired |
| GBC-44 | **resolved** | RPC + `useCreateVendorPayment` wired |
| GBC-45 | needs-input  | no `unrealized_fx_pnl` |
| GBC-46 | partial      | some pagination signal on `useAssets` |
| GBC-47 | partial      | `enabled: !!orgId` on 7/7 statutory hooks |
| GBC-48 | partial      | trigram indexes + e-way bill search signal |
| GBC-49 | needs-input  | `IRN${Date.now()}Math.random()` still in useEInvoices.ts |
| GBC-50 | partial      | `get_invoice_kpis` + `get_purchase_order_kpis` cover the dashboard cards |
| GBC-51 | **resolved** | recurring form has GL dropdowns |
| GBC-52 | needs-input  | no `workflow_drafts` table / auto-save |
| GBC-53 | partial      | `trial_balance` RPC live |
| GBC-54 | needs-input  | no staleness flag pattern |
| GBC-55 | partial      | current_stock no longer editable |
| GBC-56 | **resolved** | `useSetDefaultWarehouse` hook + menu wiring |
| GBC-57 | partial      | pagination signal on stock ledger |
| GBC-58 | **resolved** | `stock_adjustment_lines` + form + RPC |
| GBC-59 | **resolved** | purchase_order RPCs + wired |
| GBC-60 | needs-input  | partial-GRN UI not present |
| GBC-61 | partial      | RPC ready; UI not wired |
| GBC-62 | **resolved** | sales_order RPCs + wired |
| GBC-63 | partial      | trigger in source; awaiting Lovable apply |
| GBC-64 | partial      | (same as GBC-63, sales_returns side) |
| GBC-65 | **resolved** | invoice RPCs + wired |

## What's left to fully close

Concrete next-actions, ranked by leverage:

1. **GBC-40/41/63/64** — confirm Lovable applied `20260508060000_t7_redo_gl_inventory_side_effects.sql` (the migration is in `main`; Lovable's auto-sync should have picked it up). Smoke-test each: transition a credit_note to `issued`, a delivery to `returned`, a sales_return to `approved` → verify the resulting `journal_entries` / `stock_ledger` rows appear. Moves 4 High issues to `resolved`.
2. **GBC-37** — add a bank-account picker to the Expenses "Mark Paid" action, then route through `mark_expense_paid` RPC. Small UI change.
3. **GBC-39** — extend `approve_reimbursement` RPC to also `INSERT` into `financial_records` (legacy path) OR post a `journal_entry` via `post_journal_entry`. Then swap `handleApprove` to the RPC.
4. **GBC-61** — wire `update_purchase_return_with_lines` in the PurchaseReturns edit handler (mirror the Quotes.tsx pattern from GBC-36).
5. **GBC-19/26** — sweep the 293 remaining `from("X" as any)` casts; the typed client is in place so each removal is a 1-character delete.
6. **GBC-49** — NIC e-invoice integration (not Lovable's job — needs GSP credentials).
7. **GBC-45** — write `unrealized_fx_pnl(as_of date)` SQL function.
8. **GBC-21** — refactor Settings.tsx (1846 lines) into per-section components.
9. **GBC-12** — server-side PDF rendering edge function.
10. **GBC-23** — sweep raw `<button>` to `<Button>` where safe.
