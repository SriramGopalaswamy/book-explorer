# GBC-3: Missing `organization_id` columns on detail tables

**Severity:** High · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-3

## Root cause

Detail/sub-tables (e.g. `salary_components → salary_structures → profiles → organization_id`) inherit org-scoping via multi-hop joins. RLS policies must traverse the join chain on every row check; queries against the child table degrade with row count.

This is the schema-side companion to **GBC-2**. Both issues prescribe the same fix: denormalise `organization_id` onto every table.

## Council verdict (compressed)

- *Contrarian:* Some tables (e.g. `tax_regimes`, `currencies`) are genuinely tenant-global; do not add `organization_id` to those.
- *First-Principles:* `organization_id` is a *partition key*, not metadata. Every multi-tenant table should have it as part of its primary key or a covering index.
- *Expansionist:* Same root cause as GBC-2; same migration template.
- *McKinsey:* Add to the top-five highest-cardinality detail tables first; defer the long tail.
- *Executor:* For each detail table: ALTER TABLE ADD COLUMN, backfill from parent, NOT NULL constraint, FK to organizations, trigger to maintain on insert/update of parent, rewrite RLS policy, regenerate types.

**Chosen approach (deferred under directive (b)):** Same migration plan as GBC-2 — see that report's table.

## What changed
Nothing on this branch.

## What didn't change (needs-input)
See the per-table table in `gbc-audit/GBC-2/REPORT.md`. Apply identical migration template per detail table.

## Risks
1. Same as GBC-2.
2. Tables that are intentionally *global* (`currencies`, `tax_regimes`, `tax_slabs`, `pin_codes`) must NOT receive `organization_id` — confirm classification before each migration.
3. Lint/build/test could not run in this sandbox.
