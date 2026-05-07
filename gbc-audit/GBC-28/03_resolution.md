# GBC-28 — Resolution

## Files changed
- `src/test/query-key-tenancy.test.ts` (new) — three-invariant regression suite + self-cleaning offender allowlist.

## Summary
Per directive (b) on this audit run, no hook source is modified on this branch. The new test pins a global/org-scoped/expected-offenders contract over `src/hooks/*.ts` so any new hook that adds an org-scoped query without `orgId` fails CI, and any fix to an existing offender forces the fixer to remove its name from `EXPECTED_OFFENDERS` (keeping the punch-list current).

## Punch-list (next sprint, `needs-input` for code change)
| File | Line | queryKey | Suggested fix |
|---|---:|---|---|
| `src/hooks/useLeaves.ts` | 560 | `["leave-types"]` | `["leave-types", orgId]` |
| `src/hooks/useLeaves.ts` | 589 | `["leave-types-all"]` | `["leave-types-all", orgId]` |
| `src/hooks/useCurrencyAndFiling.ts` | 78 | `["gst-filing-status", financialYear]` | `["gst-filing-status", financialYear, orgId]` |
| `src/hooks/usePayrollAnalytics.ts` | 21 | `["payroll-analytics", user?.id]` | `["payroll-analytics", user?.id, orgId]` |
| `src/hooks/useStatutoryData.ts` | 267 | `["gstr1", from, to]` | `["gstr1", from, to, orgId]` |
| `src/hooks/useStatutoryData.ts` | 354 | `["gstr3b", from, to]` | `["gstr3b", from, to, orgId]` |
| `src/hooks/useStatutoryData.ts` | 439 | `["tds24q", from, to]` | append `orgId` |
| `src/hooks/useStatutoryData.ts` | 468 | `["tds26q", from, to]` | append `orgId` |
| `src/hooks/useStatutoryData.ts` | 507 | `["pf_ecr", from, to]` | append `orgId` |
| `src/hooks/useStatutoryData.ts` | 539 | `["esi", from, to]` | append `orgId` |
| `src/hooks/useStatutoryData.ts` | 583 | `["prof_tax", from, to]` | append `orgId` |
| `src/hooks/useTDSEngine.ts` | 86 | `["employee-tax-settings", profileId, fy]` | append `orgId` (defence-in-depth) |
| `src/hooks/useTDSEngine.ts` | 106 | `["investment-declarations", profileId, fy]` | append `orgId` (defence-in-depth) |

## What was deferred
- Per-hook fixes (above table). Status `needs-input` per directive (b).
- `useOrgQuery` facade + ESLint rule (First-Principles council option). Recorded for the strategic backlog in `_SUMMARY.md`.

## Test results
Cannot run — sandbox blocks `npm install`. The hook in `.claude/hooks/session-start.sh` will run the test once a `vendor/node_modules.tar.gz` is seeded. Reviewer: `npm run test -- src/test/query-key-tenancy.test.ts`.

## Manual verification
- Sign in as user-A in Org A, navigate to Statutory Findings, view a GSTR-1 export.
- Switch to Org B (without hard reload). The GSTR figures must update; observe network tab for refetch within ~60s.
- Without the per-hook fix, you may see the previous org's data for up to `staleTime` (60s).

## Rollback
`git revert <commit>` — purely additive.

## Status
`partially-resolved` — regression guard shipped; the 13-line punch-list of per-hook fixes is `needs-input` per directive (b).
