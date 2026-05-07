# GBC-29: Main Dashboard — zero-flash loading state

**Severity:** Medium · **Category:** Screen Review — Financial Suite · **Status:** resolved
**Branch:** `claude/execute-code-prompt-txEjJ`

## Resolution
`src/pages/Dashboard.tsx:199-236` — wrapped the three `<ModuleCardEnhanced>` cards in the same `statsLoading` ternary that already gates the StatCards above; renders three `<Skeleton className="h-48 rounded-2xl" />` while loading. The "real zero" case (loading=false, data=0) still renders the cards with zero values, so day-1 users see "0 Employees" not skeletons.

## Root cause
Top half of dashboard wraps `StatCards` in `statsLoading ? <Skeleton /> : ...`. Bottom half (`ModuleCardEnhanced` showing "Financial Suite", "HRMS", "Performance OS") renders directly with `data ?? defaultsZero` so the user sees ₹0/0 employees/0% briefly until a refetch lands. UX flicker, not a security/data bug.

## Council verdict (compressed)
- *Contrarian:* Cosmetic; minor.
- *First-Principles:* Loading and "no data" must be distinguishable from "real zero".
- *Executor:* Wrap each `ModuleCardEnhanced` in the same `isLoading ? <Skeleton /> : ...` guard, OR render the card with a `loading` prop that shows shimmering numbers.

## Status
needs-input — single-component change in `src/pages/dashboard/Dashboard.tsx` (or wherever the modules are rendered).

## Risks
1. Make sure "loading=false, data=zero" still renders zero correctly (real users with 0 employees on day 1 should see "0 Employees", not skeleton).
2. Lint/build/test could not run in this sandbox.
