# GBC-27: Massive over-fetching via `.select("*")`

**Severity:** Low · **Category:** Cross-cutting — Database Code Patterns · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-27

## Root cause

Verified: 170 `.select("*")` occurrences across `src/`. Most fetch entire rows when the UI only renders a handful of columns. Wastes bandwidth and CPU; for tables with `notes`/`description` columns or large JSON, the cost is non-trivial.

## Council verdict (compressed)

- *Contrarian:* `select("*")` is a fine starting point; only swap to a column list when a query is actually slow.
- *First-Principles:* Hide it behind typed view models; the hook returns only what the UI consumes.
- *Expansionist:* All hooks; same template.
- *McKinsey:* Top-10 by table size and call frequency: `attendance_records`, `financial_records`, `journal_lines`, `payroll_records`, `bills`, `invoices`, `sales_orders`, `purchase_orders`, `audit_logs`, `stock_ledger`. Address those first.
- *Executor:* Per hook, `select("col1, col2, …")` from the actual table; type the return; remove `as any`.

**Chosen approach (deferred under directive (b)):** Pure refactor; combines well with GBC-19/26 (typed Supabase client).

## What changed
Nothing on this branch.

## What didn't change (needs-input)
- Top-10 hooks fetched against the high-cardinality tables above; switch to explicit columns.
- Long-tail: gradually as touched.

## Risks
1. Selecting fewer columns means the hook may not return a property the UI silently relies on. Use TypeScript to catch.
2. Lint/build/test could not run in this sandbox.
