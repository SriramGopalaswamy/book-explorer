# Auth/Session Architecture Simplification — Deferred Plan

**Status:** NOT shipped. Requires a feature branch + 1-week soak.

## Why deferred (devil's advocate verdict)

Each piece of the current "rot" is actually load-bearing:

| Component | Looks like | Actually is |
|---|---|---|
| MS365 optimistic adoption (`adoptSession` in AuthContext) | A race condition | The only way login works on slow networks (hotel wifi, 3G) — `setSession()` blocks on the GoTrueClient LockManager which can stall indefinitely |
| Heartbeat-purge in AuthContext | Causes silent logouts in iframes | Enforces 3-concurrent-session cap + DPDPA 30-min idle (`mem://tech/security/session-management-rules`) |
| `refetchOnWindowFocus: "always"` on session-context | Request storm | THE self-heal fix from `mem://tech/security/session-context-self-heal` — removing it reintroduces the super-admin-only lockout |
| 4 hooks (`useUserOrganization`, `useCurrentRole`, `useIsSuperAdmin`, `useSessionContext`) | Duplicative | 52 files import them. Collapsing requires a coordinated migration. |

## Phased plan (when we tackle it)

### Phase 1 — Hook consolidation ✅ DONE (2026-05-12)
- `useSessionContext` is the single source of truth.
- `useUserOrganization` (src/hooks/useUserOrganization.ts) — thin reader, no extra network call.
- `useRoles` (useIsAdminOrHR / useIsFinance / useIsManager / useCurrentRole) — thin reader.
- `useIsSuperAdmin` (src/hooks/useSuperAdmin.ts) — thin reader + persisted localStorage hint for eager super-admin UX.
- NOT doing: deleting useUserOrganization.ts and migrating 52 import sites. Pure rename churn, zero behavioral benefit, real regression surface. The wrapper IS the consolidation.

### Phase 2 — Direct-query fallback removal (medium risk)
- `useSessionContext` currently has both `fetchViaRpc` (6s timeout) AND `fetchViaDirectQueries` (parallel REST). Remove the fallback only after monitoring `[session-ctx] rpc failed` warnings in production for 1 week and confirming zero occurrences.

### Phase 3 — MS365 optimistic adoption replacement (HIGH risk)
- Replace `adoptSession` with `await supabase.auth.setSession()` + 8s timeout (NOT 3s — slow networks).
- Behind a feature flag (`systemFlags.use_strict_ms365_session`).
- E2E test on throttled network (3G profile) before flipping flag.
- Rollback path: flip flag, no code revert needed.

### Phase 4 — DO NOT TOUCH
- Heartbeat-purge: compliance regression (DPDPA + 3-session cap).
- `refetchOnWindowFocus: "always"`: self-heal rule.
- RLS policies, org-scoping, audit chain.

## What we DID ship today
- Removed `[useUserOrganization]` per-render `console.log` spam.
- Removed `[payroll-watchdog]` diagnostic — Payroll loads correctly.
- Earlier fix in `useUserOrganization.ts`: gate ONLY on `organizationId` (not `organization` metadata), so a transient null `organization` join no longer leaves consumer hooks `enabled: false` forever.
