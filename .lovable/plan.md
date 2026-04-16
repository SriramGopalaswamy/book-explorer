

## Which Commit Bricked Sign-In

The three files edited in the last 24 hours were:
1. `src/components/auth/SubscriptionGuard.tsx` — permissive timeout (safe)
2. `src/contexts/SubscriptionContext.tsx` — error vs empty handling (safe)
3. `src/hooks/useUserOrganization.ts` — 30min staleTime (safe)

**None of these directly bricked sign-in.** The brick is caused by a pre-existing race condition in `AuthCallback.tsx` that was **identified but never fixed** in the previous round. The SubscriptionGuard changes may have shifted timing enough to make it worse.

## The Exact Bug (AuthCallback.tsx, lines 74-80)

```text
setSession() resolves
  → onAuthStateChange fires (React batches setState)
  → navigate("/") runs IMMEDIATELY        ← too early
  → ProtectedRoute reads user = null      ← batch not committed
  → Redirects to /auth
  → Auth.tsx useEffect sees user become non-null
  → Navigates back to "/"
  → Loop or permanent hang
```

## Fix Plan (3 files, root-cause only)

### 1. AuthCallback.tsx — Wait for auth state before navigating

Stop calling `navigate("/")` immediately after `setSession()`. Instead, set a flag and let a separate `useEffect` navigate only once `useAuth().user` is confirmed.

```typescript
const { user } = useAuth();
const [authComplete, setAuthComplete] = useState(false);

// After setSession succeeds:
setAuthComplete(true);
// Do NOT navigate here

// Separate effect waits for React to commit
useEffect(() => {
  if (authComplete && user) {
    navigate("/", { replace: true });
  }
}, [authComplete, user, navigate]);
```

### 2. Auth.tsx (line 81-85) — Guard against callback redirect loop

Add a check so Auth.tsx doesn't immediately re-navigate when the user just arrived from the callback:

```typescript
useEffect(() => {
  if (user && !location.pathname.startsWith("/auth/callback")) {
    navigate(from, { replace: true });
  }
}, [user, navigate, from, location.pathname]);
```

### 3. Index.tsx — Add 10s safety timeout fallback

If the guard chain (org → subscription → role) hangs beyond 10 seconds, render Dashboard directly instead of spinning forever:

```typescript
const [timedOut, setTimedOut] = useState(false);
useEffect(() => {
  const t = setTimeout(() => setTimedOut(true), 10_000);
  return () => clearTimeout(t);
}, []);

if (timedOut && !isSuperAdmin) return <Dashboard />;
```

### Files to change

| File | Change | Risk |
|------|--------|------|
| `src/pages/AuthCallback.tsx` | Wait for `user` before navigating | Low |
| `src/pages/Auth.tsx` | Prevent redirect loop from callback | Low |
| `src/pages/Index.tsx` | 10s fallback to Dashboard | Low |

### Why this is the fix

The SubscriptionGuard/Context changes from the last 24h are correct and safe. The actual brick is the MS365 `setSession → navigate` race that was diagnosed but never patched. This plan patches it.

