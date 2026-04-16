import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_IDLE_TIMEOUT = 30; // minutes
const MAX_CONCURRENT_SESSIONS = 3; // max sessions per user
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
const CHECK_INTERVAL = 60_000; // check every minute
const SESSION_HEARTBEAT_INTERVAL = 30_000; // heartbeat every 30s
const SESSION_KEY = "grx10_session_id";

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

export function useSessionTimeout() {
  const { user, signOut } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const timeoutMinutesRef = useRef(DEFAULT_IDLE_TIMEOUT);
  const warningShownRef = useRef(false);
  const sessionIdRef = useRef<string>("");

  // Initialize session ID
  useEffect(() => {
    if (!user) return;
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = generateSessionId();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    sessionIdRef.current = sid;
  }, [user]);

  // Fetch org session policy
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.organization_id) return;

      const { data } = await (supabase as any)
        .from("session_policies")
        .select("idle_timeout_minutes, max_concurrent_sessions")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (data?.idle_timeout_minutes) {
        timeoutMinutesRef.current = data.idle_timeout_minutes;
      }
    })();
  }, [user]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
  }, []);

  // Track user activity
  useEffect(() => {
    if (!user) return;
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity));
    };
  }, [user, resetActivity]);

  // Concurrent session heartbeat & enforcement
  useEffect(() => {
    if (!user) return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    const sendHeartbeat = async () => {
      try {
        // Register/update this session
        await (supabase as any)
          .from("user_sessions")
          .upsert({
            user_id: user.id,
            session_id: sid,
            last_seen_at: new Date().toISOString(),
            user_agent: navigator.userAgent.substring(0, 200),
          }, { onConflict: "user_id,session_id" });

        // Check active sessions count
        const { data: activeSessions } = await (supabase as any)
          .from("user_sessions")
          .select("session_id, last_seen_at")
          .eq("user_id", user.id)
          .is("event_type", null)
          .gte("last_seen_at", new Date(Date.now() - 2 * 60_000).toISOString()) // active within 2 min
          .order("last_seen_at", { ascending: false });

        if (activeSessions && activeSessions.length > MAX_CONCURRENT_SESSIONS) {
          // If this session is NOT in the most recent N sessions, force logout
          const allowedIds = activeSessions
            .slice(0, MAX_CONCURRENT_SESSIONS)
            .map((s: any) => s.session_id);

          if (!allowedIds.includes(sid)) {
            toast.error(
              "Session terminated: maximum concurrent sessions exceeded. You've been signed in from another device.",
              { duration: 8000 }
            );
            // Clean up this session
            await (supabase as any)
              .from("user_sessions")
              .delete()
              .eq("user_id", user.id)
              .eq("session_id", sid);
            signOut();
            return;
          }
        }
      } catch {
        // Silent fail — heartbeat is best-effort
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, SESSION_HEARTBEAT_INTERVAL);

    // Cleanup on unmount: remove session
    return () => {
      clearInterval(interval);
      (supabase as any)
        .from("user_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", sid)
        .then(() => {});
    };
  }, [user, signOut]);

  // Check for idle timeout periodically
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 60_000;
      const timeout = timeoutMinutesRef.current;
      const warnAt = timeout - 2; // warn 2 minutes before

      if (elapsed >= timeout) {
        clearInterval(interval);
        toast.error("Session expired due to inactivity. Please sign in again.");
        signOut();
      } else if (elapsed >= warnAt && !warningShownRef.current) {
        warningShownRef.current = true;
        toast.warning("Your session will expire in 2 minutes due to inactivity.", { duration: 10000 });
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [user, signOut]);
}
