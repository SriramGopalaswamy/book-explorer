# Lovable prompt — GRX10 ERP backend hardening pack

Copy everything inside the fenced block below into Lovable on the `book-explorer` project.

---

```
You are working on the GRX10 ERP application (Vite + React + TypeScript + Supabase). All Supabase migration files live under `supabase/migrations/`. Read `CLAUDE.md` first — it contains binding invariants you MUST respect, in particular:

- `financial_records` rows with a non-null `journal_entry_id` are owned by the trigger `trg_sync_financial_records`. Never write to those rows directly; only insert journal_lines and let the trigger derive financial_records.
- The address-field standard is `address_line1, address_line2, city, state, pincode, country` — never a single `address` column.
- `organization_compliance` holds legal/branding identity; `organization_settings.logo_url` holds the logo. Do not add columns to the wrong table.
- The dual `user_id` / `profile_id` audit table in CLAUDE.md must be respected — `Reimbursements.tsx:115` still uses `user_id` and must be migrated before the column is dropped.
- Regression-prevention protocol: before any multi-file rewrite, list every field/handler/route the file currently has; after the rewrite, diff your own change for accidental deletions.

Generate ONE migration per task below. Each migration must be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`), include explicit RLS policies on every new table, and pin `SET search_path = public, pg_temp` on every `SECURITY DEFINER` function. Add tests in `src/test/` where reasonable.

After each migration, regenerate `src/integrations/supabase/types.ts` via `supabase gen types typescript --linked` and remove the now-unnecessary `as any` casts from hooks that touch the changed tables.

# TASK 1 — Tighten storage bucket policies (GBC-7, GBC-15)

The `invoice-assets` bucket currently has a flat `auth.role() = 'authenticated'` SELECT policy (see `supabase/migrations/20260312210000_restrict_invoice_assets_bucket.sql`). Any user from any organization can read every invoice PDF/logo.

Migration `<timestamp>_invoice_assets_org_scoped_policy.sql`:
1. Adopt the path layout `<organization_id>/<resource>` for new uploads.
2. Replace the flat SELECT policy with: `bucket_id = 'invoice-assets' AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text`.
3. Add an admin/finance escape-hatch policy mirroring `bill-attachments` (see `20260221052919_*.sql`).
4. Migrate existing objects: a one-shot `DO $$ ... $$` block that iterates `storage.objects WHERE bucket_id='invoice-assets' AND (storage.foldername(name))[1] !~ '^[0-9a-f-]{36}$'` and copies each object to the org-prefixed path (use `invoices.organization_id` join on the storage path-suffix to discover the right org).
5. Update `src/pages/financial/InvoiceSettings.tsx:176` and any other call site to write under `${orgId}/...` and read via `createSignedUrl(path, 3600)` instead of `getPublicUrl`.
6. Confirm the existing test `src/test/storage-bucket-policy.test.ts` still passes; remove `invoice-assets` from `KNOWN_FLAT_AUTHENTICATED` in that file.

# TASK 2 — Denormalise organization_id onto detail tables (GBC-2, GBC-3)

For each of these tables, ADD COLUMN `organization_id uuid` (NOT NULL after backfill) with FK to `organizations(id)`. Backfill from the parent table per the source listed. Add a BEFORE INSERT/UPDATE trigger that copies the parent's organization_id when the child row is written. Then rewrite the RLS policy to a single column compare (drop the subquery-based policy from `20260325000005_fix_rls_unscoped_admin_policies.sql`). Add a covering index on `(organization_id, …common-filter…)`.

| Table | Backfill source |
|---|---|
| salary_components | salary_structures → profiles |
| state_history | parent table by entity_type |
| document_chains | originating doc table |
| expense_approvals | parent expenses |
| stock_ledger | items |
| warehouse_bins | warehouses |
| payroll_adjustments | parent payroll_records |
| vendor_credits (verify) | vendor → org |

DO NOT add `organization_id` to `currencies`, `tax_regimes`, `tax_slabs`, `pin_codes` — those are tenant-global. The existing test `src/test/query-key-tenancy.test.ts` lists these in `GLOBAL_QUERY_NAMES`.

# TASK 3 — Optimistic concurrency (GBC-10)

For each: `profiles, purchase_orders, inventory_items, salary_structures, financial_records, journal_entries, sales_orders, invoices, bills, payroll_records`:

