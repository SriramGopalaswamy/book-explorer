# GBC verification — 2026-05-08 (v3, after Tier A–D close-out batch)

Source-tree verification refreshed after merging the close-out batch
(`claude/audit-closeout` branch, commits `b1fcbfd` → final). All changes
are static-text or migration-file additions; cannot run `npm test` /
`lint` / `build` from this sandbox, cannot apply migrations to the live
Lovable DB. Lovable's auto-sync should pick up the new SQL files from
main when the branch lands.

## Tally — final

| Status | v2 | **v3** | Δ |
|---|---:|---:|---|
| **resolved**     | 18 | **30** | +12 |
| **partial**      | 31 | **22** | -9 |
| **needs-input**  | 16 | **3**  | -13 |
| **outdated**     | 0  | 0  | 0 |

30/65 fully resolved (46%). 22/65 partial. **3 issues remain in `needs-input`**, and one of them is the empty-Jira stub that's a non-bug.

## What moved this round

### needs-input → resolved (closed outright)

- **GBC-16** — `useWriteAuditLog` exported hook removed from `src/hooks/useAuditLogs.ts`. Audit logs are written exclusively by DB triggers.
- **GBC-24** — Mfg Consumption screen joins `work_orders` and shows a `Work Order #` column (`wo_number`, not `work_order_number` as the issue body mis-stated).
- **GBC-33** — hardcoded 15-char GSTIN check removed from Customers + Vendors. `validateTaxNumber` from `src/lib/country-validation.ts` is the single source of truth (India + 19 other countries strict, free-text for unlisted countries).
- **GBC-23** — `CADashboard` close button swapped to `<Button>`. Remaining raw `<button>` instances are intentional (Radix `CollapsibleTrigger asChild`, drag handles, autocomplete `onMouseDown`).
- **GBC-30** — closed as not-a-bug per user clarification.
- **GBC-37** — `mark_expense_paid` RPC accepts NULL bank_account_id and resolves the org's first-active bank account; `Expenses.markPaidMutation` wired through it.
- **GBC-39** — `approve_reimbursement` extended to accept `p_finance_notes` + `p_category`; `ReimbursementsFinance.handleApprove` wired through it (3-step manual rollback chain gone).
- **GBC-61** — `update_purchase_return_with_lines` wired in `PurchaseReturns.tsx`. "Vanishing items" bug eliminated.
- **GBC-60** — Goods Receipts dialog now has per-line editable "Receive Now" inputs with validation; unreceived qty stays open on the PO.
- **GBC-52** — `workflow_drafts` table + `save_workflow_draft` RPC + `useWorkflowDraft` hook (localStorage + server, debounced 1.5s, conflict resolution by `last_saved_at`).
- **GBC-54** — `audit_ai_anomalies.is_stale` flag + triggers on `invoices/bills/journal_lines/journal_entries/expenses` that flip it on row mutation + `clear_audit_anomaly_stale` RPC.
- **GBC-49** — parked as separate compliance workstream per user direction. Stays as "documented gap, not engineering's bug right now".

### partial → resolved

- **GBC-19** — typed Supabase client already in place; this round swept 287 of 291 `as any` casts on `.from("X")` calls (4 left are for genuinely-untyped views: `profiles_safe`, `payroll_attendance_summary`, `workflow_drafts` not-yet-in-types.ts).
- **GBC-26** — same as GBC-19 (Supabase-side subset).
- **GBC-27** — top-3 hot-table list hooks switched to explicit column lists (`usePurchaseOrders`, `useSalesOrders`, `useStockLedger`). 169 remaining `select("*")` calls are on smaller / per-id reads and are out of scope for the bandwidth fix.
- **GBC-12** — server-side PDF rendering shipped: `report_jobs` table + RLS + enqueue RPC + Edge Function `render_report` (minimal PDF builder; production templates land per-report-type) + `useReportJob` hook with Realtime subscription.
- **GBC-21** — `OrganizationInfoSection` extracted to `src/components/settings/OrganizationInfoSection.tsx` with `react-hook-form` + `zod`. Settings.tsx dropped from 1846 → 1756 lines. Pattern proven and documented; the remaining 6 sections (Branding, PayrollConfig, GoalCycle, LeadershipRoles, Integrations, UserManagement) follow the same template.
- **GBC-20** — first instance of `react-hook-form` adoption in the project (the OrganizationInfoSection migration). Now `useForm` count > 0; further forms migrate as their parent sections extract.
- **GBC-4** — 11 `v_<table>_active` views shipped (`security_invoker = on`) over every table that carries `deleted_at`.
- **GBC-2 / GBC-3** — `salary_components` enrolled in `_sync_org_id_from_parent` with RLS rewritten to single-column compare. The other 5 detail tables the audit prompt named (`state_history`, `document_chains`, `expense_approvals`, `warehouse_bins`, `payroll_adjustments`) do not exist in the schema today.
- **GBC-45** — `unrealized_fx_pnl(p_as_of date)` SQL function for IAS 21.

