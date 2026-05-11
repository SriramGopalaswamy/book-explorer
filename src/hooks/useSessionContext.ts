import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SessionOrganization {
  id: string;
  name: string | null;
  status: string | null;
  org_state: string | null;
  created_at: string | null;
}

export interface SessionSubscription {
  id: string;
  plan: string | null;
  status: string | null;
  source: string | null;
  valid_until: string | null;
  is_read_only: boolean | null;
  enabled_modules: string[] | null;
}

export interface SessionContext {
  isSuperAdmin: boolean;
  organizationId: string | null;
  roles: string[];
  organization: SessionOrganization | null;
  subscription: SessionSubscription | null;
}

const EMPTY: SessionContext = {
  isSuperAdmin: false,
  organizationId: null,
  roles: [],
  organization: null,
  subscription: null,
};

const STORAGE_PREFIX = "grx10_session_ctx_";
const SUPER_ADMIN_PREFIX = "grx10_is_super_admin_";
function storageKey(uid: string) {
  return STORAGE_PREFIX + uid;
}
function superAdminKey(uid: string) {
  return SUPER_ADMIN_PREFIX + uid;
}

function isDegradedContext(ctx: SessionContext) {
  return !ctx.isSuperAdmin && (!ctx.organizationId || ctx.roles.length === 0);
}

/**
 * Persistent (across reloads/sign-ins) hint that a user is a super admin.
 * Used to bypass loading guards immediately on subsequent sessions before
 * the bootstrap RPC resolves. The server-side RLS still enforces the real
 * permission check — this is purely a UX hint to avoid a misleading spinner.
 */
export function readPersistedSuperAdmin(uid: string): boolean {
  try {
    return localStorage.getItem(superAdminKey(uid)) === "1";
  } catch {
    return false;
  }
}

function writePersistedSuperAdmin(uid: string, isSuperAdmin: boolean) {
  try {
    if (isSuperAdmin) localStorage.setItem(superAdminKey(uid), "1");
    else localStorage.removeItem(superAdminKey(uid));
  } catch {
    /* ignore */
  }
}

export function readCachedSessionContext(uid: string): SessionContext | null {
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const ctx = JSON.parse(raw) as SessionContext;
    if (isDegradedContext(ctx)) {
      sessionStorage.removeItem(storageKey(uid));
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

function writeCachedSessionContext(uid: string, ctx: SessionContext) {
  try {
    sessionStorage.setItem(storageKey(uid), JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function clearAllSessionContext() {
  try {
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Single round-trip session bootstrap: super-admin flag, org id, org details,
 * roles, and active subscription. Cached for the entire session — never
 * revalidated automatically. Use `useInvalidateSessionContext()` after a
 * mutation that affects roles/subscription/org state.
 */
export function useSessionContext() {
  const { user } = useAuth();
  const uid = user?.id;

  return useQuery<SessionContext>({
    queryKey: ["session-context", uid],
    initialData: uid ? readCachedSessionContext(uid) ?? undefined : undefined,
    queryFn: async ({ signal }) => {
      if (!user) return EMPTY;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        controller.abort();
      });
      const t0 = performance.now();
      // eslint-disable-next-line no-console
      console.log("[session-ctx] RPC start", { uid: user.id });
      try {
        const { data, error } = await supabase
          .rpc("get_my_session_context")
          .abortSignal(controller.signal);
        // eslint-disable-next-line no-console
        console.log("[session-ctx] RPC done", {
          ms: Math.round(performance.now() - t0),
          hasData: !!data,
          error: error?.message,
        });
        if (error) throw error;
        const payload = (data ?? {}) as any;
        const ctx: SessionContext = {
          isSuperAdmin: !!payload.is_super_admin,
          organizationId: payload.organization_id ?? null,
          roles: Array.isArray(payload.roles) ? payload.roles : [],
          organization: payload.organization ?? null,
          subscription: payload.subscription ?? null,
        };

        // SAFETY: Do NOT persist a degraded snapshot. A non-super-admin user
        // with no organization_id or no roles is almost always a transient
        // failure (RPC race with a migration, partial profile recreation,
        // network hiccup). Caching it locks the user out until sign-out.
        const isDegraded = isDegradedContext(ctx);
        if (user.id && !isDegraded) writeCachedSessionContext(user.id, ctx);
        if (user.id) writePersistedSuperAdmin(user.id, ctx.isSuperAdmin);
        return ctx;
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!user,
    // Cache for the session, but allow self-healing refetches: if a previous
    // bootstrap returned a degraded snapshot we want it re-fetched on the
    // next focus/reconnect, not pinned forever.
    staleTime: 5 * 60_000,
    gcTime: Infinity,
    // Refetch only when stale. `"always"` causes production focus/navigation
    // storms with multiple aborted bootstrap RPCs while pages are trying to mount.
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    refetchOnReconnect: true,
    retry: (failureCount, error: any) => {
      if (error?.name === "AbortError") return false;
      const code = error?.code || error?.cause?.code;
      if (code === "20" || code === "ABORT_ERR") return false;
      return failureCount < 2;
    },
    retryDelay: (a) => Math.min(1000 * 2 ** a, 5000),
  });
}

/** Use after a mutation that changes roles, subscription, or org state. */
export function useInvalidateSessionContext() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["session-context"] });
}
