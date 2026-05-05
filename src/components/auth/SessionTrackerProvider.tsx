import { useSessionTracker } from "@/hooks/useSessionTracker";

/**
 * Mounts the session tracker hook inside AuthProvider context.
 * Renders nothing — purely a side-effect component.
 */
export function SessionTrackerProvider() {
  useSessionTracker();
  return null;
}