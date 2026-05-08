import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllSessionContext } from "@/hooks/useSessionContext";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        const newUid = newSession?.user?.id ?? null;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);

        // On sign-out: drop all cached data + sessionStorage bootstrap.
        // On sign-in / token-refresh / user-update: ALWAYS purge the cached
        // session-context for the new uid and force a fresh bootstrap.
        // Without this, a stale `roles=[]` / `organization_id=null` snapshot
        // from a previous session/migration would persist forever (staleTime:
        // Infinity) and cause non-super-admin users to silently lose access
        // while super-admins keep working.
        if (event === "SIGNED_OUT") {
          clearAllSessionContext();
          queryClient.clear();
        } else if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") &&
          newUid
        ) {
          clearAllSessionContext();
          queryClient.invalidateQueries({ queryKey: ["session-context", newUid] });
          queryClient.invalidateQueries({ queryKey: ["session-context"] });
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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

    // Prune attempts outside the sliding window
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
      // localStorage unavailable — continue without persisting
    }
  };

  // Clear rate-limit counter after a successful login
  const clearRateLimit = () => {
    try {
      localStorage.removeItem(SIGNIN_LOCKOUT_KEY);
    } catch {
      // ignore
    }
  };

  const clearClientSessionArtifacts = () => {
    try {
      sessionStorage.removeItem("grx10_session_id");
      sessionStorage.removeItem("ms365_oauth_state");
    } catch {
      // ignore
    }

    try {
      localStorage.removeItem(SIGNIN_LOCKOUT_KEY);
      localStorage.removeItem(SIGNUP_LOCKOUT_KEY);
    } catch {
      // ignore
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    checkRateLimit(SIGNUP_LOCKOUT_KEY);
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    checkRateLimit(SIGNIN_LOCKOUT_KEY);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      // Successful login resets the lockout counter
      clearRateLimit();
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    clearClientSessionArtifacts();
    clearAllSessionContext();
    queryClient.clear();
    setSession(null);
    setUser(null);
    setLoading(false);

    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      console.error("[Auth] Local sign out fallback used:", error.message);
    }
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    
    return { error: error as Error | null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword, updatePassword }}>
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
