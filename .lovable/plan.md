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

### Phase 2 — Direct-query fallback removal — ❌ CANCELLED (2026-05-12)
- `fetchViaDirectQueries` is NOT dead code. It exists for **client-side 6s timeouts** on slow networks (hotel wifi, 3G), not server failures.
- Server-side Postgres logs cannot observe this — they only see successful or errored RPC calls, not client requests that never completed within the timeout window.
- Removing the fallback would silently regress slow-network users to an indefinite hang.
- Would only be safe with browser-side telemetry (Sentry timing histogram of RPC duration); we don't have that. Not worth installing for this.

### Phase 3 — MS365 `adoptSession` replacement — ❌ CANCELLED (2026-05-12)
- Reading the code: `adoptSession` exists because `supabase.auth.setSession()` acquires the GoTrueClient `LockManager` and can hold it indefinitely (upstream supabase-js issue with `navigator.locks` contention).
- An 8s timeout on `setSession()` does NOT release the lock — it only makes the timeout fire while every subsequent `supabase.from(...)` call still hangs waiting for the lock.
- The current optimistic-adoption code IS the correct workaround. There is no simpler architecture that doesn't reintroduce the original bug (employees/payroll/payslips hanging right after MS365 callback).

### Phase 4 — DO NOT TOUCH (unchanged)
- Heartbeat-purge: compliance regression (DPDPA + 3-session cap).
- `refetchOnWindowFocus: "always"`: self-heal rule.
- RLS policies, org-scoping, audit chain.

## Verdict (2026-05-12)
The "rot" is load-bearing. Phase 1 hook consolidation is done. Phases 2 & 3 are cancelled — devil's advocate won. Further "simplification" of the auth/session layer would be regression, not progress.

## What we DID ship today
- Removed `[useUserOrganization]` per-render `console.log` spam.
- Removed `[payroll-watchdog]` diagnostic — Payroll loads correctly.
- Earlier fix in `useUserOrganization.ts`: gate ONLY on `organizationId` (not `organization` metadata), so a transient null `organization` join no longer leaves consumer hooks `enabled: false` forever.