1. ADD COLUMN `version int NOT NULL DEFAULT 1`.
2. BEFORE UPDATE trigger that bumps `NEW.version = OLD.version + 1`.
3. Update every mutation hook to `.update(...).eq('id', X).eq('version', currentVersion)` and surface a "Record was modified by someone else, refresh?" dialog when the affected row count is 0.

# TASK 4 — Tenant timezone (GBC-9)

1. ALTER TABLE organizations ADD COLUMN `tenant_timezone text NOT NULL DEFAULT 'Asia/Kolkata'` with CHECK against `pg_timezone_names`.
2. Replace any server-side `now()` in late-mark/leave/attendance triggers with `now() AT TIME ZONE org.tenant_timezone`.
3. Expose `tenant_timezone` in `useSessionContext` so the frontend can use `formatInTimeZone(date, tenantTz)` for all rendering.

# TASK 5 — Export audit log (GBC-13)

```
CREATE TABLE public.export_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  entity          text NOT NULL,
  entity_filter   jsonb,
  row_count       integer,
  file_format     text NOT NULL CHECK (file_format IN ('pdf','csv','xlsx','json')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own org export events" ON public.export_audit_log
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "admins read org export events" ON public.export_audit_log
  FOR SELECT USING (is_admin_or_hr(auth.uid()) AND organization_id = get_user_organization_id(auth.uid()));
```

Add a `src/hooks/useExportAuditLogger.ts` that exposes `logExport({entity, entityFilter, rowCount, fileFormat})` and call it from every export site (statutory data exports in `useStatutoryData.ts`, `usePdfExport.ts`, payslip export in `PaySlipDialog.tsx`, etc.).

# TASK 6 — Single-RPC multi-step mutations (GBC-36, 37, 39, 43, 44, 59, 61, 62)

Create these SECURITY DEFINER functions, each running in a single transaction. Drop the equivalent client-side multi-call code from the corresponding hooks.

- `convert_quote_to_invoice(quote_id uuid)` — INSERT invoice + INSERT lines + UPDATE quote.status='converted'. Idempotent via `quotes.converted_invoice_id`.
- `mark_expense_paid(expense_id uuid, payment_method text, bank_account_id uuid)` — UPDATE expense.status + INSERT journal_entry (let the trigger derive financial_records) + INSERT bank_transaction.
- `approve_reimbursement(reimbursement_id uuid)` — UPDATE reimbursement + INSERT expense + INSERT journal_entry + INSERT bank_transaction.
- `record_payment_receipt(invoice_id, amount, method, bank_account_id)` — INSERT receipt + UPDATE invoice paid_total + INSERT bank_transaction. Reject if amount > balance.
- `record_vendor_payment(bill_id, amount, method, bank_account_id)` — INSERT payment + UPDATE bill.status + INSERT bank_transaction.
- `update_purchase_order(po_id uuid, header jsonb, lines jsonb[])` — diff-update lines (INSERT new, DELETE removed, UPDATE changed) inside one transaction; preserves audit history. Same pattern for `update_purchase_return` and `update_sales_order`.

# TASK 7 — Status-transition GL/inventory triggers (GBC-40, 41, 63, 64)

