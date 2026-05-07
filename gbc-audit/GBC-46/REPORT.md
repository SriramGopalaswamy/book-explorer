# GBC-46: Assets — million-row crash potential

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useAssets` fetches every asset for the org with no pagination/limit. 50-asset companies are fine; 10k-asset hospitality/manufacturing companies will OOM the browser tab.

## Council verdict (compressed)
- Pagination + virtualised table (e.g. `react-virtualized` or shadcn DataTable virtualisation).
- Server-side aggregations for "Total Asset Value", "Depreciation YTD" — replace JS reducers with SQL functions.

## Status
needs-input — pagination + RPC aggregations.

## Risks
1. Existing UI may call `assets.length` etc. directly; refactor to use the RPC count.
2. Lint/build/test could not run in this sandbox.
