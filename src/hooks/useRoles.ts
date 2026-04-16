import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

/**
 * Hook to check if user has Admin or HR role — ORG-SCOPED
 * Prevents cross-tenant role escalation (e.g. admin in prod != admin in sandbox)
 */
export function useIsAdminOrHR() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["user-role", user?.id, "admin-hr", orgId],
    queryFn: async () => {
      if (!user || !orgId) return false;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr"])
        .eq("organization_id", orgId);

      if (error) {
        console.error("Error checking admin/HR role:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to check if user has Finance role or Admin role — ORG-SCOPED
 */
export function useIsFinance() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["user-role", user?.id, "finance", orgId],
    queryFn: async () => {
      if (!user || !orgId) return false;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "finance"])
        .eq("organization_id", orgId);

      if (error) {
        console.error("Error checking finance role:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to check if user is a Manager — ORG-SCOPED
 */
export function useIsManager() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["user-role", user?.id, "manager", orgId],
    queryFn: async () => {
      if (!user || !orgId) return false;
      
      // Check user_roles table — org-scoped
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "manager")
        .eq("organization_id", orgId)
        .limit(1);

      if (roleData && roleData.length > 0) return true;

      // Fallback: check if anyone in the SAME org reports to this user
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!myProfile) return false;

      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("manager_id", myProfile.id)
        .eq("organization_id", orgId)
        .limit(1);

      if (error) {
        console.error("Error checking manager status:", error);
        return false;
      }

      return data && data.length > 0;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to get the current user's primary role — ORG-SCOPED
 * Critical: role resolution must be scoped to the active org to prevent
 * privilege escalation across tenant boundaries (production vs sandbox).
 */
export function useCurrentRole() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["user-role", user?.id, "current-role", orgId],
    queryFn: async () => {
      if (!user || !orgId) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", orgId);

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
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
}