- AFTER UPDATE trigger on `credit_notes`: when `OLD.status != NEW.status` and `NEW.status IN ('issued','applied')`, INSERT the matching journal entry (DR Sales Returns, CR Accounts Receivable for issued; DR Accounts Receivable, CR original invoice's receivable for applied).
- Same for `vendor_credits` mirrored to AP side.
- AFTER UPDATE trigger on `deliveries`: when `OLD.status != 'returned' AND NEW.status = 'returned'`, INSERT a `stock_in` movement per delivery line into `stock_ledger`.
- Same when a `sales_returns` row is approved (status='approved' transition).

Backfill: write idempotent one-shot scripts that, for every existing row already at the terminal status with no matching journal/stock entry, post the missing entry dated to the original transition timestamp.

# TASK 8 — Server-side ledger maths (GBC-32, GBC-53)

Replace the JS reducers on `LedgerExplorer.tsx` and `CADashboard.tsx` with SQL functions:

- `gl_account_running_balance(account_id uuid, from_date date, to_date date)` returns `(entry_id, occurred_at, debit, credit, running_balance)` with the opening balance applied. Respect period locks.
- `trial_balance_status(period text)` returns `(is_balanced boolean, total_debits numeric, total_credits numeric)`.

# TASK 9 — Server-side aggregations (GBC-42, GBC-50)

- `cashflow_monthly_trend(from_date date, to_date date)` returns `(month text, inflow numeric, outflow numeric, net numeric)`.
- `analytics_monthly_revenue_expense(from_date date, to_date date)` returns the 12-bucket time series for the Analytics chart.
- `unrealized_fx_pnl(as_of date)` for IAS 21 — joins financial_records × currencies × exchange_rates over the whole dataset.

# TASK 10 — Pagination + FTS (GBC-14, GBC-31, GBC-34, GBC-38, GBC-48, GBC-57, GBC-65)

For each of `invoices, bills, journal_entries, bank_transactions, eway_bills, stock_ledger, audit_logs, sales_orders`:

1. ADD COLUMN `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(<list of text columns>, ''))) STORED`.
2. CREATE INDEX `idx_<table>_search_vector` ON `<table>` USING `gin (search_vector)`.
3. For invoice/bill numbers (substring-search), additionally enable `pg_trgm` and `CREATE INDEX … USING gin (<number_column> gin_trgm_ops)`.
4. Replace the `useX` hooks' `.limit(N)` + `.ilike(...)` with a `search_<table>(q text, page int, page_size int, …filters)` SQL function returning `(rows jsonb, total_count int)`.
5. Frontend pages move to cursor- or page-pagination using the function output.

# TASK 11 — Long-running job framework (GBC-11, GBC-1)

```
CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,        -- 'payroll', 'bulk_upload', 'year_end_close'
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  progress jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz, finished_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_job_runs_single_flight
  ON public.job_runs(kind, organization_id, (progress->>'period'))
  WHERE status IN ('queued','running');
```

Add RLS: org-scoped read/insert. Then for each long-running flow, add an RPC + Edge Function pair: `enqueue_<job_kind>(...)` returns the job_run id, `process_<job_kind>` Edge Function picks queued rows, updates progress, marks succeeded/failed. Frontend subscribes to `postgres_changes` on `job_runs` for live updates.

The four target flows: `usePayrollEngine` (GBC-1), `useBulkUpload` (GBC-1), year-end close, manufacturing `useUpdateWOStatus` start-production (GBC-1 atomicity).

# TASK 12 — Search-path hardening (GBC-6)

Ensure every SECURITY DEFINER function created on or after `20260312` includes `SET search_path = public, pg_temp`. Run the existing test `src/test/security-definer-search-path.test.ts` — fix any that the test surfaces.

# TASK 13 — Inventory adjustments line items (GBC-58)

`stock_adjustments` has only header columns today. Add a child table:

```
CREATE TABLE public.stock_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_adjustment_id uuid NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),  -- denormalised per TASK 2
  item_id uuid NOT NULL REFERENCES public.items(id),
  quantity_delta numeric NOT NULL,
  unit_cost numeric,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Trigger on `stock_adjustment_lines` posts to `stock_ledger`. Update the `Adjustments.tsx` form to expose a Line Items table.

# TASK 14 — Vendor delete referential guard (GBC-35)

Add a BEFORE DELETE trigger on `vendors` that raises if any of: `bills`, `vendor_payments`, `purchase_orders`, `vendor_credits` reference the vendor (and `deleted_at IS NULL`). Better: prefer soft delete (set `deleted_at`) — see CLAUDE.md soft-delete pattern.

# TASK 15 — Recurring transactions GL fields exposed in UI (GBC-51)

`recurring_transactions.debit_account_id` and `credit_account_id` exist in schema. Add the dropdowns to the form in `RecurringTransactions.tsx` populated from `chart_of_accounts WHERE organization_id = currentOrg`. Make both required. Add a guard in the Edge Function scheduler that skips templates with NULL accounts and logs a warning.

# What success looks like

After Lovable runs all 15 tasks:
- `npm run lint`, `npm run build`, `npm run test` all pass.
- The 4 existing static-analysis tests under `src/test/` (memo-storage-policy, storage-bucket-policy, query-key-tenancy, security-definer-search-path) continue to pass; offending entries should be removed from the EXPECTED_OFFENDERS / KNOWN_FLAT_AUTHENTICATED allowlists as fixes land.
- Every new SECURITY DEFINER function pins search_path.
- `gbc-audit/_INDEX.md` statuses can be updated from `needs-input` to `resolved` per issue.

Stage tasks in this order for safest rollout:
1, 12 (security guards) → 2, 3 (denormalise + concurrency, foundation for everything) → 4 (timezone) → 6, 7 (transactional RPCs + status triggers) → 8, 9 (server-side maths) → 10 (pagination/FTS) → 11 (job framework) → 13, 14, 15 (focused fixes).
```
