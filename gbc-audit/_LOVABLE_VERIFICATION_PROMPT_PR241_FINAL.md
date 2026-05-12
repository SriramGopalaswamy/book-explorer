# Lovable verification prompt — PR #241 final round

Two new migrations + six UI flows to smoke-test. This is read-only +
in-app interaction; no schema design decisions for you to make. If any
step fails, stop and report which numbered step + the exact error
message + the page URL.

## 0. Pull main

Make sure your working tree is on the latest `main` (PR #241 merged).

## 1. Apply the two new migrations

These must apply cleanly (idempotent — `CREATE OR REPLACE` + `CREATE
EXTENSION IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`).

- `supabase/migrations/20260511120000_fix_trial_balance_column_names.sql`
  - **Why:** The earlier `trial_balance()` RPC referenced
    `gl_accounts.account_code` / `gl_accounts.account_name`, but those
    columns don't exist (the table has `code` / `name`). PL/pgSQL
    deferred column resolution to execution time, so the old migration
    applied successfully but the first runtime call would have raised
    `column a.account_code does not exist`. This migration re-issues
    the function with the correct columns and aliases them back to
    `account_code` / `account_name` in the result.
- `supabase/migrations/20260511130000_chart_and_search_rpcs.sql`
  - **Why:** Adds four chart/search RPCs that move client-side
    aggregations onto the server, plus two `pg_trgm` GIN indexes.

Confirm via the SQL editor that the following 5 functions now exist
and are owned by `postgres`:

```sql
SELECT proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'trial_balance',
    'search_bank_transactions',
    'cash_flow_monthly',
    'monthly_revenue',
    'expense_breakdown'
  )
ORDER BY proname;
```

Expected: 5 rows with the correct argument signatures.

## 2. Trial Balance — GBC-53 smoke test

1. Sign in as an admin / finance role on a tenant that has at least
   one posted journal entry.
2. Go to **Financial → CA Dashboard**.
3. Click the new **Trial Balance** tab.
4. Verify:
   - The table renders with columns `Code`, `Account`, `Type`,
     `Debit`, `Credit`, `Balance`.
   - Codes / names match what's in **Financial → Accounting** (chart
     of accounts).
   - The final "Total" row's Debit total **equals** its Credit total
     (the green "Balanced" badge in the header should match).
   - Pagination control works at the bottom (page-size dropdown +
     prev/next).
5. Open the browser network panel and confirm one POST to
   `/rest/v1/rpc/trial_balance` with body `{ "p_as_of": "<today>" }`.

## 3. Ledger Explorer — GBC-32 smoke test

1. Go to **Financial → Ledger Explorer**.
2. Pick any GL account from the dropdown.
3. Confirm a new strip appears above the per-row table with three
   labelled values: **Total debits**, **Total credits**, **Net
   balance (as of today)**.
4. The displayed totals should match the server's authoritative figures,
   regardless of how many entries are rendered below — the per-row
   running balance only covers the latest 200 journal entries, so for
   accounts with deep history the header totals should be **larger
   than** the largest running balance in the visible rows.
5. Network panel: one POST to `/rest/v1/rpc/gl_account_balance` with
   `{ "p_account_id": "<uuid>", "p_as_of": "<today>" }`.

## 4. Command-palette record search — GBC-31 smoke test

1. From anywhere in the app, press **Cmd+K** (or Ctrl+K).
2. Type **at least 2 characters** of a known customer or vendor name.
3. After ~250ms, confirm a new section labelled `Customers` (or
   `Vendors`, `Items`, `Invoices`, `Bills`) appears at the top of
   the dropdown, above the static menu list, listing up to 5 hits per
   module.
4. Each hit shows `label` (record name / number) and `sublabel`
   (email / status) in muted text.
5. Click any hit → you land on the relevant list page with `?q=<label>`
   in the URL. (The list page does **not** yet read this param — that's
   a follow-up. The hit acting as a confirmation-of-existence is the
   only thing being verified here.)
