import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

/**
 * Prefetch ALL roles for the current user in a single query.
 * Fires immediately on auth (no org dependency), so it runs in parallel
 * with useUserOrganization instead of waiting for it.
 */
function useAllUserRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-all-roles", user?.id],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      signal?.addEventListener("abort", () => { clearTimeout(timer); controller.abort(); });
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role, organization_id")
          .eq("user_id", user.id)
          .abortSignal(controller.signal);
        if (error) {
          console.error("Error fetching all user roles:", error);
          return [];
        }
        return data ?? [];
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
}

/**
 * Helper: get org-scoped roles from the prefetched list.
 */
function useOrgRoles() {
  const { data: allRoles, isLoading } = useAllUserRoles();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  const orgRoles = (allRoles ?? [])
    .filter((r) => r.organization_id === orgId)
    .map((r) => r.role);

  return { orgRoles, orgId, isLoading };
}

/**
 * Hook to check if user has Admin or HR role — ORG-SCOPED
 */
export function useIsAdminOrHR() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  return {
    data: orgId ? orgRoles.some((r) => r === "admin" || r === "hr") : false,
    isLoading,
  };
}

/**
 * Hook to check if user has Finance role or Admin role — ORG-SCOPED
 */
export function useIsFinance() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  return {
    data: orgId ? orgRoles.some((r) => r === "admin" || r === "finance") : false,
    isLoading,
  };
}

/**
 * Hook to check if user is a Manager — ORG-SCOPED
 * Note: direct-report fallback removed for perf; relies on explicit role assignment.
 */
export function useIsManager() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  return {
    data: orgId ? orgRoles.includes("manager") : false,
    isLoading,
  };
}

/**
 * Hook to get the current user's primary role — ORG-SCOPED
 * Critical: role resolution must be scoped to the active org to prevent
 * privilege escalation across tenant boundaries (production vs sandbox).
 */
export function useCurrentRole() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();

  let role: string | null = null;
  if (orgId) {
    if (orgRoles.includes("admin"))   role = "admin";
    else if (orgRoles.includes("hr")) role = "hr";
    else if (orgRoles.includes("finance")) role = "finance";
    else if (orgRoles.includes("payroll")) role = "payroll";
    else if (orgRoles.includes("manager")) role = "manager";
    else role = "employee";
  }

  return { data: role, isLoading };
}
