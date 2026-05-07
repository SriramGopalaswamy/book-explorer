# GBC-47: Statutory Findings — query storm + browser-based accounting

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
On open, the page fires 10+ simultaneous queries (GSTR-1, GSTR-3B, TDS24Q/26Q, PF, ESI, PT) regardless of which tab is active. Even users wanting just PF wait for all 10. Plus the per-form math runs in the browser → at scale, results may be incorrect (paginated input).

## Council verdict (compressed)
- **Lazy-load per tab.** Each form's hook only runs when its tab is active. React Query's `enabled: activeTab === 'gstr1'` is the one-line fix per hook.
- **Move math server-side.** Each form's totals (GSTR-1 outward supplies, TDS aggregates, PF wage ceiling logic) should be a SQL function or Edge Function returning the final dataset. Aligns with GBC-1.

## Status
needs-input — `enabled` flags + per-form RPCs. Lazy-load is a quick win; server-side compute is the structural fix.

## Risks
1. Compliance: incorrect statutory exports trigger penalties. Test against a known-good dataset before promoting.
2. Lint/build/test could not run in this sandbox.
