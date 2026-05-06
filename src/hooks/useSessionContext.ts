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
function storageKey(uid: string) {
  return STORAGE_PREFIX + uid;
}

export function readCachedSessionContext(uid: string): SessionContext | null {
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return null;
    return JSON.parse(raw) as SessionContext;
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
      try {
        const { data, error } = await supabase
          .rpc("get_my_session_context")
          .abortSignal(controller.signal);
        if (error) throw error;
        const payload = (data ?? {}) as any;
        const ctx: SessionContext = {
          isSuperAdmin: !!payload.is_super_admin,
          organizationId: payload.organization_id ?? null,
          roles: Array.isArray(payload.roles) ? payload.roles : [],
          organization: payload.organization ?? null,
          subscription: payload.subscription ?? null,
        };
        if (user.id) writeCachedSessionContext(user.id, ctx);
        return ctx;
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!user,
    // Session-lifetime cache: never auto-refetch. Mutations that affect
    // roles/subscription must call invalidateSessionContext().
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (a) => Math.min(1000 * 2 ** a, 5000),
  });
}

/** Use after a mutation that changes roles, subscription, or org state. */
export function useInvalidateSessionContext() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["session-context"] });
}
