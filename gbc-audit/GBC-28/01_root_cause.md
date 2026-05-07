# GBC-28 — Root cause investigation

**Issue:** Cache Bleeding (Tenant Security) — React Query hooks that omit `orgId` from their `queryKey` array can leak Org A's data into Org B's view during an org-switch until refetch completes.

## 1. What the issue claims

`queryKey: ["sales_orders"]` instead of `queryKey: ["sales_orders", orgId]`. When a user switches organizations, React Query's cache key collides; the previous org's payload is served from cache for the duration of `staleTime` (60s in this codebase) before a refetch lands.

## 2. What the code actually does

A grep over `src/hooks/*.ts` for `queryKey:` shows three classes of hooks:

**(A) Already org-scoped** — most hooks, including `useReturns` (`["sales-returns", orgId]`), `useLeaves` request hooks (`[..., orgId, isDevMode]`), `useInventory` (`["items", orgId]`, `["warehouses", orgId]`, `["stock-adjustments", orgId]`, `["uom", orgId]`, `["reorder-alerts", orgId]`), `usePayments` (`["payment-receipts", orgId]`, `["vendor-payments", orgId]`), `useDashboardStats` (`["dashboard-stats", user?.id, orgId, isDevMode]`), `useGSTReconciliation`, `useRecurringTransactions`, `useCurrencyAndFiling.exchange-rates`. The pattern is solid here.

**(B) Missing `orgId`, but the underlying data is global**:

- `useCurrencyAndFiling.ts:29` — `["currencies"]`. Currencies are a global reference table; no leak.
- `useTDSEngine.ts:54` — `["tax-regimes"]`. Global statutory data.
- `useTDSEngine.ts:68` — `["tax-slabs", regimeId]`. Global statutory data, scoped by regime.

These are correctly *not* org-scoped.

**(C) Missing `orgId`, and the data IS org-scoped — confirmed cache-bleed risk**:

- `src/hooks/useLeaves.ts:560` — `queryKey: ["leave-types"]`.
- `src/hooks/useLeaves.ts:589` — `queryKey: ["leave-types-all"]`.
- `src/hooks/useCurrencyAndFiling.ts:78` — `queryKey: ["gst-filing-status", financialYear]`.
- `src/hooks/usePayrollAnalytics.ts:21` — `queryKey: ["payroll-analytics", user?.id]` (uid is in the key, but org-scoped data should still include orgId so an admin switching orgs sees correct analytics).
- `src/hooks/useStatutoryData.ts:267,354,439,468,507,539,583` — seven `queryKey: [<form>, from, to]` entries (`gstr1`, `gstr3b`, `tds24q`, `tds26q`, `pf_ecr`, `esi`, `prof_tax`) — all of these hit Supabase tables filtered server-side by RLS, but the *cache key* doesn't include the org. Switching orgs serves stale tax/PF data for up to 60s.
- `src/hooks/useTDSEngine.ts:86,106` — `["employee-tax-settings", profileId, fy]` and `["investment-declarations", profileId, fy]`. Profile-scoped, and a `profileId` *is* org-bound, but a privileged user (admin/HR) hitting the same UI for two different employees in two different orgs would get keys that disambiguate by `profileId` — so this is borderline OK. Worth still pinning org for defence-in-depth.

A separate weakness: **`invalidateQueries({ queryKey: ["X"] })` everywhere drops the org argument**. React Query's "loose" invalidation accepts a prefix match, so `qc.invalidateQueries({ queryKey: ["sales-returns"] })` does invalidate `["sales-returns", orgId]` correctly. Not a bug, but make sure the convention is documented; new contributors copying a paired `invalidateQueries` line could mistakenly expect strict equality.

## 3. Is the claim accurate?

**partially confirmed.** The pattern is real, but the issue's headline example (`["sales_orders"]`) is *not* one of the offenders today — `useReturns`, `useInventory`, `usePayments` etc. all already include `orgId`. The actual offenders cluster in `useLeaves` (leave-types/leave-types-all), `useCurrencyAndFiling` (gst-filing-status), `usePayrollAnalytics`, and the statutory export hooks (`useStatutoryData`).

## 4. Deeper root cause

There is no central convention or lint rule for queryKey shape. The closest thing is `src/test/tenant-isolation.test.ts`, which asserts ORG_SCOPED hooks include `organizationId` in *queries*, but doesn't audit the React-Query cache key. The bleed is therefore a forward-compat hazard: each new hook author either remembers or doesn't.

Two structural options:
- A `queryKeyFor(name, orgId, ...rest)` helper that throws when `orgId` is missing for an org-scoped name, plus an enum of allowed names.
- A static-analysis test (regex on `src/hooks/*.ts`) that enumerates known org-scoped query names and asserts their literal arrays include an `orgId` token.

This issue prefers option 2 — easy to ship, no code refactor, clear regression guard. Per the (b) directive on this audit run, the resolution is the test alone; the per-hook fixes are flagged as `needs-input` follow-ups.

## 5. Blast radius

Cache-bleed window is bounded by React Query defaults set in `App.tsx:123-145`: `staleTime: 60s`, `gcTime: 10min`, `refetchOnWindowFocus: false`. So the practical leak is up to 60 seconds of an org's data visible to a privileged user after they switch orgs. For statutory data this includes GSTR-1/3B figures; for `useLeaves.leave-types` it's harmless metadata; for `useCurrencyAndFiling.gst-filing-status` it's filing posture metadata.

Affected pages: any screen that consumes `useLeaveTypes()` (Settings → Leave Types and the leave application form), `useGstFilingStatus()` (Statutory Findings), `useStatutoryData` exports (Statutory Findings), `usePayrollAnalytics` (Payroll dashboard).

## 6. Reversibility

A single-character per-line change (`["leave-types"] → ["leave-types", orgId]`) per offender. Trivially revertable. The test-as-spec we ship in this issue is purely additive.

## 7. Pre-existing tests

`src/test/tenant-isolation.test.ts` covers query *predicates* (looks for `.eq("organization_id", ...)` in hook source) but does not check `queryKey` shape. We extend that file's pattern with a focused new test file: `src/test/query-key-tenancy.test.ts`.
