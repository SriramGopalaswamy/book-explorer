import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperAdmin } from "./useSuperAdmin";

/**
 * Hook to check if user has Admin or HR role
 * No dev mode bypass — always queries server
 * Super admins have full access
 */
export function useIsAdminOrHR() {
  const { user } = useAuth();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  return useQuery({
    queryKey: ["user-role", user?.id, "admin-hr", isSuperAdmin],
    queryFn: async () => {
      if (!user) return false;

      // Super admins have full access
      if (isSuperAdmin) {
        console.log("[useIsAdminOrHR] Super admin detected, granting access");
        return true;
      }

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
    enabled: !!user && !saLoading,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to check if user has Finance role or Admin role
 * Super admins have full access
 */
export function useIsFinance() {
  const { user } = useAuth();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  return useQuery({
    queryKey: ["user-role", user?.id, "finance", isSuperAdmin],
    queryFn: async () => {
      if (!user) return false;

      // Super admins have full access
      if (isSuperAdmin) {
        console.log("[useIsFinance] Super admin detected, granting access");
        return true;
      }

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
    enabled: !!user && !saLoading,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to check if user is a Manager
 * Super admins have full access
 */
export function useIsManager() {
  const { user } = useAuth();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  return useQuery({
    queryKey: ["user-role", user?.id, "manager", isSuperAdmin],
    queryFn: async () => {
      if (!user) return false;

      // Super admins have full access
      if (isSuperAdmin) {
        console.log("[useIsManager] Super admin detected, granting access");
        return true;
      }

      // Check user_roles table first
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "manager")
        .limit(1);

      if (roleData && roleData.length > 0) return true;

      // Fallback: check if anyone reports to this user
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
    enabled: !!user && !saLoading,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to get the current user's primary role
 * Super admins are treated as admin
 */
export function useCurrentRole() {
  const { user } = useAuth();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  return useQuery({
    queryKey: ["user-role", user?.id, "current-role", isSuperAdmin],
    queryFn: async () => {
      if (!user) return null;

      // Super admins are treated as admin
      if (isSuperAdmin) {
        console.log("[useCurrentRole] Super admin detected, returning 'admin'");
        return "admin";
      }

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
    enabled: !!user && !saLoading,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
