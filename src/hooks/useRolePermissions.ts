import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentRole } from "@/hooks/useRoles";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import {
  DEFAULT_PERMISSIONS,
  ResourceKey,
  ActionKey,
  RolePermission,
  ConfigurableRole,
  CONFIGURABLE_ROLES,
} from "@/lib/permissions";

function useOrgRolePermissions(role: string | null, orgId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["role-permissions", orgId, role],
    queryFn: async (): Promise<RolePermission[] | null> => {
      if (!orgId || !role || !user) return null;
      const { data, error } = await supabase
        .from("role_permissions")
        .select("resource, can_view, can_create, can_edit, can_delete, can_export")
        .eq("organization_id", orgId)
        .eq("role", role);
      if (error) {
        console.error("Error fetching role_permissions:", error);
        return null;
      }
      return (data ?? []) as RolePermission[];
    },
    enabled: !!user && !!orgId && !!role,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

export function useRolePermissions() {
  const { data: role, isLoading: roleLoading } = useCurrentRole();
  const { data: orgData, isLoading: orgLoading } = useUserOrganization();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();
  const orgId = orgData?.organizationId;

  const { data: dbPermissions, isLoading: dbLoading } = useOrgRolePermissions(role, orgId);

  const isLoading = roleLoading || orgLoading || saLoading || dbLoading;

  const hasPermission = useCallback(
    (resource: ResourceKey, action: ActionKey): boolean => {
      // Locked roles — always full access
      if (isSuperAdmin || role === "admin") return true;
      if (!role) return false;

      // Try org-specific DB overrides first (non-null means rows exist for this org)
      if (dbPermissions !== null && dbPermissions !== undefined) {
        const row = dbPermissions.find((p) => p.resource === resource);
        if (row) return row[action] === true;
        // Row missing → resource not yet seeded for this org; fall through to defaults
      }

      // Fall back to in-code defaults (covers unseeded orgs & new resources)
      if (!CONFIGURABLE_ROLES.includes(role as ConfigurableRole)) return false;
      const defaults = DEFAULT_PERMISSIONS[role as ConfigurableRole];
      if (!defaults) return false;
      const resourceRow = defaults[resource];
      if (!resourceRow) return false;
      return resourceRow[action] === true;
    },
    [role, isSuperAdmin, dbPermissions]
  );

  return { hasPermission, isLoading, role };
}

// Convenience hook for a single permission check
export function usePermission(resource: ResourceKey, action: ActionKey): boolean {
  const { hasPermission } = useRolePermissions();
  return hasPermission(resource, action);
}
