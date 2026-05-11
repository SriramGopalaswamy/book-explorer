# GBC-5: No centralised global store (Zustand/Redux)

**Severity:** Low · **Category:** Cross-cutting — Frontend Architecture · **Status:** closed (wontfix — architectural by design)
**Closed:** 2026-05-11 — React Query is the de-facto global store; adding Zustand/Redux would duplicate it. Any specific cross-module staleness bugs surface as their own Jira tickets with concrete reproduction steps; the "build an invalidation matrix" prophylactic work is not warranted absent evidence of real user-visible staleness.
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-5

## Root cause

App uses React Query for data fetching/caching but has no Zustand/Redux/Jotai. Cross-module state synchronisation (e.g. updating an Employee in HR → Finance UI sees stale name) relies on React Query's invalidation. Risk: when HR mutates a profile, the Finance hook's queryKey may not be invalidated (different cache key), so the user sees stale data until the staleTime window elapses.

## Council verdict (compressed)

- *Contrarian:* React Query is a global store. Zustand for UI-only state, but adding it for data is duplication.
- *First-Principles:* The real bug is *missing invalidations*, not missing global state. Fix by ensuring every mutation invalidates the cross-module queryKeys it affects.
- *Expansionist:* Audit every mutation hook for what it doesn't invalidate. Most existing mutations already chain `qc.invalidateQueries({ queryKey: ['X'] })` for related caches.
- *McKinsey:* Don't add a new state library. Audit invalidation completeness instead — much smaller change.
- *Executor:* Build an "invalidation matrix" — for each mutation, list all affected queryKey prefixes. Encode as a tests-as-spec assertion.

**Chosen approach (deferred under directive (b)):** Code-change for invalidation audit. Status `needs-input`. The structural Zustand/Redux suggestion is rejected — orthogonal to the actual bug.

## What changed
Nothing on this branch.

## What didn't change (needs-input)
- Build the invalidation matrix (mutation hook → affected queryKey prefixes).
- For each gap, add `qc.invalidateQueries({ queryKey: ['affected'] })` in `onSuccess`.
- Optionally formalise as a `useMutationWithInvalidations()` helper that takes the matrix as data.

## Risks
1. Over-invalidation triggers unnecessary refetches (perf hit). Be precise.
2. Lint/build/test could not run in this sandbox.
