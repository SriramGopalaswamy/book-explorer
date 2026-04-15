

## Problem

Every database migration triggers a PostgREST schema cache reload. During this ~10-30s window, Supabase queries are slow or fail. The `SubscriptionGuard` has an 8-second hard timeout that **always** redirects to `/subscription/activate` when it fires — regardless of whether the user actually needs activation.

This is the **third time** this has caused a full-app lockout. The root issue: the guard treats "couldn't verify in time" the same as "no subscription exists."

## Root Cause

```text
Migration deployed
  → PostgREST schema cache reloads (~10-30s)
  → useUserOrganization / subscription queries slow/fail
  → SubscriptionGuard timeout fires at 8s
  → Always redirects to /subscription/activate  ← BUG
```

## Fix Plan

### 1. SubscriptionGuard: Timeout should let users through, not block them

**Current behavior (line 62-66):** Timeout → redirect to `/subscription/activate`

**New behavior:** Timeout → **let the user through** (render children). The reasoning: a false-positive "let them in" is infinitely better than locking out every user. If there's truly no subscription, the next successful query will redirect them properly.

```typescript
// If timed out, let users through rather than blocking
if (timedOut) {
  console.warn("SubscriptionGuard: timed out — allowing access");
  return <>{children}</>;
}
```

### 2. SubscriptionContext: Treat errors as "no activation needed" not "needs activation"

When `orgError` is true (query failed, not "org doesn't exist"), the current code sets `needsActivation: true`. This is wrong — a network error shouldn't trigger activation. Change to only set `needsActivation` when the query **succeeded** but returned no org.

```typescript
// org query errored (network issue) → don't assume needs activation
if (orgError) {
  return { ...defaults, loading: false, needsActivation: false };
}
// org query succeeded but no org found → needs activation
if (!org) {
  return { ...defaults, loading: false, needsActivation: true };
}
```

### 3. useUserOrganization: Add `placeholderData` to survive transient failures

Already has `placeholderData: (prev) => prev` which is good, but also increase `staleTime` to 30 minutes so cached data survives longer during schema reloads.

### Files to change

| File | Change |
|------|--------|
| `src/components/auth/SubscriptionGuard.tsx` | Timeout → render children instead of redirect |
| `src/contexts/SubscriptionContext.tsx` | Separate error vs. empty-result handling |
| `src/hooks/useUserOrganization.ts` | Increase staleTime to 30 min |

### Why this won't recur

The fundamental shift: **timeout = permissive** (let users in) instead of **timeout = restrictive** (lock users out). Even if PostgREST takes 60 seconds to reload, users continue working with cached data. The guard only blocks when queries **succeed** and confirm there's no subscription.

