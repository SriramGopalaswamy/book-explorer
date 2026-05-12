import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllSessionContext } from "@/hooks/useSessionContext";

const SUPABASE_AUTH_KEY_PREFIX = "sb-";
const SUPABASE_AUTH_KEY_SUFFIX = "-auth-token";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  /**
   * Adopt a session optimistically from raw tokens (used by the MS365
   * OAuth callback). Decodes the JWT to populate user state immediately,
   * then commits the session to supabase-js in the background. The UI
   * proceeds without ever blocking on the supabase storage LockManager.
   */
  adoptSession: (accessToken: string, refreshToken: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Cross-tab heartbeat
// ---------------------------------------------------------------------------
// Every live tab writes `now` to localStorage every HEARTBEAT_INTERVAL_MS.
// On boot, if the stored heartbeat is older than HEARTBEAT_STALE_MS (i.e. no
// tab has been alive for that long) AND a Supabase session exists in
// localStorage, we treat it as a fresh browser process and purge the session.
//
// This correctly handles:
//   - Single tab close + reopen browser   → stale → purge
//   - Multiple tabs open, one is closed   → heartbeat fresh → keep
//   - New tab opened from same browser    → heartbeat fresh → keep
//   - Chrome "Continue where you left off" → no live tabs for >threshold → purge
const HEARTBEAT_KEY = "grx10_tab_heartbeat";
const HEARTBEAT_INTERVAL_MS = 3_000;
const HEARTBEAT_STALE_MS = 8_000;

// Hard ceiling on auth bootstrap. If `supabase.auth.getSession()` or
// `onAuthStateChange` never fires for any reason, force `loading=false`
// after this so the app cannot get stuck on "Verifying access".
const AUTH_BOOTSTRAP_HARD_TIMEOUT_MS = 5_000;

function readHeartbeat(): number | null {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeHeartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Decode a JWT access token into a synthetic `User` object so we can populate
 * AuthContext state without waiting for `supabase.auth.setSession`. Only the
 * fields actually consumed by the app are filled in.
 */
function decodeUserFromJwt(accessToken: string): User | null {
  try {
    const payloadRaw = accessToken.split(".")[1];
    if (!payloadRaw) return null;
    const json = JSON.parse(
      decodeURIComponent(
        atob(payloadRaw.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      ),
    );
    return {
      id: json.sub,
      aud: json.aud ?? "authenticated",
      email: json.email,
      phone: json.phone ?? "",
      role: json.role ?? "authenticated",
      app_metadata: json.app_metadata ?? {},
      user_metadata: json.user_metadata ?? {},
      created_at: new Date((json.iat ?? Date.now() / 1000) * 1000).toISOString(),
    } as unknown as User;
  } catch (err) {
    console.warn("[auth-ctx] decodeUserFromJwt failed:", err);
    return null;
  }
}

function persistSessionSnapshot(accessToken: string, refreshToken: string, user: User) {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL as string);
    const storageKey = `${SUPABASE_AUTH_KEY_PREFIX}${url.hostname.split(".")[0]}${SUPABASE_AUTH_KEY_SUFFIX}`;
    const payload = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (err) {
    console.warn("[auth-ctx] persistSessionSnapshot failed:", err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const adoptedUidRef = useRef<string | null>(null);

  useEffect(() => {
    // Snapshot heartbeat BEFORE we start writing — this tells us whether
    // any other tab was alive recently or we're a fresh browser process.
    const lastBeat = readHeartbeat();
    const now = Date.now();
    const isFreshBrowserProcess = lastBeat === null || now - lastBeat > HEARTBEAT_STALE_MS;

    // Start writing our own heartbeat immediately so other tabs see us alive.
    writeHeartbeat();
    const beatTimer = window.setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") writeHeartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", writeHeartbeat);
    window.addEventListener("pageshow", writeHeartbeat);

    // Hard timeout: never let `loading` stay true forever.
    const bootTimer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          // eslint-disable-next-line no-console
          console.warn("[auth-ctx] bootstrap hard timeout — forcing loading=false");
        }
        return false;
      });
    }, AUTH_BOOTSTRAP_HARD_TIMEOUT_MS);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        const newUid = newSession?.user?.id ?? null;

        // Suppress INITIAL_SESSION on a stale session — let the purge below
        // run and clear it instead of flashing the user into the app.
        if (event === "INITIAL_SESSION" && newUid && isFreshBrowserProcess) {
          // eslint-disable-next-line no-console
          console.log("[auth-ctx] INITIAL_SESSION suppressed (fresh browser process, awaiting purge)", { uid: newUid });
          return;
        }

        // If we already adopted this session optimistically, don't churn state.
        const alreadyAdopted = adoptedUidRef.current && adoptedUidRef.current === newUid;
        if (!alreadyAdopted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
        }
        setLoading(false);

        // eslint-disable-next-line no-console
        console.log("[auth-ctx]", event, { uid: newUid, alreadyAdopted });

        if (event === "SIGNED_OUT") {
          // If we just adopted a session optimistically (MS365 callback),
          // a stale-session purge fired SIGNED_OUT from the boot path —
          // ignore it so we don't wipe the freshly adopted user.
          if (alreadyAdopted) {
            console.log("[auth-ctx] SIGNED_OUT ignored — session was just adopted");
            return;
          }
          adoptedUidRef.current = null;
          clearAllSessionContext();
          queryClient.clear();
        } else if (newUid && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) {
          clearAllSessionContext();
          queryClient.invalidateQueries({ queryKey: ["session-context", newUid] });
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      window.clearTimeout(bootTimer);
      // If a session was adopted optimistically (MS365 callback) before
      // getSession resolved, don't touch state and don't purge — the
      // adopted session is the source of truth.
      if (adoptedUidRef.current) {
        setLoading(false);
        return;
      }
      if (session && isFreshBrowserProcess) {
        // Fresh browser process with a leftover token — purge.
        // eslint-disable-next-line no-console
        console.log("[auth-ctx] fresh browser process detected — signing out stale session");
        try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((err) => {
      window.clearTimeout(bootTimer);
      console.error("[auth-ctx] getSession failed:", err);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      window.clearInterval(beatTimer);
      window.clearTimeout(bootTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", writeHeartbeat);
      window.removeEventListener("pageshow", writeHeartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rate limiting: separate counters for sign-in vs sign-up
  const MAX_AUTH_ATTEMPTS = 5;
  const AUTH_WINDOW_MS = 15 * 60_000; // 15 minutes
  const SIGNIN_LOCKOUT_KEY = "grx10_signin_attempts";
  const SIGNUP_LOCKOUT_KEY = "grx10_signup_attempts";

  const checkRateLimit = (key: string) => {
    const now = Date.now();
    let stored: number[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      stored = [];
    }

    const recent = stored.filter((t) => now - t < AUTH_WINDOW_MS);

    if (recent.length >= MAX_AUTH_ATTEMPTS) {
      const oldestInWindow = recent[0];
      const unlockAt = new Date(oldestInWindow + AUTH_WINDOW_MS);
      const minutesLeft = Math.ceil((unlockAt.getTime() - now) / 60_000);
      throw new Error(
        `Too many failed attempts. Account locked for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""}. Try again later or reset your password.`
      );
    }

    recent.push(now);
    try {
      localStorage.setItem(key, JSON.stringify(recent));
    } catch {
      /* ignore */
    }
  };

  const clearRateLimit = () => {
    try { localStorage.removeItem(SIGNIN_LOCKOUT_KEY); } catch { /* ignore */ }
  };

  const clearClientSessionArtifacts = () => {
    try {
      const sweep = (store: Storage) => {
        const toRemove: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (!k) continue;
          if (k.startsWith("grx10_") || k.startsWith("ms365_") || k.startsWith("sb-")) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => store.removeItem(k));
      };
      sweep(sessionStorage);
      sweep(localStorage);
    } catch { /* ignore */ }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    checkRateLimit(SIGNUP_LOCKOUT_KEY);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    checkRateLimit(SIGNIN_LOCKOUT_KEY);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) clearRateLimit();
    return { error: error as Error | null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (err) {
      console.warn("[Auth] global sign-out failed, falling back to local:", err);
      try { await supabase.auth.signOut({ scope: "local" }); } catch (err2) {
        console.error("[Auth] local sign-out also failed:", err2);
      }
    }
    clearClientSessionArtifacts();
    clearAllSessionContext();
    queryClient.clear();
    adoptedUidRef.current = null;
    setSession(null);
    setUser(null);
    setLoading(false);
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    return { error: error as Error | null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error as Error | null };
  };

  const adoptSession = useCallback((accessToken: string, refreshToken: string) => {
    const decoded = decodeUserFromJwt(accessToken);
    if (!decoded) {
      console.warn("[auth-ctx] adoptSession: could not decode access token");
      return;
    }
    // Synthesise just enough of a Session object for downstream consumers.
    const syntheticSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: decoded,
    } as unknown as Session;

    adoptedUidRef.current = decoded.id;
    persistSessionSnapshot(accessToken, refreshToken, decoded);
    setSession(syntheticSession);
    setUser(decoded);
    setLoading(false);

    // Fire-and-forget: commit tokens to supabase-js storage so subsequent
    // requests are authenticated. We never await this — if the underlying
    // LockManager stalls, the UI is already moving forward.
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => {
        // eslint-disable-next-line no-console
        console.log("[auth-ctx] adoptSession: background setSession complete");
      })
      .catch((err) => {
        console.warn("[auth-ctx] adoptSession: background setSession failed:", err);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword, updatePassword, adoptSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
