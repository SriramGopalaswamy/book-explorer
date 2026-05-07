# Council on GBC-28 — Cache Bleeding (Tenant Security)

Background: 60s cache-bleed window in React Query when org-scoped hooks omit `orgId` from `queryKey`. Most hooks are clean; about a dozen offenders remain (`useLeaves.leave-types`, `useStatutoryData.*`, `useCurrencyAndFiling.gst-filing-status`, `usePayrollAnalytics`).

## Round 1 — Independent positions

### The Contrarian
Half the "missing orgId" cases are global lookups (currencies, tax-regimes, tax-slabs). The remaining handful would each leak metadata for under 60 seconds at most, and only in the unusual flow of a privileged user switching orgs in the same tab. Most production deployments will never see this. The proposed fix is one-character changes across ~10 hooks; the proposed audit machinery is bigger than the bug. Recommend: fix the four hooks with genuine PII/financial exposure (statutory exports, payroll analytics), leave the rest, and skip the regression test as overkill. Risk of investing engineering time on a 60-second metadata flicker is greater than the leak itself.

### The First-Principles Thinker
The cache key is just a serialised dependency vector for memoisation. The right model: every memoised value names every input it depends on. `orgId` is a hidden input the moment a hook reads from a tenant-scoped table. A queryKey-shape audit is a symptom-treatment; the structural fix is to wrap React Query in a thin facade `useOrgQuery(name, fetcher, deps)` that *prepends* `orgId` automatically and forbids raw `useQuery` for org-scoped data through ESLint. Until that lands, individual offenders will keep being added each sprint. Recommend the facade as the durable fix; tests-as-spec are an interim measure.

### The Expansionist
This pattern is everywhere: `invalidateQueries({ queryKey: ["X"] })` calls drop `orgId` too. React-Query's prefix-match invalidation makes that *behaviourally* correct, but copy-pasted by a contributor who reads only the invalidation site you can easily get a brand-new hook with an unscoped queryKey. Two adjacent issues compound: GBC-25 (item 3a) names this same bug class and points to `useItems` and `useRoles` specifically. We should write **one** regression test that covers all of (a) org-scoped tables → orgId in queryKey, (b) global lookups don't need orgId, (c) global lookups must NOT include orgId (else cache miss-storms), and treat GBC-25's example list as the seed.

### The McKinsey Consultant
Lowest-cost meaningful win: the test-as-spec pinning today's clean hooks and listing the known offenders. That alone prevents regression across the 60+ hooks already in good shape, and turns the per-hook fixes into a curated punch-list rather than an audit hunt. The expensive option (facade + ESLint rule) is correct strategically but quadruples the work for marginal short-term gain. ROI ranking: 1) regression test (today), 2) one-line fixes per offender (next sprint), 3) facade refactor (later quarter).

### The Executor
Branch: include in the audit run. Resolution under (b) directive: write `src/test/query-key-tenancy.test.ts` that:
1. Reads each `src/hooks/use*.ts` file.
2. For an explicit allowlist of GLOBAL query names (`currencies`, `tax-regimes`, `tax-slabs`, `leave-types`-pending) — assert the query is allowed to omit `orgId`.
3. For an explicit list of ORG-SCOPED query names — assert their queryKey arrays contain `orgId` as a literal token.
4. Print the *current* offenders explicitly so the failing-test output doubles as the punch-list.

Do not touch hook source on this branch (per directive (b)). Status: `needs-input` for the per-hook fixes; the regression suite ships now.

## Round 2 — Anonymous peer review (positions relabelled A-E)

A=Expansionist, B=Executor, C=Contrarian, D=First-Principles, E=McKinsey.

**A on B/C/D/E:** B's plan is the right shape but it should ALSO emit a JSON punch-list, so the next-sprint engineer doesn't have to re-grep. C is wrong about overkill — the test is 60 lines of TS, the *bug* is the expensive thing. D's facade is the right answer eventually but not actionable today. E correctly orders the work.

**B on A/C/D/E:** A's "one regression test for all three flavours" is correct — strict allow/deny rather than just "must include orgId". C undersells the audit value; without the regression guard, the next intern's queryKey will leak again. D's facade requires touching every hook, which under the (b) directive isn't allowed on this branch.

**C on A/B/D/E:** A is making this bigger. B's plan is OK but should keep the offender list short (don't goldplate). D and E both vote for incrementalism; that's correct.

**D on A/B/C/E:** A and B both treat the symptom; C dismisses the bug; E ranks correctly. The facade is structurally right but everyone's pragmatically right that we can ship the test now.

**E on A/B/C/D:** B's plan is a clean MVP. A's expansion (cover both directions, allow-vs-deny) is a small marginal cost. C is wrong; the test prevents regression across 80 hooks-and-growing. D is the strategic follow-up.

## Round 3 — Verdict

**Chosen approach.** Ship a tests-as-spec regression suite (`src/test/query-key-tenancy.test.ts`) that pins three invariants:
1. An explicit list of GLOBAL query names (`currencies`, `tax-regimes`, `tax-slabs`) MAY omit `orgId`.
2. An explicit list of ORG_SCOPED query names MUST include the literal token `orgId` in their queryKey array.
3. The currently-known offenders (`leave-types`, `leave-types-all`, `gst-filing-status`, `payroll-analytics`, `gstr1`, `gstr3b`, `tds24q`, `tds26q`, `pf_ecr`, `esi`, `prof_tax`) are listed as `EXPECTED_OFFENDERS` so the suite passes today and will fail when one is fixed in isolation — forcing the fixer to also remove the entry from the allowlist (a self-cleaning checklist). Per directive (b), no hook source is modified on this branch; the per-hook fixes are flagged `needs-input`.

**Rejected and why.**
- *Do nothing* (Contrarian): leaves the bug on a 60-second timer indefinitely; no regression guard.
- *Fix only the high-value four* (Contrarian secondary): correct triage, but should be done by the follow-up branch, not this one — the test pins the punch-list.
- *Build the `useOrgQuery` facade now* (First-Principles): correct architecturally; out of scope for a security ticket; recorded as Q3 follow-up.
- *Patch `invalidateQueries` calls* (Expansionist secondary): React Query's prefix-match makes this safe; not a real bug.

**Open risks.**
1. The list of "global vs org-scoped" query names is hand-curated; new global tables won't auto-classify. Mitigated by the explicit-allowlist design — adding a hook forces a test update.
2. The test covers static text only (no runtime React Query); a hook that builds its queryKey dynamically (e.g. via a helper) won't match the regex and would silently pass. Today no hooks do this.
3. The 60-second window is bounded by `staleTime`. If someone changes the global default in `App.tsx`, the bleed window grows. Worth a stricter test against the staleTime constant — captured as follow-up.
4. Per-hook fixes are `needs-input`: shipping this branch alone closes nothing in production; it just freezes the contour.

**Definition of done.**
- `src/test/query-key-tenancy.test.ts` exists with the three invariants and the explicit `EXPECTED_OFFENDERS` list.
- Test reads `src/hooks/*.ts` directly (no mocks).
- `03_resolution.md` lists the 11 offenders as the next-sprint punch-list with file:line precision.
- `_INDEX.md` row says `partially-resolved`; `_SUMMARY.md` will absorb the per-hook fix work as a follow-up bucket.