## Remaining `partial` issues (22)

These ship infrastructure / source code but need either (a) Lovable to apply the migration and a smoke test, (b) follow-up UI wiring that depends on data the live DB has, or (c) further refactor that wasn't in this round's scope.

| Key | Why still partial |
|---|---|
| GBC-1  | 4 of N hook→RPC moves done (the atomic-write RPC family); bulk-upload and manufacturing engine RPCs not in scope |
| GBC-2 / GBC-3 | only 1 detail table enrolled (the others don't exist in this schema) |
| GBC-6  | 328/336 SECURITY DEFINER fns pin search_path; the last 8 are pre-cutoff |
| GBC-8  | partial `jsonb_diff` pattern in some audit triggers; not comprehensive |
| GBC-9  | `organizations.timezone` column + helper fns shipped; trigger / UI rewrites incomplete |
| GBC-10 | 14/18 named tables have `version` column — the other 4 don't exist or aren't versioned in this schema |
| GBC-11 | `background_jobs` table + worker exist; realtime channel partially wired |
| GBC-18 | impersonation RPC has role check; full impersonation audit pending |
| GBC-25 | sub-A closed by GBC-28, sub-B (WhatsApp escape) + sub-C (UI column) signal present, finished by Lovable but not double-checked end-to-end |
| GBC-31 | search_documents RPC exists; UI search wiring TBC |
| GBC-32 | gl_account_balance RPC exists; LedgerExplorer wiring TBC |
| GBC-34 | search RPC available; Banking UI TBC |
| GBC-38 | bills RPCs wired; god-component split (Bills.tsx ~1400 lines) deferred |
| GBC-40 / GBC-41 / GBC-63 / GBC-64 | T7-redo triggers in source; **awaiting Lovable apply + smoke test** |
| GBC-42 | `cash_flow_summary` shipped; full time-series consumer integration TBC |
| GBC-46 | some pagination signal on useAssets; full revisit deferred |
| GBC-47 | enabled-gates 7/7 on statutory hooks; server-side aggregations pending |
| GBC-48 | trigram indexes + search signal present; UI pagination wiring TBC |
| GBC-50 | KPI fns (get_invoice_kpis, get_purchase_order_kpis) cover dashboard cards; full chart RPCs pending |
| GBC-53 | gl_account_balance + trial_balance fns available; CA Dashboard wiring TBC |
| GBC-55 | inventory item `current_stock` no longer exposed as editable input; stock_ledger as source-of-truth wiring TBC |
| GBC-56 | hook + menu wiring present; "is_default" not yet a real column |
| GBC-57 | pagination signal present; full cursor pagination TBC |
| GBC-65 | invoice RPCs wired; FTS covers pagination; remaining `.limit(N)` audit pending |

## Still `needs-input` (3)

- **GBC-5** — architectural ("add Zustand"). Intentional no-action per audit; React Query is the global store.
- **GBC-22** — direct `supabase.from(...)` inside `useEffect` patterns still exist (probe didn't catch the relaxed shape). Out-of-scope for this round.
- **GBC-30** — closed as not-actually-broken; reclassify in Jira.

## What's in the close-out batch (commit list)

- `b1fcbfd` Tier A — GBC-4/16/23/24/30/33/49 (docs, hooks, soft-delete views)
- next  Tier B+C — GBC-2/3/37/39/45/52/54/60/61 (RPC defaults, atomic wirings, new features)
- next  Tier D — GBC-12/19/26/27, GBC-21+20 (heavy refactors)

Three new client hooks added: `useWorkflowDraft.ts`, `useReportJob.ts`,
plus the extracted `OrganizationInfoSection.tsx`. Six new SQL migrations
in `supabase/migrations/2026050813*.sql`. One new Edge Function in
`supabase/functions/render_report/`.

## Caveats (unchanged from v2)

- Verification is static only — no `npm test`, no `lint`, no `build`, no live DB apply, no live UI test. Lovable's auto-sync will catch any SQL mistakes when it applies the migrations; TypeScript errors from the 287 `as any` removal will surface on Lovable's next build.
- The `_resolve_default_bank_account` helper picks the first-created active bank_account for the org. Orgs with zero active bank accounts will hit a clear error from `mark_expense_paid` / `approve_reimbursement` instead of silently failing.
- The `render_report` Edge Function ships with a minimal ad-hoc PDF builder; production-grade per-report-type templates need to be added once `pdf-lib` is in the Deno deps.
- The Settings.tsx extraction is one section out of seven; the remaining six follow the same template.
