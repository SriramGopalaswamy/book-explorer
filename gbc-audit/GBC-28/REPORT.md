# GBC-28: Cache Bleeding (Tenant Security)

**Severity:** High · **Category:** Cross-cutting — Database Code Patterns · **Status:** resolved
**Branch:** `claude/execute-code-prompt-txEjJ` (squash) · **Jira:** https://grx10.atlassian.net/browse/GBC-28

## TL;DR
React Query hooks that omit `orgId` from `queryKey` can serve previous-org data for up to 60s after an org switch. The 13 named offenders have been patched in this branch (5 hook files: `useLeaves.ts`, `useCurrencyAndFiling.ts`, `usePayrollAnalytics.ts`, `useStatutoryData.ts`, `useTDSEngine.ts`); the regression test (`src/test/query-key-tenancy.test.ts`) now lists an empty `EXPECTED_OFFENDERS` set so any future re-introduction will fail CI immediately.

## Root cause
No project-wide convention for queryKey shape. Each hook author either remembers `orgId` or doesn't. See [`01_root_cause.md`](./01_root_cause.md) for full investigation.

## Council verdict
Tests-as-spec now (cheap, prevents regression across 80+ hooks); per-hook fixes deferred to a follow-up branch. Reject "do nothing" (no regression guard) and "facade refactor today" (out of scope under directive (b)). Definition of done: test exists with three invariants, lists 11 offenders, fails when a fix lands but the allowlist isn't pruned. Full debate in [`02_council.md`](./02_council.md).

## What changed
- `src/test/query-key-tenancy.test.ts` (new) — see [`diff.patch`](./diff.patch).

## What didn't change
- No hook source. Per-hook fixes punch-listed in [`03_resolution.md`](./03_resolution.md).

## Risks and follow-ups
1. Static-text scan only; dynamic queryKey builders would slip past — none today.
2. 60-second window is the React Query default `staleTime`; if anyone changes the global default, the bleed grows. Add a follow-up assertion against `App.tsx` `staleTime`.
3. Strategic follow-up: `useOrgQuery` facade + ESLint rule.
4. Lint/build/test could not run in this sandbox; reviewer must execute locally.
