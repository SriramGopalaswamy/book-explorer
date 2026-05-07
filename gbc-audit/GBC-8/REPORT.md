# GBC-8: Audit triggers don't capture before/after diffs

**Severity:** Low · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** needs-input

## Root cause
Audit triggers record that an UPDATE happened but not which fields changed or their before/after values. For sensitive fields (vendor bank accounts, salary master), this is forensically inadequate. Captured for Finance per the issue; missing for Profiles and Salary Master.

## Council verdict (compressed)
- *Contrarian:* Storing full before/after for every column on every update is expensive — restrict to sensitive columns.
- *First-Principles:* Audit log should be a `jsonb_diff(OLD::jsonb, NEW::jsonb)` so the diff is queryable per-field.
- *Expansionist:* Apply to any "master data" table (profiles, salary_structures, vendors, customers, organizations).
- *McKinsey:* Highest-value first: profiles, salary_structures, vendors. Defer the long tail.
- *Executor:* Update audit-log triggers to compute `jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))` for sensitive columns; store under a `changes` jsonb column on `audit_logs`.

## Status
needs-input — trigger changes per table.

## Risks
1. Sensitive fields (e.g. password hashes) must NOT be stored even in audit log; allow-list per table.
2. Storage cost grows with edits; rotate/archive old audit rows to cold storage.
3. Lint/build/test could not run in this sandbox.
