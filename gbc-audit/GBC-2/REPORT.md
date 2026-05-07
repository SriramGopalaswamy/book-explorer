# GBC-2: RLS subquery performance / "recursive" policies

**Severity:** High · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-2

## Root cause

`supabase/migrations/20260325000005_fix_rls_unscoped_admin_policies.sql` (and similar) embeds correlated subqueries inside the `USING` clause of RLS policies, e.g.:

```sql
USING (is_admin_or_hr_in_org(auth.uid(),
       (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id)))
```

Postgres' planner generally caches and inlines `STABLE`-marked function calls, but a subquery whose key is a column on the outer table (`profile_id` here) is correlated and is re-evaluated per row in the worst case. With tens of thousands of rows in `attendance_records` or `financial_records`, that's tens of thousands of `profiles` lookups per query.

Confirmed pattern; the fix is one of:
1. **Denormalise `organization_id` onto every table** (the issue's recommendation) and rewrite the policy to a single column compare. Same pattern as GBC-3.
2. **Replace the subquery with a STABLE helper function** marked `LANGUAGE sql STABLE` so the planner can fold it.
3. **Add a covering index** on `profiles(id, organization_id)` — Postgres still does the lookup but it's cheap.

Option 1 is the codebase's existing direction (per the dual `user_id`/`profile_id` audit in `CLAUDE.md`).

## Council verdict (compressed)

- *Contrarian:* Today the data volumes are small; benchmark before refactoring the entire RLS layer.
- *First-Principles:* RLS should be O(1) per row; a column compare is the only design that scales.
- *Expansionist:* The subquery pattern recurs across `payroll_records`, `payroll_adjustments`, `state_history`, `document_chains`, `vendor_credits`, `expense_approvals`, `stock_ledger`, `warehouse_bins` (all named in the issue). Pick one schema, apply the pattern, copy.
- *McKinsey:* Pick the three tables most likely to exceed 100k rows (attendance_records, financial_records, stock_ledger) and denormalise those first.
- *Executor:* (a) add `organization_id` column with a backfill from the FK chain; (b) maintain it via trigger on insert/update; (c) rewrite the policy; (d) add an index on `(organization_id, ...common-filters...)`. One-table-at-a-time over multiple branches.

**Chosen approach (deferred under directive (b)):** Pure schema/code change — needs migrations, triggers, RLS rewrites, and reverification per table. Status `needs-input`.

## What changed
Nothing on this branch.

## What didn't change (needs-input — per-table migration plan)

| Table | Add `organization_id` | Backfill from | Trigger |
|---|---|---|---|
| `attendance_records` | already has it (per CLAUDE.md) | n/a | n/a |
| `payroll_records` | already has it | n/a | n/a |
| `payroll_adjustments` | needs check | parent payroll_records | INSERT/UPDATE |
| `salary_components` | NEW | salary_structures → profiles | INSERT/UPDATE (also GBC-3) |
| `state_history` | NEW | parent (entity-type-specific) | INSERT/UPDATE |
| `document_chains` | NEW | originating doc | INSERT/UPDATE |
| `vendor_credits` | needs check | bills → vendors | INSERT/UPDATE |
| `expense_approvals` | NEW | parent expense | INSERT/UPDATE |
| `stock_ledger` | NEW | items / warehouses | INSERT/UPDATE |
| `warehouse_bins` | NEW | warehouses | INSERT/UPDATE |

For each: write the migration, write the trigger, rewrite the RLS policy to use the new column, add a `(organization_id, …)` covering index, regenerate Supabase types.

## Risks
1. Backfill on big tables locks reads briefly. Use `CREATE INDEX CONCURRENTLY` and batched UPDATE patterns.
2. Trigger maintenance overhead — keep triggers simple and add tests that the column stays in sync after parent updates (cascade on `organization_id` changes — rare but possible).
3. RLS rewrite changes query plans; manually `EXPLAIN ANALYZE` against representative data before promoting to prod.
4. Lint/build/test could not run in this sandbox.
