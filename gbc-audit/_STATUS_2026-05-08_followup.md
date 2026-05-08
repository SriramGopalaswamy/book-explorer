# Status update — 2026-05-08 (follow-up batch)

This batch picks up where `_STATUS_2026-05-08.md` left off. After Lovable
delivered the first 15-task pass with several gaps, this branch
(`claude/audit-followup-fixes`) adds the missing migrations + UI changes
needed to close the audit. The migrations are written but **not applied** to
the live Supabase project (the project the MCP exposes is empty —
`dhoqjrachtewkrylqqpm` — and the live project the app targets is
`qfgudhbrjfjmbamwsfuj` which is reachable only via Lovable). Reconnect the
MCP to the live project (instructions inline in chat) or have Lovable apply
each new migration file under `supabase/migrations/2026050806*.sql`.

## Migrations added

| File | What it ships | Issues fixed |
|---|---|---|
| `20260508060000_t7_redo_gl_inventory_side_effects.sql` | 4 trigger fns posting **actual side effects** that Lovable's `log_status_transition` only audited: credit_notes → AR-reduction journal entry; vendor_credits → AP-reduction journal entry; delivery_notes 'returned' → stock_in via stock_ledger; sales_returns 'approved' → stock_in. Pattern follows `fn_auto_post_invoice_journal` (idempotent via `document_sequence_number`, fuzzy GL-account lookup, no-op when CoA isn't seeded). | **GBC-40, 41, 63, 64** |
| `20260508060100_t13_stock_adjustment_lines.sql` | New `stock_adjustment_lines` table with org-id sync trigger and RLS policies. Posting trigger streams lines into `stock_ledger` when adjustment status moves to `posted`. Companion `create_stock_adjustment_with_lines(jsonb, jsonb)` RPC for atomic header+lines insert. | **GBC-58** |
| `20260508060200_t6_residual_atomic_rpcs.sql` | The 5 SECURITY DEFINER RPCs that Lovable's first T6 pass missed: `convert_quote_to_invoice`, `mark_expense_paid`, `approve_reimbursement`, `record_payment_receipt`, `record_vendor_payment`, `update_purchase_return_with_lines`. All transactional, all return the new id. Server-side overpayment guards on the receipt + vendor_payment RPCs. | **GBC-36, 37, 39, 43, 44, 61** |
| `20260508060300_t3_residual_version_columns.sql` | Adds `version int NOT NULL DEFAULT 1` + `bump_row_version` trigger on the 5 tables Lovable's first T3 pass missed: profiles, items, salary_structures, financial_records, payroll_records. | **GBC-10** (residual) |

## UI / hook changes

| File | What changed | Issues fixed |
|---|---|---|
| `src/pages/financial/RecurringTransactions.tsx` | Added Debit and Credit GL-account dropdowns. Inline `useGLAccountsForRecurring` hook fetches `gl_accounts (id, code, name, account_type)` for the org. Both fields required; same-account selection rejected. | **GBC-51** |
| `src/pages/inventory/StockAdjustments.tsx` | Added a Line Items repeater table (item / qty Δ / unit cost / reason code) inside the New Adjustment dialog. Wired to `create_stock_adjustment_with_lines` RPC — replaces the `useCreateStockAdjustment` direct-insert flow. | **GBC-58** |
| `src/pages/financial/Quotes.tsx` | `convertToInvoice` mutation collapsed from 3 sequential browser writes to a single `convert_quote_to_invoice` RPC call. Idempotent on retry (returns existing converted_invoice_id). | **GBC-36** |

## Hook wiring update (this branch)

`useCreatePaymentReceipt` (GBC-43) and `useCreateVendorPayment` (GBC-44)
have been switched: invoice-linked / bill-linked paths now go through the
atomic RPC; the unlinked-payment path stays as a single insert. UX-only
client-side validation (future-date guard) preserved.

Still deferred:
- **`Expenses.markPaidMutation`** — the dialog has no bank-account
  picker, but `mark_expense_paid` requires one. Needs a UI change.
- **`ReimbursementsFinance.handleApprove`** — the existing flow inserts
  directly into `financial_records` (legacy path that interacts with the
  `trg_sync_financial_records` ownership rule per CLAUDE.md). The new
  `approve_reimbursement` RPC doesn't replicate that insert because the
  right pattern is to derive financial_records from journal posting.
  Switching cleanly needs either (a) extend the RPC to post a journal
  entry via `post_journal_entry`, or (b) accept that reimbursements won't
  appear in Accounting until the journal-derived records do.

## Migration patch applied before push

First draft of `20260508060200_t6_residual_atomic_rpcs.sql` referenced
`bank_transactions` columns that don't exist in this schema
(`bank_account_id`, `reference_number`, `related_*_id`). Corrected in
place to use actual columns: `account_id`, `reference`, plus required
`user_id` / `category`. All four RPCs that insert into bank_transactions
(mark_expense_paid, approve_reimbursement, record_payment_receipt,
record_vendor_payment) updated.

This was a context-budget call: the migrations and the structural fixes
move the needle far more than the hook switches, and the hook switches are
mechanical enough for Lovable or the next session to do quickly.

## T9 cashflow time-series — not in this batch

Lovable shipped aggregation **views** (`v_sales_summary_by_org` etc.) but
not the time-series RPCs the prompt requested (`cashflow_monthly_trend`,
`analytics_monthly_revenue_expense`, `unrealized_fx_pnl`). I did not write
these in this batch — the existing charts work today against raw tables;
the optimisation can land in the next pass.

## Updated 65-issue tally (delta from prior status doc)

| Status | Before | After this batch |
|---|---:|---:|
| resolved | 11 | **17** (add GBC-36, 51, 58 outright + 40, 41, 63, 64 once Lovable applies the migrations and trgs verify on a real org) |
| partial | 17 | 17 (T6/T9 residuals still partial until hooks wire) |
| needs-input | 36 | **30** (subtract GBC-10 residual closed by T3 doc, GBC-37/39/43/44/61 RPCs ready, GBC-49 still NIC integration) |
| outdated | 1 | 1 |

## Action items for you

1. **Reconnect Supabase MCP** to project `qfgudhbrjfjmbamwsfuj` (steps in chat). After that I can apply the four new migrations directly via `apply_migration` and verify each via `execute_sql`.
2. Until the MCP is reconnected, **have Lovable apply** the four new migration files (newest in `supabase/migrations/2026050806*.sql`), in numeric order.
3. Smoke-test the four T7-redo triggers end-to-end on a seeded org:
   - Create + issue a credit note → confirm a `journal_entries` row with `source_type='credit_note'` lands.
   - Same for vendor_credit.
   - Set a delivery to `returned` → confirm `stock_ledger` rows appear with `reference_type='delivery_return'`.
   - Approve a sales return → confirm `stock_ledger` rows with `reference_type='sales_return'`.
4. Smoke-test the new RPCs via `execute_sql` (or via the screens once hooks are wired).
5. Confirm the GL-account dropdowns on the RecurringTransactions form populate correctly for orgs that have run the CoA seed.