6. Network panel: 5 parallel POSTs to `/rest/v1/rpc/search_documents`,
   one per module, with the same `p_q`.
7. Edge case: type only 1 character → no RPCs fire and no `Records`
   section appears.

## 5. Banking — GBC-34 smoke test

1. Go to **Financial → Banking**.
2. In the search box, type part of a known transaction description.
3. After ~250ms, confirm the table re-renders showing only matching
   rows. The Account column should populate from
   `bank_accounts.name` (joined server-side by the RPC, not via a
   separate select).
4. Try the **Type** filter (Credits Only / Debits Only) → table
   updates without a page refresh.
5. Try **From** + **To** date filters → table updates.
6. Pagination: change page size to 25; click next → confirm the
   `from`/`to`/total counter at the bottom is consistent and that the
   server returns at most 25 rows per request.
7. Network panel: each filter / page change fires one POST to
   `/rest/v1/rpc/search_bank_transactions`. The previous
   `/rest/v1/bank_transactions?select=*` request should be gone.
8. **Index check:** the trigram indexes should make ILIKE fast even
   on big tables. Run in SQL editor:
   ```sql
   EXPLAIN ANALYZE
   SELECT *
   FROM bank_transactions
   WHERE description ILIKE '%test%'
     AND organization_id = '<your_org_id>'
   LIMIT 25;
   ```
   The plan should show `Bitmap Index Scan on
   idx_bank_transactions_description_trgm` (or a similar GIN scan),
   not a full `Seq Scan` on `bank_transactions`.

## 6. Cash Flow chart — GBC-42 smoke test

1. Go to **Financial → Cash Flow**.
2. Confirm the inflow/outflow area chart renders with **6** monthly
   buckets (the default).
3. Hover individual bars to spot-check the values against your
   `bank_transactions` ledger for those months.
4. Network panel: one POST to `/rest/v1/rpc/cash_flow_monthly` with
   `{ "p_months": 6 }`. The previous full-table scan of
   `bank_transactions` should be gone.

## 7. Dashboard charts — GBC-50 smoke test

1. Go to the main **Dashboard** page.
2. **Revenue chart:** confirm it renders. The label format on the X
   axis should be:
   - "DD Mon" for ranges ≤ 31 days
   - "DD Mon" (weekly start dates) for 32–90 days
   - "Mon YYYY" for > 90 days
3. **Expense Breakdown chart:** confirm the pie / donut shows category
   labels + amounts that match what you'd expect from
   **Financial → Expenses** (status = approved or paid) plus any
   manual journal entries against expense categories.
4. Network panel: one POST to `/rest/v1/rpc/monthly_revenue` and one
   to `/rest/v1/rpc/expense_breakdown`. The earlier
   `/rest/v1/financial_records?select=*` and
   `/rest/v1/expenses?select=category,amount` requests should be gone.

## 8. Regression checks (must not have broken)

- **Banking → Add Account / Add Transaction**: both dialogs still
  submit; transaction list refreshes after the mutation succeeds.
- **CA Dashboard → Sub-ledger Reconciliation, Period Close, Control
  Overrides, Anomalies tabs**: all still render their existing
  tables.
- **Cash Flow → Scheduled Payments**: list still loads and the
  Add/Mark Paid / Delete actions still work.
- **Dashboard cards** (Outstanding AR, AP, etc.): still populated.

## 9. Report back

Reply with one of:
- ✅ All 9 sections green → I'll mark GBC-31/32/34/42/50/53 as
  verified-resolved in the audit.
- ⚠️ Section N failed: `<step>` returned `<error>` on page
  `<url>` → I'll diagnose from there.

Do **not** make schema changes, write code, or "fix" anything you
spot beyond what's in these 9 sections — that's my job. If you find
something broken outside this list, just note it in the reply.
