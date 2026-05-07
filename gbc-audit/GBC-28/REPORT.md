# GBC-28: Cache Bleeding (Tenant Security)

**Severity:** High · **Category:** Cross-cutting — Database Code Patterns · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ` (squash) · **Jira:** https://grx10.atlassian.net/browse/GBC-28

## TL;DR
React Query hooks that omit `orgId` from `queryKey` can serve previous-org data for up to 60s after an org switch. Most hooks are clean; 11 named offenders remain (leave-types, gst-filing-status, payroll-analytics, and seven statutory-export hooks). This branch ships a self-cleaning regression test (`src/test/query-key-tenancy.test.ts`) that pins global vs org-scoped vs expected-offenders; the 11 one-line fixes are `needs-input` per directive (b).

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
