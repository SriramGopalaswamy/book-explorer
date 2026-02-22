import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to check if user has Admin or HR role
 * No dev mode bypass — always queries server
 */
export function useIsAdminOrHR() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id, "admin-hr"],
    queryFn: async () => {
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
    enabled: !!user,
  });
}

/**
 * Hook to check if user has Finance role or Admin role
 */
export function useIsFinance() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id, "finance"],
    queryFn: async () => {
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
    enabled: !!user,
  });
}

/**
 * Hook to check if user is a Manager
 */
export function useIsManager() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id, "manager"],
    queryFn: async () => {
      if (!user) return false;
      
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
    enabled: !!user,
  });
}

/**
 * Hook to get the current user's primary role
 */
export function useCurrentRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id, "current-role"],
    queryFn: async () => {
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
      return "employee";
    },
    enabled: !!user,
  });
}
