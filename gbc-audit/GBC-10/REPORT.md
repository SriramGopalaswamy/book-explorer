# GBC-10: Lack of optimistic concurrency control

**Severity:** Medium · **Category:** Cross-cutting — Performance & Reliability · **Status:** needs-input

## Root cause
No `version` (or `updated_at`-as-fence) column on critical tables: `profiles`, `purchase_orders`, `inventory_items`, `salary_structures`, `financial_records`. Concurrent edits silently lose data ("last writer wins" with stale field overwrites).

## Council verdict (compressed)
- *Contrarian:* Optimistic locking forces a refresh-and-retry UX; some workflows can't afford it.
- *First-Principles:* Every mutable row in a multi-user system needs a fence (version int or updated_at). The mutation must be `WHERE id = X AND version = Y RETURNING *`; if 0 rows, raise.
- *Expansionist:* Apply to every "master data" table (the issue's list) and probably every transactional table too.
- *McKinsey:* Master-data first (profiles, salary_structures); ledger tables next (financial_records, journal_lines).
- *Executor:* Standard recipe: ADD COLUMN `version int NOT NULL DEFAULT 1`; trigger `BEFORE UPDATE … SET version = OLD.version + 1`; UPDATE WHERE clause includes version; client surfaces a "this record was modified by someone else" UI.

## Status
needs-input — schema changes + trigger + per-mutation update + UX dialog.

## Risks
1. The conflict UI must merge cleanly; just refusing the save is hostile.
2. Some workflows do legitimate overwrites; allow an "override" path with a confirmation.
3. Lint/build/test could not run in this sandbox.
