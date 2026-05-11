# GBC verification — 2026-05-08

**Scope**: source-tree verification of all 65 GBC issues against `main` HEAD (`864864a`) plus the four `supabase/migrations/2026050806*.sql` files queued for apply.

**Method limitations**:
- **No live-DB access**: the MCP-connected Supabase project (`dhoqjrachtewkrylqqpm`) is empty. The live app is wired to `qfgudhbrjfjmbamwsfuj`, which belongs to a different Supabase account (Lovable-managed). Cannot run `execute_sql` or `apply_migration` against the live DB.
- **No live-app access**: egress proxy denies `app.book.grx10.com` (`x-deny-reason: host_not_allowed`); Playwright + Chromium are present but cannot reach the domain — same proxy block at the network layer.
- **No `npm test`**: the registry is also blocked; the regression-test files exist in source but cannot be executed here.

What this verification *does* prove: every artefact called for by `_LOVABLE_PROMPT.md` either exists in the source tree (as a migration file, hook change, UI change, or test file), or is explicitly flagged as missing. What it does **not** prove: that the migrations have been applied to the live project, that triggers fire correctly on real rows, or that the UI renders without runtime errors.

## Verification probe summary

A Python probe (`grep + regex`) ran against `supabase/migrations/*.sql` and `src/**/*.{ts,tsx}` to detect the presence of each expected artefact per issue. False positives in the initial probe were corrected by manual re-inspection (GBC-10 dynamic FOREACH parsing, GBC-16 hook presence, GBC-47 re-merge of `enabled` gates lost in rebase, GBC-65 status classification).

## Per-issue verification table

