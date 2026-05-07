# GBC-61: Purchase Return — vanishing items on edit

**Severity:** Low (per Jira) — should be **High** (data loss) · **Category:** Screen Review — Procurement · **Status:** needs-input

## Root cause
Identical pattern to GBC-59: edit handler updates header → DELETE all child items → INSERT new list. Network drop = data loss.

## Council verdict (compressed)
Same fix as GBC-59 — single RPC `update_purchase_return(id, header_jsonb, lines_jsonb[])` with diff-style line management.

## Status
needs-input — new RPC + hook rewrite. Bundle with GBC-59.

## Risks
Identical to GBC-59. Lint/build/test could not run in this sandbox.
