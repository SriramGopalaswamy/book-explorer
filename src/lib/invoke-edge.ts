/**
 * invokeEdge — resilient wrapper around supabase.functions.invoke().
 *
 * Why this exists: under certain conditions (e.g. the Supabase SDK's internal
 * `navigator.locks` auth lock being held by a stalled refresh), a plain
 * `supabase.functions.invoke()` call awaits `getSession()` forever and the
 * promise never resolves. React Query then sticks at `isLoading=true` and the
 * UI hangs on skeletons (most visibly on Settings → Users which depends on
 * the `manage-roles` Edge Function).
 *
 * Strategy:
 *   1. Race the SDK invoke against a configurable timeout (default 6s).
 *   2. On timeout, fall back to a raw `fetch` against the function URL using
 *      the JWT pulled directly from localStorage — this bypasses the SDK
 *      lock entirely.
 *   3. Return the same `{ data, error }` shape the SDK does so call sites
 *      need no further changes.
 *
 * Use this for ALL Edge Functions that gate critical UI (user management,
 * MS365 auth/sync, payroll engine, etc.). Edge Functions invoked from
 * non-blocking code paths can stay on the SDK — but using this helper is
 * always safe.
 */

import { supabase } from "@/integrations/supabase/client";

export interface InvokeEdgeResult<T = any> {
  data: T | null;
  error: { message: string; status?: number } | null;
}

interface InvokeEdgeOptions {
  body?: Record<string, unknown>;
  timeoutMs?: number;
  /** Override fallback fetch behaviour (mostly for tests). */
  skipFallback?: boolean;
}

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PROJECT_ID: string | undefined = import.meta.env.VITE_SUPABASE_PROJECT_ID;

/**
 * Best-effort lookup of the persisted JWT from localStorage. The Supabase
 * client stores the session under `sb-<project-ref>-auth-token`.
 */
function readPersistedAccessToken(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    // The SDK writes one key per project; iterate to find it.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
        if (typeof token === "string" && token.length > 0) return token;
      } catch {
        // not JSON
      }
    }
  } catch {
    // localStorage may be blocked
  }
  return null;
}

function timeoutPromise<T>(ms: number): Promise<{ __timedOut: true }> {
  return new Promise((resolve) =>
    setTimeout(() => resolve({ __timedOut: true } as any), ms),
  );
}

async function rawFetchInvoke<T>(
  fnName: string,
  body: Record<string, unknown> | undefined,
): Promise<InvokeEdgeResult<T>> {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const accessToken = readPersistedAccessToken();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${accessToken ?? SUPABASE_ANON}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      return {
        data: parsed,
        error: { message: parsed?.error || `HTTP ${res.status}`, status: res.status },
      };
    }
    return { data: parsed as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Network error" },
    };
  }
}

export async function invokeEdge<T = any>(
  fnName: string,
  options: InvokeEdgeOptions = {},
): Promise<InvokeEdgeResult<T>> {
  const { body, timeoutMs = 6000, skipFallback = false } = options;

  const sdkCall = supabase.functions
    .invoke(fnName, { body })
    .then((res) => ({
      __timedOut: false as const,
      data: (res as any).data as T | null,
      error: (res as any).error
        ? { message: (res as any).error.message ?? "Edge function error" }
        : null,
    }))
    .catch((err) => ({
      __timedOut: false as const,
      data: null,
      error: { message: err instanceof Error ? err.message : "Edge function error" },
    }));

  const winner = await Promise.race([sdkCall, timeoutPromise<T>(timeoutMs)]) as
    { __timedOut: false; data: T | null; error: { message: string } | null }
    | { __timedOut: true };

  if (winner.__timedOut === false) {
    return { data: winner.data, error: winner.error };
  }

  // SDK call timed out — fall back to raw fetch unless explicitly disabled.
  if (skipFallback) {
    return { data: null, error: { message: `Timed out after ${timeoutMs}ms` } };
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[invokeEdge] '${fnName}' timed out after ${timeoutMs}ms — falling back to raw fetch`,
  );
  return rawFetchInvoke<T>(fnName, body);
}

// Re-export project id for callers that need it.
export const SUPABASE_PROJECT_ID = PROJECT_ID;
