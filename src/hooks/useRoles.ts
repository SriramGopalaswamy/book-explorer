import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAppMode } from "@/contexts/AppModeContext";
import { useDevMode } from "@/contexts/DevModeContext";

/**
 * Hook to check if user has Admin or HR role
 * Respects dev mode active role for testing
 */
export function useIsAdminOrHR() {
  const { user } = useAuth();
  const { canShowDevTools } = useAppMode();
  const { activeRole } = useDevMode();

  return useQuery({
    queryKey: ["user-role", user?.id, canShowDevTools, activeRole, "admin-hr"],
    queryFn: async () => {
      // In dev mode, respect the active role from the role switcher
      if (canShowDevTools && activeRole) {
        return activeRole === "admin" || activeRole === "hr";
      }

      if (!user) return false;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr"]);

      if (error) {
        console.error("Error checking admin/HR role:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user || canShowDevTools,
  });
}

/**
 * Hook to check if user has Finance role or Admin role
 * Finance users can access financial modules
 * Admins have access to all modules including finance
 */
export function useIsFinance() {
  const { user } = useAuth();
  const { canShowDevTools } = useAppMode();
  const { activeRole } = useDevMode();

  return useQuery({
    queryKey: ["user-role", user?.id, canShowDevTools, activeRole, "finance"],
    queryFn: async () => {
      // In dev mode, respect the active role from the role switcher
      if (canShowDevTools && activeRole) {
        // Admin and finance roles have access
        return activeRole === "admin" || activeRole === "finance";
      }

      if (!user) return false;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "finance"]);

      if (error) {
        console.error("Error checking finance role:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user || canShowDevTools,
  });
}

/**
 * Hook to check if user is a Manager
 * Managers can view their team data
 */
export function useIsManager() {
  const { user } = useAuth();
  const { canShowDevTools } = useAppMode();
  const { activeRole } = useDevMode();

  return useQuery({
    queryKey: ["user-role", user?.id, canShowDevTools, activeRole, "manager"],
    queryFn: async () => {
      // In dev mode, respect the active role from the role switcher
      if (canShowDevTools && activeRole) {
        return activeRole === "manager" || activeRole === "admin" || activeRole === "hr";
      }

      if (!user) return false;
      
      // Check if user is a manager by looking for employees with this user as manager
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("manager_id", user.id)
        .limit(1);

      if (error) {
        console.error("Error checking manager status:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user || canShowDevTools,
  });
}

/**
 * Hook to get the current user's primary role
 * Returns the highest-privilege role: admin > hr > finance > manager > employee
 */
export function useCurrentRole() {
  const { user } = useAuth();
  const { canShowDevTools } = useAppMode();
  const { activeRole } = useDevMode();

  return useQuery({
    queryKey: ["user-role", user?.id, canShowDevTools, activeRole, "current-role"],
    queryFn: async () => {
      if (canShowDevTools && activeRole) return activeRole as string;
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching role:", error);
        return "employee";
      }

      const roles = data?.map((r) => r.role) ?? [];
      if (roles.includes("admin")) return "admin";
      if (roles.includes("hr")) return "hr";
      if (roles.includes("finance")) return "finance";
      if (roles.includes("manager")) return "manager";
      return roles.includes("employee") ? "employee" : "employee";
    },
    enabled: !!user || canShowDevTools,
  });
}