| Key | Severity | Status | Evidence |
|-----|---|---|---|
| GBC-1  | High   | **partial**       | payroll RPCs exist (`process_payroll_*`); BulkUpload + Manufacturing RPCs missing |
| GBC-2  | High   | partial           | `_sync_org_id_from_parent` trigger fn shipped; only 1/8 detail tables in the prompt's list enrolled |
| GBC-3  | High   | partial           | (same evidence as GBC-2) |
| GBC-4  | Low    | needs-input       | no `v_*_active` views |
| GBC-5  | Low    | needs-input       | no Zustand/Redux (architectural; intentional per audit) |
| GBC-6  | High   | partial           | 328/336 SECURITY DEFINER fns pin `search_path`; ~8 unpinned remain |
| GBC-7  | High   | **resolved**      | `invoice-assets` migrated to path-tenancy; `src/test/storage-bucket-policy.test.ts` pinning |
| GBC-8  | Low    | partial           | partial `jsonb_diff` pattern usage in some audit triggers; not comprehensive |
| GBC-9  | Low    | partial           | `organizations.timezone` column added; downstream trigger / UI wiring incomplete |
| GBC-10 | Medium | **resolved**      | 18/18 target tables have `version` column (12 doc + 1 invoice + 5 master/ledger from T3-residual) |
| GBC-11 | Low    | partial           | `job_queue` table + worker present; realtime channel wiring unverified |
| GBC-12 | High   | needs-input       | no server-side PDF edge function |
| GBC-13 | High   | **resolved**      | `export_audit_log` table + `record_export` RPC |
| GBC-14 | Medium | **resolved**      | `search_vector` + GIN/trigram indexes |
| GBC-15 | High   | **resolved**      | invoice-assets path-tenancy SELECT policy live |
| GBC-16 | Low    | needs-input       | `useWriteAuditLog` still exported in `src/hooks/useAuditLogs.ts:147` (no callers detected, but should be removed) |
| GBC-17 | High   | **resolved**      | `src/test/memo-storage-policy.test.ts` + remediation migration in tree |
| GBC-18 | Low    | partial           | some impersonation flows have role-checks; not exhaustively audited |
| GBC-19 | High   | partial           | `createClient<Database>(...)` typed client in place; ~175 `as any` casts persist |
| GBC-20 | Medium | needs-input       | `useForm` count = 0; react-hook-form not adopted on Settings/Profile |
| GBC-21 | High   | needs-input       | `Settings.tsx` = 1846 lines |
| GBC-22 | Low    | needs-input       | direct `supabase.from(...)` calls inside components still present |
| GBC-23 | Medium | needs-input       | 351 raw `<button>` (probe likely double-counts library code; many genuine) |
| GBC-24 | Low    | needs-input       | `work_order_number` not surfaced in Manufacturing Consumption screen |
| GBC-25 | High   | partial           | sub-A closed via GBC-28; sub-B (WhatsApp `%` escape), sub-C (UI column) deferred |
| GBC-26 | High   | partial           | typed Supabase client in place; `as any` removal pending |
| GBC-27 | Low    | needs-input       | 172 `.select("*")` occurrences |
| GBC-28 | High   | **resolved**      | 13-entry queryKey punch-list patched; `query-key-tenancy.test.ts` pins |
| GBC-29 | Medium | **resolved**      | Dashboard `ModuleCardEnhanced` cards wrapped in `statsLoading` skeleton |
| GBC-30 | Low    | needs-input       | Jira description still empty — issuer input required |
| GBC-31 | Low    | partial           | `search_documents` / search RPC present; UI wiring unverified |
| GBC-32 | Low    | partial           | `gl_account_balance` RPC exists; LedgerExplorer wiring unverified |
| GBC-33 | High   | partial           | some country-aware GSTIN signal; full per-country regex map not confirmed |
| GBC-34 | Low    | partial           | search RPC available; Banking UI wiring TBC |
| GBC-35 | High   | **resolved**      | vendor delete trigger shipped (T14) |
| GBC-36 | High   | **resolved**      | `convert_quote_to_invoice` RPC + Quotes.tsx wired |
| GBC-37 | High   | partial           | `mark_expense_paid` RPC ready; Expenses dialog has no bank-account picker so unwired |
| GBC-38 | High   | partial           | `create/update_bill_with_lines` RPCs wired in Bills.tsx; god-component split deferred |
| GBC-39 | High   | partial           | `approve_reimbursement` RPC ready; legacy `financial_records` direct-insert path keeps it unwired |
| GBC-40 | High   | partial           | `fn_auto_post_credit_note_journal` trigger shipped; **awaiting live apply + smoke test** |
| GBC-41 | High   | partial           | `fn_auto_post_vendor_credit_journal` trigger shipped; **awaiting live apply + smoke test** |
| GBC-42 | Medium | needs-input       | no `cashflow_monthly_trend` time-series RPC |
| GBC-43 | Medium | **resolved**      | `record_payment_receipt` RPC + `useCreatePaymentReceipt` wired |
| GBC-44 | High   | **resolved**      | `record_vendor_payment` RPC + `useCreateVendorPayment` wired |
| GBC-45 | Low    | needs-input       | no `unrealized_fx_pnl` RPC |
| GBC-46 | High   | needs-input       | `useAssets` still unpaginated; no `search_assets` RPC |
| GBC-47 | High   | partial           | `enabled: !!orgId` re-added to all 7 statutory hooks this turn; full server-side compute pending |
| GBC-48 | High   | needs-input       | no e-way-bills search/FTS RPC |
| GBC-49 | High   | needs-input       | `IRN${Date.now()}…Math.random()…` still present in `useEInvoices.ts` |
| GBC-50 | High   | needs-input       | no `analytics_monthly_revenue_expense` RPC |
| GBC-51 | High   | **resolved**      | Debit/Credit GL dropdowns in `RecurringTransactions.tsx` |
| GBC-52 | High   | needs-input       | no auto-save / `workflow_drafts` table |
| GBC-53 | High   | partial           | `gl_account_balance` available for TB compute; CA dashboard wiring TBC |
| GBC-54 | Medium | partial           | some staleness flag pattern; full re-validation logic not confirmed |
| GBC-55 | High   | partial           | inventory item `current_stock` no longer exposed as editable input |
| GBC-56 | Low    | partial           | `useSetDefaultWarehouse` mutation hook shipped; UI menu wiring still pending |
| GBC-57 | Low    | partial           | pagination / search RPC present |
| GBC-58 | Low    | **resolved**      | `stock_adjustment_lines` table + RPC + Adjustments form line-items repeater |
| GBC-59 | High   | **resolved**      | `update_purchase_order_with_lines` RPC + `usePurchaseOrders.ts` wired |
| GBC-60 | Low    | needs-input       | partial-GRN UI not shipped |
| GBC-61 | Low    | partial           | `update_purchase_return_with_lines` RPC ready; PurchaseReturns UI unwired |
| GBC-62 | High   | **resolved**      | `create_sales_order_with_lines` RPC + `useSalesOrders.ts` wired |
| GBC-63 | High   | partial           | `fn_auto_post_delivery_return_stock` trigger shipped; awaiting live apply + smoke test |
| GBC-64 | High   | partial           | `fn_auto_post_sales_return_stock` trigger shipped; awaiting live apply + smoke test |
| GBC-65 | High   | **resolved**      | `create/update_invoice_with_lines` wired in `useInvoices.ts`; FTS covers pagination |

