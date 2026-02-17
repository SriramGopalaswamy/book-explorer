/**
 * Hook to detect if we're in Developer Mode without a real authenticated user.
 * When true, hooks should return mock data instead of querying Supabase.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useAppMode } from "@/contexts/AppModeContext";

export function useIsDevModeWithoutAuth() {
  const { user } = useAuth();
  const { appMode, isDeveloperAuthenticated } = useAppMode();
  
  return !user && appMode === "developer" && isDeveloperAuthenticated;
}
