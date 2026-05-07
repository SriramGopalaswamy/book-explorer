# GBC-4: Soft-delete inconsistencies across hooks

**Severity:** Low · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** needs-input

## Root cause
RLS policies and most hooks filter `WHERE deleted_at IS NULL`, but analytics hooks may not. Result: dashboard totals include soft-deleted rows; list views don't. Issue lists `useAnalytics`, `useDashboardStats`, `useCashFlow`, `usePayrollAnalytics`, `useStatutoryData`, `useAssets`.

## Council verdict (compressed)
- *Contrarian:* Some analytics legitimately want all-time including deleted (e.g., "Total invoiced ever"). Don't blindly filter.
- *First-Principles:* "Active records" view is a database concern, not a hook concern. Create `v_<table>_active` views; rewrite hooks to query views; queries that genuinely want soft-deleted go directly to the base table.
- *Expansionist:* Cover every analytic; pair with GBC-2/3 to avoid touching the same hook twice.
- *McKinsey:* High-value first: dashboard, cashflow, P&L (financial) — those affect money.
- *Executor:* Per table with `deleted_at`, create `CREATE VIEW v_<table>_active AS SELECT * FROM <table> WHERE deleted_at IS NULL`; rewrite hooks; document the convention.

## Status
needs-input — schema views + per-hook rewrite.

## Risks
1. View vs base table swap may change RLS behaviour subtly; inherit RLS via `SECURITY INVOKER` views.
2. Some analytics legitimately want soft-deleted rows; document those exceptions.
3. Lint/build/test could not run in this sandbox.
