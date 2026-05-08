# Performance Sweep — Full Pass

Scope confirmed: indexes + pagination on all heavy lists + React Query caching + RLS nested-subquery rewrite. Pagination = numbered pages, 25/page (overrides current 10/page default for heavy lists; master/short lists keep 10).

This is a **multi-PR-sized** effort. I'll execute it in 4 sequential phases, each independently verifiable, so we can pause/inspect after any phase.

---

## Phase 1 — Profile + index migration (no app code changes)

**1a. Audit pass (read-only).** Run `supabase--linter`, sample slow queries via `pg_stat_statements` (`supabase--read_query`), and walk the gbc-audit reports already on disk. Output: a short table of (screen → hook → root cause → fix).

**1b. Index migration.** Single migration adding btree/composite indexes on the hot paths. All `IF NOT EXISTS`, all non-blocking (Postgres builds them online for our table sizes):

```text
Hot filter columns
  organization_id on every multi-tenant table that lacks it
  status on: invoices, bills, sales_orders, purchase_orders,
            goods_receipts, delivery_notes, work_orders,
            reimbursement_requests, expenses, payroll_entries
  is_deleted partial indexes WHERE is_deleted = false

Sort/paginate keys
  (organization_id, created_at DESC) on bills, invoices, assets,
   eway_bills, bank_transactions, stock_movements, expenses,
   journal_entries, audit_logs, notifications

Join keys
  profile_id, customer_id, vendor_id, item_id, warehouse_id,
   parent invoice_id / sales_order_id / bill_id on line tables
  user_id on user_roles, profiles (already PK-ish, verify)

Search support
  trigram (pg_trgm) GIN on bills.bill_number, invoices.invoice_number,
   assets.asset_code, items.item_code/name — for ILIKE search
```

## Phase 2 — Pagination + .limit() on heavy lists

For each list page below: replace unbounded / `.limit(500)` queries with **server-side numbered pagination (25/page)** using `.range()` + `count: 'exact'`, plus an optional date-range filter. Filters/search push to Postgres (`.ilike`, `.eq`, `.gte/.lte`).

| Page | Hook | Current | After |
|---|---|---|---|
| Bills | useBills | limit(500) + 1,400-line component | range(0,24), count exact, ILIKE on bill_number |
| Bank Txns | useBankTransactions | limit(20), client filter | range + server search |
| Assets | useAssets | unbounded | range + KPIs via RPC |
| E-Way Bills | useEwayBills | unbounded | range + filters |
| Stock Ledger | useStockLedger | limit(500) | range + date range |
| Invoices, Sales Orders, Purchase Orders, Goods Receipts, Delivery Notes, Sales/Purchase Returns, Journal Entries, Audit Log, Reimbursements, Expenses, Notifications | respective hooks | unbounded or large limit | range + filters |

Each page gets a numbered `Pagination` component (existing `usePagination` extended to server mode, or a thin wrapper that takes `{page, pageSize, total}`). KPI cards that today reduce in JS over the full set move to **lightweight aggregate RPCs** (one `SELECT count/sum GROUP BY status` per page).

## Phase 3 — React Query cache tuning

New `src/lib/query-defaults.ts` with named cache profiles, applied at hook level (no global change, to avoid surprising hot data):

```text
MASTER_DATA   staleTime 10m, gcTime 30m, refetchOnWindowFocus false
              → leave types, CTC components, chart of accounts,
                tax rates, holidays, departments, designations,
                warehouses, currencies, items (master list)

ROLES_PERMS   staleTime  5m, gcTime 15m, refetchOnWindowFocus false
              → user_roles for current user, role_permissions,
                module access, useSessionContext bootstrap
                (still purges on every auth event — Core rule respected)

TRANSACTIONAL staleTime 30s (unchanged behavior, made explicit)
              → invoices, bills, payroll_records, bank_transactions
```

Hooks updated to use these constants instead of ad-hoc `staleTime` values.

## Phase 4 — RLS rewrite (nested subqueries → has_role / get_user_org)

Audit every policy that contains `EXISTS (SELECT … FROM user_roles)` or `(SELECT organization_id FROM profiles WHERE …)` and replace with SECURITY DEFINER helpers:

```text
public.has_role(_user_id uuid, _role app_role)         -- exists
public.get_user_org(_user_id uuid)  RETURNS uuid       -- new, STABLE, SECURITY DEFINER
public.is_super_admin(_user_id uuid) RETURNS boolean   -- new, wraps has_role
```

Then for every policy currently doing `EXISTS (… profiles … organization_id = …)`, rewrite as `organization_id = public.get_user_org(auth.uid())`. Postgres can then use the `organization_id` btree index added in Phase 1 — this is where the biggest speedup comes from on multi-thousand-row tables.

**Safety:**
- All policy rewrites done in a single transactional migration with the **old policies kept under temporary names** (`*_legacy`) for one deploy cycle, so a rollback is `DROP POLICY new; ALTER POLICY legacy RENAME …;`.
- After migration: run `src/test/tenant-isolation.test.ts`, `rbac-rls-consistency.test.ts`, `role-access.test.ts` — these already exist and exercise the cross-tenant boundary.

---

## Deliverables (per phase)

- Phase 1 → 1 migration + a `gbc-audit/_PERF_AUDIT_2026-05.md` summary
- Phase 2 → ~12 hook edits + 1 small `<DataPagination/>` UI component
- Phase 3 → 1 new `query-defaults.ts` + edits to ~20 hooks (mechanical)
- Phase 4 → 1 migration + verification via existing tenant-isolation tests

## Risks & how I'll mitigate

1. **RLS rewrite is the highest-risk step.** I'll keep legacy policies as `*_legacy` for one deploy and run all three tenancy/role test files before declaring done.
2. **Hook signature changes** for paginated hooks will break callers. I'll keep the same return shape (`{ data, count, isLoading }`) and add `{ page, pageSize, search }` params with sensible defaults — no caller breaks unless it wants the new behavior.
3. **Index build time** — every table is small enough that `CREATE INDEX` (non-concurrent, inside migration) is fine; if any table is >1M rows we switch that one to `CONCURRENTLY` in a follow-up migration outside the transaction.
4. **Cache tuning could mask stale data** for roles. The `useSessionContext` self-heal rule (purge on every auth event) is preserved — the 5-minute staleTime only affects idle re-renders, not auth transitions.

## Estimated touch surface

- 2 migrations
- ~35 file edits in `src/hooks/` and `src/pages/`
- 1 new util file (`query-defaults.ts`)
- 1 new UI component (`DataPagination.tsx`)
- 0 schema changes (only indexes + policy rewrites)

If you approve, I'll start with **Phase 1** (audit + index migration) and check in with you before Phase 2 so you can see the impact on page-load times before we touch hook code.
