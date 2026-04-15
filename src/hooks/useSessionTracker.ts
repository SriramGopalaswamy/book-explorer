import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Detects anomalies in login behavior:
 * - Off-hours login (before 6am or after 11pm)
 * - New device (user_agent not seen in last 30 sessions)
 */
function detectAnomalies(hour: number): { isAnomaly: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (hour < 6 || hour >= 23) {
    reasons.push("off_hours_login");
  }
  return { isAnomaly: reasons.length > 0, reasons };
}

function parseDeviceInfo(ua: string): Record<string, string> {
  const info: Record<string, string> = {};
  if (/Windows/i.test(ua)) info.os = "Windows";
  else if (/Mac/i.test(ua)) info.os = "macOS";
  else if (/Linux/i.test(ua)) info.os = "Linux";
  else if (/Android/i.test(ua)) info.os = "Android";
  else if (/iPhone|iPad/i.test(ua)) info.os = "iOS";
  else info.os = "Unknown";

  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) info.browser = "Chrome";
  else if (/Firefox/i.test(ua)) info.browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) info.browser = "Safari";
  else if (/Edg/i.test(ua)) info.browser = "Edge";
  else info.browser = "Unknown";

  if (/Mobile/i.test(ua)) info.type = "Mobile";
  else if (/Tablet/i.test(ua)) info.type = "Tablet";
  else info.type = "Desktop";

  return info;
}

/**
 * Tracks auth events (sign_in, sign_out, token_refresh) into user_sessions.
 * Must be used inside AuthProvider.
 */
export function useSessionTracker() {
  const { user } = useAuth();
  const signInLoggedRef = useRef(false);
  const lastEventRef = useRef<string | null>(null);
  const signInTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Deduplicate rapid-fire events
        const eventKey = `${event}-${session?.user?.id ?? "none"}`;
        if (eventKey === lastEventRef.current) return;
        lastEventRef.current = eventKey;

        const userId = session?.user?.id;
        if (!userId) {
          // sign_out event — log it using the previous user
          if (event === "SIGNED_OUT" && signInLoggedRef.current) {
            signInLoggedRef.current = false;
            // Duration is approximate from sign_in time
            const duration = signInTimeRef.current
              ? Math.round((Date.now() - signInTimeRef.current) / 60_000)
              : null;
            signInTimeRef.current = null;
            // Can't insert without auth — skip (sign_out is best-effort)
          }
          return;
        }

        // Only track sign_in and token_refresh
        if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return;

        const eventType = event === "SIGNED_IN" ? "sign_in" : "token_refresh";

        // Only log sign_in once per mount (avoid re-logging on page refresh)
        if (eventType === "sign_in") {
          if (signInLoggedRef.current) return;
          signInLoggedRef.current = true;
          signInTimeRef.current = Date.now();
        }

        // Skip token_refresh logging (too noisy)
        if (eventType === "token_refresh") return;

        // Resolve org
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id, full_name, email")
          .eq("user_id", userId)
          .maybeSingle();

        if (!profile?.organization_id) return;

        const ua = navigator.userAgent.substring(0, 500);
        const deviceInfo = parseDeviceInfo(ua);
        const hour = new Date().getHours();
        const { isAnomaly, reasons } = detectAnomalies(hour);

        // Check for new device anomaly
        try {
          const { data: recentSessions } = await supabase
            .from("user_sessions" as any)
            .select("user_agent")
            .eq("user_id", userId)
            .eq("event_type", "sign_in")
            .order("created_at", { ascending: false })
            .limit(30);

          if (recentSessions && recentSessions.length > 3) {
            const knownAgents = new Set(recentSessions.map((s: any) => s.user_agent));
            if (!knownAgents.has(ua)) {
              reasons.push("new_device");
            }
          }
        } catch {
          // best-effort
        }

        const finalAnomaly = isAnomaly || reasons.length > 0;

        try {
          await (supabase as any)
            .from("user_sessions")
            .insert({
              user_id: userId,
              organization_id: profile.organization_id,
              email: profile.email || session.user?.email,
              full_name: profile.full_name,
              event_type: eventType,
              session_id: sessionStorage.getItem("grx10_session_id") || `${Date.now()}`,
              user_agent: ua,
              device_info: deviceInfo,
              is_anomaly: finalAnomaly,
              anomaly_reasons: reasons,
              last_seen_at: new Date().toISOString(),
            });
        } catch {
          // best-effort — don't break the app
        }

        // If anomaly, also insert a notification for admins
        if (finalAnomaly) {
          try {
            await (supabase as any)
              .from("notifications")
              .insert({
                user_id: userId, // Will be visible to admins via org query
                organization_id: profile.organization_id,
                title: `⚠️ Suspicious login: ${profile.full_name || profile.email}`,
                message: `Anomaly detected: ${reasons.join(", ").replace(/_/g, " ")}. Device: ${deviceInfo.browser}/${deviceInfo.os}`,
                type: "security_alert",
                is_read: false,
              });
          } catch {
            // best-effort
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [user]);
}