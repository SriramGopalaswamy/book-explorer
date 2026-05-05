import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Idle-timeout only.
 *
 * Concurrent-session enforcement (heartbeat upserts + session_policies lookup)
 * was REMOVED on 2026-04-24 because it caused continuous DB load:
 *   - 30s upsert + select on user_sessions for every open tab
 *   - a 400 error on every mount (session_policies.max_concurrent_sessions
 *     does not exist in the schema)
 *
 * If we re-introduce it, do it server-side (cron) rather than per-client.
 */

const DEFAULT_IDLE_TIMEOUT = 30; // minutes
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
const CHECK_INTERVAL = 60_000; // check every minute

export function useSessionTimeout() {
  const { user, signOut } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const timeoutMinutesRef = useRef(DEFAULT_IDLE_TIMEOUT);
  const warningShownRef = useRef(false);

  // Fetch org session policy (idle timeout only)
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
        .select("idle_timeout_minutes")
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
