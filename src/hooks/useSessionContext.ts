import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { authTrace } from "@/lib/auth-trace";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

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

export function isSessionContextDegraded(ctx: SessionContext | null | undefined): boolean {
  return !!ctx && !ctx.isSuperAdmin && (!ctx.organizationId || ctx.roles.length === 0);
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
    const parsed = JSON.parse(raw) as SessionContext;
    if (isSessionContextDegraded(parsed)) {
      sessionStorage.removeItem(storageKey(uid));
      authTrace("session", "drop_degraded_cache", {
        uid,
        orgId: parsed.organizationId,
        roles: parsed.roles?.length ?? 0,
      });
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(storageKey(uid));
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeCachedSessionContext(uid: string, ctx: SessionContext) {
  try {
    if (isSessionContextDegraded(ctx)) {
      sessionStorage.removeItem(storageKey(uid));
      authTrace("session", "skip_degraded_cache", {
        uid,
        orgId: ctx.organizationId,
        roles: ctx.roles.length,
      });
      return;
    }
    sessionStorage.setItem(storageKey(uid), JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

function removeCachedSessionContext(uid: string) {
  try {
    sessionStorage.removeItem(storageKey(uid));
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
/**
 * Resilient bootstrap. Strategy:
 *  1. Try `get_my_session_context` RPC with a 6s timeout.
 *  2. On timeout / error / degraded result, fall back to direct parallel
 *     queries on `profiles`, `user_roles`, `organizations`, `subscriptions`,
 *     and `platform_roles`. These are individually small and bypass any
 *     SECURITY DEFINER hang.
 *  3. Cache the merged result (even if partial) so the UI never spins
 *     indefinitely. Degraded results get a short staleTime so the next
 *     mount/focus re-tries quickly.
 *
 * `refetchOnWindowFocus` is disabled to prevent the historical refetch
 * storm that left pages stuck in `loading=true`.
 */
async function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function authedRestHeaders(accessToken: string): HeadersInit {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function fetchRestRows<T>(table: string, params: Record<string, string>, accessToken: string): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { headers: authedRestHeaders(accessToken) });
  if (!res.ok) throw new Error(`${table} HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function fetchViaRpc(accessToken?: string): Promise<SessionContext> {
  if (accessToken) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_session_context`, {
      method: "POST",
      headers: authedRestHeaders(accessToken),
      body: "{}",
    });
    if (!res.ok) throw new Error(`rpc HTTP ${res.status}: ${await res.text()}`);
    const payload = (await res.json()) ?? {};
    return {
      isSuperAdmin: !!payload.is_super_admin,
      organizationId: payload.organization_id ?? null,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      organization: payload.organization ?? null,
      subscription: payload.subscription ?? null,
    };
  }

  const { data, error } = await supabase.rpc("get_my_session_context");
  if (error) throw error;
  const payload = (data ?? {}) as any;
  return {
    isSuperAdmin: !!payload.is_super_admin,
    organizationId: payload.organization_id ?? null,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    organization: payload.organization ?? null,
    subscription: payload.subscription ?? null,
  };
}

async function fetchViaDirectQueries(uid: string, accessToken?: string): Promise<SessionContext> {
  // Parallel, bounded, RLS-respecting reads. Each is independently small;
  // a hang in one does not block the others past the per-call timeout.
  if (accessToken) {
    const [profileRows, rolesRows, superRows] = await Promise.all([
      withTimeout(
        fetchRestRows<{ organization_id: string | null }>(
          "profiles",
          { select: "organization_id", user_id: `eq.${uid}`, limit: "1" },
          accessToken,
        ),
        4000,
        "profiles",
      ).catch(() => []),
      withTimeout(
        fetchRestRows<{ role: string; organization_id: string | null }>(
          "user_roles",
          { select: "role,organization_id", user_id: `eq.${uid}` },
          accessToken,
        ),
        4000,
        "user_roles",
      ).catch(() => []),
      withTimeout(
        fetchRestRows<{ role: string }>(
          "platform_roles",
          { select: "role", user_id: `eq.${uid}`, role: "eq.super_admin", limit: "1" },
          accessToken,
        ),
        4000,
        "platform_roles",
      ).catch(() => []),
    ]);

    const organizationId = profileRows[0]?.organization_id ?? null;
    const roles = rolesRows
      .filter((r) => !organizationId || !r.organization_id || r.organization_id === organizationId)
      .map((r) => r.role);
    const isSuperAdmin = superRows.length > 0;

    let organization: SessionOrganization | null = null;
    let subscription: SessionSubscription | null = null;
    if (organizationId) {
      const [orgRows, subRows] = await Promise.all([
        withTimeout(
          fetchRestRows<SessionOrganization>(
            "organizations",
            { select: "id,name,status,org_state,created_at", id: `eq.${organizationId}`, limit: "1" },
            accessToken,
          ),
          4000,
          "organizations",
        ).catch(() => []),
        withTimeout(
          fetchRestRows<SessionSubscription>(
            "subscriptions",
            { select: "id,plan,status,source,valid_until,is_read_only,enabled_modules", organization_id: `eq.${organizationId}`, order: "created_at.desc", limit: "1" },
            accessToken,
          ),
          4000,
          "subscriptions",
        ).catch(() => []),
      ]);
      organization = orgRows[0] ?? null;
      subscription = subRows[0] ?? null;
    }

    return { isSuperAdmin, organizationId, roles, organization, subscription };
  }

  const [profileRes, rolesRes, superRes] = await Promise.all([
    withTimeout(
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", uid)
        .maybeSingle()
        .then((r) => r),
      4000,
      "profiles",
    ).catch((e) => ({ data: null, error: e as Error })),
    withTimeout(
      supabase
        .from("user_roles")
        .select("role,organization_id")
        .eq("user_id", uid)
        .then((r) => r),
      4000,
      "user_roles",
    ).catch((e) => ({ data: null, error: e as Error })),
    withTimeout(
      supabase
        .from("platform_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "super_admin")
        .maybeSingle()
        .then((r) => r),
      4000,
      "platform_roles",
    ).catch((e) => ({ data: null, error: e as Error })),
  ]);

  const organizationId: string | null =
    (profileRes as any)?.data?.organization_id ?? null;
  const allRoles: Array<{ role: string; organization_id: string | null }> =
    ((rolesRes as any)?.data as any[]) ?? [];
  const roles = allRoles
    .filter((r) => !organizationId || !r.organization_id || r.organization_id === organizationId)
    .map((r) => r.role);
  const isSuperAdmin = !!(superRes as any)?.data;

  let organization: SessionOrganization | null = null;
  let subscription: SessionSubscription | null = null;
  if (organizationId) {
    const [orgRes, subRes] = await Promise.all([
      withTimeout(
        supabase
          .from("organizations")
          .select("id,name,status,org_state,created_at")
          .eq("id", organizationId)
          .maybeSingle()
          .then((r) => r),
        4000,
        "organizations",
      ).catch(() => ({ data: null })),
      withTimeout(
        supabase
          .from("subscriptions")
          .select("id,plan,status,source,valid_until,is_read_only,enabled_modules")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r),
        4000,
        "subscriptions",
      ).catch(() => ({ data: null })),
    ]);
    organization = ((orgRes as any)?.data as SessionOrganization) ?? null;
    subscription = ((subRes as any)?.data as SessionSubscription) ?? null;
  }

  return { isSuperAdmin, organizationId, roles, organization, subscription };
}

async function bootstrapSession(uid: string, accessToken?: string): Promise<SessionContext> {
  const t0 = performance.now();
  try {
    const ctx = await withTimeout(fetchViaRpc(accessToken), 6000, "rpc");
    const degraded = !ctx.isSuperAdmin && (!ctx.organizationId || ctx.roles.length === 0);
    // eslint-disable-next-line no-console
    console.log("[session-ctx] rpc ok", {
      ms: Math.round(performance.now() - t0),
      degraded,
    });
    if (!degraded) return ctx;
    // RPC succeeded but returned degraded — try direct fallback to confirm.
    const fallback = await fetchViaDirectQueries(uid, accessToken);
    // eslint-disable-next-line no-console
    console.log("[session-ctx] fallback after degraded rpc", {
      orgId: fallback.organizationId,
      roles: fallback.roles.length,
    });
    return fallback.organizationId || fallback.roles.length || fallback.isSuperAdmin
      ? fallback
      : ctx;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn("[session-ctx] rpc failed, using direct fallback", err?.message);
    return fetchViaDirectQueries(uid, accessToken);
  }
}

export function useSessionContext() {
  const { user, session } = useAuth();
  const uid = user?.id;

  return useQuery<SessionContext>({
    queryKey: ["session-context", uid],
    initialData: uid ? readCachedSessionContext(uid) ?? undefined : undefined,
    queryFn: async () => {
      if (!user) return EMPTY;
      const ctx = await bootstrapSession(user.id, session?.access_token);
      const isDegraded = isSessionContextDegraded(ctx);
      // Healthy snapshots are safe to reuse across a reload. Degraded snapshots
      // (no super-admin + missing org/roles) are transient bootstrap failures:
      // never persist them, or the subscription guard can misread them as a
      // real "no subscription" state and bounce the user to activation.
      if (user.id) writeCachedSessionContext(user.id, ctx);
      if (user.id) writePersistedSuperAdmin(user.id, ctx.isSuperAdmin);
      if (isDegraded) {
        removeCachedSessionContext(user.id);
        authTrace("session", "degraded_resolved_uncached", {
          uid: user.id,
          orgId: ctx.organizationId,
          roles: ctx.roles.length,
        });
      }
      // eslint-disable-next-line no-console
      console.log("[session-ctx] resolved", {
        orgId: ctx.organizationId,
        roles: ctx.roles,
        isSuperAdmin: ctx.isSuperAdmin,
        degraded: isDegraded,
      });
      return ctx;
    },
    enabled: !!user,
    // Healthy → cache for 5 minutes; degraded → effectively no cache, so the
    // SessionGate retry button (and any natural remount) reruns immediately.
    staleTime: (q) => {
      const d = q.state.data as SessionContext | undefined;
      if (!d) return 0;
      const degraded = !d.isSuperAdmin && (!d.organizationId || d.roles.length === 0);
      return degraded ? 0 : 5 * 60_000;
    },
    gcTime: Infinity,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    retry: (failureCount, error: any) => {
      if (error?.name === "AbortError") return false;
      const code = error?.code || error?.cause?.code;
      if (code === "20" || code === "ABORT_ERR") return false;
      return failureCount < 2;
    },
    retryDelay: (a) => Math.min(800 * 2 ** a, 4000),
  });
}

/** Use after a mutation that changes roles, subscription, or org state. */
export function useInvalidateSessionContext() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["session-context"] });
}
