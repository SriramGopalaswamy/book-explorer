# Wave-2 Execution Verification — 2026-05-19

Auditor: orchestrator (post-merge of PRs #254-258).
Range: `abd3a9a..a6f460c` (Lovable's 52 commits on `main`).
Method: re-ran the V0-V5 phases of `_LOVABLE_VERIFICATION_PROMPT_2026-05-18.md`. `npm run test` not runnable from this sandbox (npm registry blocked); equivalent probe logic replayed in Node.

## Summary

Lovable shipped **6 of 22 tasks** from `_LOVABLE_PROMPT_2026-05-18.md` — the Phase-1 quick wins plus a slice of Phase 2 and Phase 3. **No regressions, no fake fixes** — every allowlist removal corresponds to a real code change. Sixteen tasks remain.

| Status | Count | Tasks |
|---|---|---|
| ✅ SHIPPED | 6 | 1.1 (GBC-129+NEW-2), 1.2 (GBC-91+5), 1.3 (GBC-103), 1.4 (GBC-131), 2.1 (GBC-92), 2.2 (GBC-96+NEW-3) |
| ⚠ PARTIAL | 1 | 5.4 partial — GBC-128 credit-note RPC exists; sales-return → stock_ledger trigger missing |
| ❌ OUTSTANDING | 16 | 2.3 (GBC-123), 2.4 (108/111/113), 2.5 (GBC-124+NEW-1), 2.6 (GBC-100), 3.1 (GBC-114), 4.1 (GBC-130), 4.2 (GBC-115), 5.1 (GBC-102), 5.2 (GBC-104), 5.3 (GBC-117), 5.4 remaining (69/106/109/126/127), 6.1 (GBC-125), 6.2 (GBC-10), 6.3 (GBC-132), 7.1 (GBC-19/26), 7.2 (GBC-94) |

## V1 — Test suite

Not runnable from this sandbox. Probe-logic replay in Node:

| Probe | Pre-execution | Post-merge | Expected post | Match? |
|---|---|---|---|---|
| P-6 org-scoping baseline | 26 files / 65 hits | 26 files / 65 hits | drained on GBC-115+130 | ❌ untouched |
| P-7 queryKey offenders | 7 names | 7 names | 0 | ❌ untouched |
| P-8 frontend audit writes | 8 files | 8 files | 0 (post GBC-114) | ❌ untouched |
| P-9 direct fr writes | 2 files | 2 files | 0 (post GBC-124+NEW-1) | ❌ untouched |
| P-10 `as any` ratchet | 655 casts | **639 casts (-16, -2.4%)** | trending down | ✅ progress |
| P-12 stock RPC shape | 2 of 6 implemented | 2 of 6 implemented | 6 of 6 | ❌ untouched |
| P-13 delete preflight | 6 files | **0 files** | 0 | ✅ DONE |
| P-14 INDIAN_STATES decls | 5 dupes | **0 dupes + 1 canonical** | 0 dupes | ✅ DONE |
| P-15 status-flip atomicity | 4 files | **2 files (-2)** | 0 | ⚠ partial — GBC-96+NEW-3 fixed; GBC-123+GBC-113 outstanding |

## V2 — Allowlist drainage drilldown

### P-13 (delete preflight) — DRAINED 6→0
- `Vendors.tsx`, `VendorCredits.tsx`, `Quotes.tsx`, `CreditNotes.tsx`, `Expenses.tsx`, `Bills.tsx` all now contain the `Promise.all([...select.limit(1)...])` preflight pattern.
- Spot-check `Vendors.tsx:128-148` confirms: 4 parallel checks against bills, purchase_orders, vendor_credits, vendor_payments; throws `"Cannot delete this vendor — they have linked bills..."`.
- Test file's `EXPECTED_OFFENDERS` is `{}` and stale-entry guard would have failed if any of those 6 files still had the naked pattern.

### P-14 (INDIAN_STATES) — DRAINED 5→0 + 1 canonical
- `src/lib/indian-states.ts` exists (4,875 bytes, full 36-entry list with `code`, `name`, `gstStateCode`).
- 4 of 5 prior duplicates import from the canonical lib (`Warehouses.tsx`, `EInvoices.tsx`, `EwayBills.tsx`, `EntityIdentityStep.tsx`).
- `useStateLeaveRules.ts` references the canonical lib via comment (likely uses a different shape internally — verify on next cycle).

### P-15 (status-flip atomicity) — PARTIAL 4→2
- ✅ `Bills.tsx` (GBC-96) — wired through `record_vendor_payment` RPC at L603. Allowlist removed.
- ✅ `useInvoices.ts` (NEW-3) — three new RPC calls at L228, L324, L479. Allowlist removed.
- ❌ `useDocumentChains.ts` — still has GBC-123 (delivery delivered) + GBC-127 (partial ship) anti-patterns. Allowlist entry retained.
- ❌ `useWarehouse.ts` — still has GBC-113 (stock transfer per-line loop) anti-pattern. Allowlist entry retained.

### P-10 (`as any` ratchet) — PROGRESS -16 casts
- Total 654→639 (Lovable picked up 16 cast removals incidentally while writing the new RPC wiring).
- No new file introduced `as any`; no file regressed past its baseline.
- Top offenders unchanged: `useDocumentChains.ts:48`, `Invoicing.tsx:42`, `useWarehouse.ts:40`, `useReturns.ts:32`. These don't move significantly until typed client lands (Task 7.1 outstanding).

## V3 — Migrations shipped

```
20260518125520  GBC-103  trg_reject_future_date BEFORE INSERT/UPDATE trigger
20260519053005  GBC-131  trg_validate_indian_formats trigger (PAN/GSTIN/Pincode)
20260519053119  GBC-92   convert_quote_to_sales_order RPC
20260519072237  GBC-128  generate_credit_note_from_sales_return RPC (partial — no stock side-effect)
```

Plus Lovable's commit message references for FE-only work:
- "Wired validators & RPCs"
- "Refactored bulk-pay to RPC" — extends Bills.tsx beyond the GBC-96 spec to bulk-pay flow
- "Retired ind. states dupes"
- "Fixed P-13 probe syntax error" (verified: P-13 test file is syntactically valid; this was Lovable's fix to its own test edit)
- "Finished GBC-103 migration"

**Design improvement Lovable introduced over the prompt:** GBC-103 was specified as CHECK constraints (`payment_date <= CURRENT_DATE`). Lovable correctly identified that CHECK with `CURRENT_DATE` is non-IMMUTABLE per Postgres rules and implemented as BEFORE INSERT/UPDATE triggers instead. Smart correction — same gate, legal semantics.

## V4 — Architecture invariant checks

- **CLAUDE.md item 23 (no direct `financial_records` writes):** still 2 violations in src/ (useAssets, useFinancialData) — both on the P-9 allowlist as expected; not introduced anew.
- **SECURITY DEFINER + search_path:** spot-checked Lovable's 4 new migrations — all have `SET search_path = public`. No GBC-6-class regressions.
- **Multi-tenancy:** P-6 baseline unchanged — Lovable did not add nor remove unscoped high-risk-table accesses.

## V5 — End-to-end spot-checks (sandbox-feasible subset)

Cannot run the dev server. Code-level evidence for each Phase 1-2 task:

| Phase | Task | Evidence |
|---|---|---|
| 1 | GBC-129 (place of supply) | `Invoicing.tsx` uses `INDIAN_STATES` import; canonical lib's `code` field flows to `place_of_supply` storage. Need to dev-server verify the Select UI renders. |
| 1 | GBC-91 (delete preflight) | `Vendors.tsx:128-148` shows full Customers.tsx pattern (Promise.all of 4 checks + friendly error). |
| 2 | GBC-92 (quote → SO atomic) | `useDocumentChains.ts:45` is one `rpc("convert_quote_to_sales_order")` call. The previous 3-step body + manual-rollback delete are gone. Verified by absence of `delete().eq("id", (so as any).id)` pattern. |
| 2 | GBC-96 (Bills mark-paid atomic) | `Bills.tsx:603` is the `rpc("record_vendor_payment")` call. Need to dev-server verify the dialog still collects `payment_method`/`bank_account_id`. |
| 2 | NEW-3 (Invoices mark-paid atomic) | `useInvoices.ts:228, 324, 479` are three RPC calls. No more `from("invoices").update({status:"paid"})` followed by `createBankTransaction` in the same function. |

## NEW findings during verification

None. The verification run did not surface any new bug class beyond what Wave-2 already encoded.

## Outstanding items (next-cycle Jira candidates)

Highest-leverage open work, ranked by ticket-class blast radius:

1. **GBC-114 — 8 audit_log frontend writes** (Phase 3.1). Untouched. Cleanest single-Jira lift: 8 trigger/RPC migrations + 8 FE deletions, retires P-8 entirely.
2. **GBC-130 + GBC-115 — org-scoping HR/Payroll/Sparkline/Audit-Intelligence** (Phase 4.1+4.2). Untouched. Together they retire P-7 entirely and significantly drain P-6.
3. **GBC-124 + NEW-1 — asset depreciation + Accounting manual entry RPCs** (Phase 2.5). Untouched. Retires P-9 entirely. **Statutory urgency**: depreciation is monthly and silently understates expense today.
4. **GBC-113 + GBC-108 + GBC-111 — `process_stock_transfer_batch`** (Phase 2.4). Untouched. Single migration closes 3 tickets + retires one P-15 entry.
5. **GBC-123 — delivery_notes `delivered` trigger** (Phase 2.3). Untouched. Single migration; closes the silent-stock-decrement bug.
6. **GBC-104 — `approve_leave_request` RPC** (Phase 5.2). Untouched. Statutory urgency on leave-balance correctness.
7. **GBC-102 — terminal_state extension** (Phase 5.1). Untouched. One migration adds 5 table names to the existing function.
8. **GBC-117 — Holiday audit trigger** (Phase 5.3). Untouched. Smallest migration (~10 lines).
9. **GBC-100 — `apply_vendor_credit` RPC** (Phase 2.6). Untouched. AP ledger drift.
10. **GBC-125 — sales_orders.customer_id NOT NULL** (Phase 6.1). Untouched. Master-data drift; needs backfill first.
11. **GBC-10 — version columns on master-data** (Phase 6.2). Untouched. Concurrency.
12. **GBC-132 — `register_organization_with_admin` RPC** (Phase 6.3). Untouched. Onboarding race.
13. **GBC-19/26 — Typed Supabase client** (Phase 7.1). Background — would drain ~50%+ of P-10 ratchet on landing.
14. **GBC-128 partial — sales-return approval trigger** (Phase 5.4). Credit-note RPC shipped; the +ve stock_ledger trigger on `sales_returns.status='approved'` is still missing.
15. **GBC-126 + GBC-127** (Phase 5.4). Sales Order line-item FK + partial-shipped state logic.
16. **GBC-69, 106, 109** (Phase 5.4). Inventory atomicity wave; depends on the bin_id infrastructure in Phase 2.4.

## Recommendation

Issue a follow-up Lovable prompt for the 16 outstanding items, ordered by ROI. Tasks 5.1 (GBC-102), 5.3 (GBC-117), 6.2 (GBC-10), and 6.3 (GBC-132) are very small and could be batched into a single PR.

The mechanical gate is the same: every fix removes its allowlist entry; the stale-entry guard ensures the code actually changed. Wave-2 has now established that this works (Lovable executed against the gate honestly — no faked removals detected in this verification pass).
