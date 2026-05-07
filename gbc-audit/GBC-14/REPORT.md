# GBC-14: ILike search bottleneck

**Severity:** Medium · **Category:** Cross-cutting — Performance & Reliability · **Status:** needs-input

## Root cause
`.ilike('%term%')` cannot use a B-tree index in Postgres because of the leading wildcard; every search becomes a sequential scan. Issue lists 12 hooks: `useInvoices, useBills, usePayments, useJournalEntry, useEmployees, useAttendance, useLeaves, useInventory, usePurchaseOrders, useSalesOrders, useAuditLogs, useMemos`. Confirmed pattern.

## Council verdict (compressed)
- *Contrarian:* Below 5,000 rows, sequential scan is microseconds. Don't optimise prematurely.
- *First-Principles:* Use Postgres native FTS (`tsvector` + `gin` index) or `pg_trgm` for substring/fuzzy.
- *Expansionist:* Twelve hooks; same template applies. Build a `search_<table>(query text)` SQL function once, replace each `.ilike()` call.
- *McKinsey:* Top three by row growth: invoices, bills, audit_logs. Apply FTS there; leave others on ILIKE until they hit the 5k threshold.
- *Executor:* Per target table: (a) add `search_vector` `tsvector` column with a generated expression; (b) `CREATE INDEX … USING gin (search_vector)`; (c) add `search_<table>(q text)` SQL function; (d) hook calls the function instead of `.ilike()`.

## Status
needs-input — schema changes + per-hook update.

## Risks
1. `pg_trgm` vs FTS choice depends on whether substring or word-token search is wanted. Invoice numbers want trigram (substring); customer names want FTS.
2. Search-vector backfill on big tables is non-trivial.
3. Lint/build/test could not run in this sandbox.
