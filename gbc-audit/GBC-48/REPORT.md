# GBC-48: E-Way Bills — no fetch limit (million-row trap)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
No `.limit()` on the e-way bills hook; downloads every bill ever generated. Logistics-heavy companies (50/day → 15k+ in a year) will see ever-slower load times leading to tab freeze.

## Council verdict (compressed)
Same template as GBC-31/34: cursor pagination + server-side search/filter + virtualised table.

## Status
needs-input — pagination + RPC.

## Risks
1. Existing aggregations on the full set must move to SQL.
2. Lint/build/test could not run in this sandbox.