## Final tally

| Status | Count | Issues |
|---|---:|---|
| **resolved** | **17** | GBC-7, 10, 13, 14, 15, 17, 28, 29, 35, 36, 43, 44, 51, 58, 59, 62, 65 |
| **partial**  | **28** | GBC-1, 2, 3, 6, 8, 9, 11, 18, 19, 25, 26, 31, 32, 33, 34, 37, 38, 39, 40, 41, 47, 53, 54, 55, 56, 57, 61, 63, 64 |
| **needs-input** | **20** | GBC-4, 5, 12, 16, 20, 21, 22, 23, 24, 27, 30, 42, 45, 46, 48, 49, 50, 52, 60 |
| **outdated** | **0** | (GBC-16 reclassified — hook still exists) |

17/65 fully resolved (26%). 28/65 partial (43%). 20/65 still need explicit work (31%). 65 total ✓.

## Highest-leverage outstanding items

1. **GBC-40/41/63/64** (4 High issues) — the 4 trigger functions are in source (`supabase/migrations/20260508060000_…sql`) but need **Lovable to apply** them against the live project. After apply: smoke-test by transitioning a credit_note/vendor_credit to `issued` and a delivery to `returned`, then confirm journal_entries / stock_ledger rows appear.
2. **GBC-37/39/61** — RPCs exist; need small UI changes:
   - GBC-37: add bank-account picker to the Expenses mark-paid action.
   - GBC-39: extend `approve_reimbursement` RPC to post via `post_journal_entry` OR accept reimbursements not showing in Accounting until journal-derived records arrive.
   - GBC-61: wire `update_purchase_return_with_lines` in the PurchaseReturns edit handler (mirror Quotes.tsx pattern).
3. **GBC-49** (E-invoice fake IRN) — still `Math.random()`. Needs NIC integration; **not a Lovable task**.
4. **GBC-42/45/50** — time-series RPCs (`cashflow_monthly_trend`, `unrealized_fx_pnl`, `analytics_monthly_revenue_expense`) not yet written.
5. **GBC-19/26** — typed Supabase client in place but ~175 `as any` casts not yet removed (mechanical sweep).
6. **GBC-21** — Settings.tsx still 1846 lines (refactor pending).
7. **GBC-12** — server-side PDF rendering not implemented.

## Caveats

- The `partial` bucket for GBC-40/41/63/64 reflects "migration file in tree, not yet applied to live project" rather than "code incomplete". Once Lovable applies `supabase/migrations/20260508060000_*.sql` they should move to `resolved` pending smoke tests.
- The MCP-exposed Supabase project is empty, so I cannot directly verify any of the schema-side claims against the live database. Either reconnect the MCP to `qfgudhbrjfjmbamwsfuj` (requires the Lovable-managed account or a PAT scoped to that project), or do the live smoke-tests in the Supabase dashboard / via the app UI itself.
- The four regression test files in `src/test/*.test.ts` are statically reasoned to pass against the current source tree (per the static probes earlier in this branch). First real `npm test` after `vendor/node_modules.tar.gz` seeding is the moment of runtime truth.
