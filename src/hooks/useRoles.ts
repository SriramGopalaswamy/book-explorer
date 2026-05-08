import { useSessionContext } from "@/hooks/useSessionContext";

/**
 * All role hooks read from the session-context bootstrap (single round
 * trip on login, cached for entire session). No additional network calls.
 *
 * NOTE: roles in session-context are already org-scoped server-side.
 *
 * SUPER ADMIN BYPASS: Super admins ALWAYS pass every role gate. They may not
 * have any org-scoped user_roles entry yet still must retain full access.
 */

function useOrgRoles() {
  const { data, isLoading } = useSessionContext();
  return {
    orgRoles: data?.roles ?? [],
    orgId: data?.organizationId ?? null,
    isSuperAdmin: !!data?.isSuperAdmin,
    isLoading,
  };
}

export function useIsAdminOrHR() {
  const { orgRoles, orgId, isSuperAdmin, isLoading } = useOrgRoles();
  return {
    data: isSuperAdmin
      ? true
      : orgId
        ? orgRoles.some((r) => r === "admin" || r === "hr")
        : false,
    isLoading,
  };
}

export function useIsFinance() {
  const { orgRoles, orgId, isSuperAdmin, isLoading } = useOrgRoles();
  return {
    data: isSuperAdmin
      ? true
      : orgId
        ? orgRoles.some((r) => r === "admin" || r === "finance")
        : false,
    isLoading,
  };
}

export function useIsManager() {
  const { orgRoles, orgId, isSuperAdmin, isLoading } = useOrgRoles();
  return {
    data: isSuperAdmin ? true : orgId ? orgRoles.includes("manager") : false,
    isLoading,
  };
}

export function useCurrentRole() {
  const { orgRoles, orgId, isSuperAdmin, isLoading } = useOrgRoles();
  let role: string | null = null;
  if (isSuperAdmin) {
    // Super admins are treated as admin everywhere for role-gated UI.
    role = "admin";
  } else if (orgId) {
    if (orgRoles.includes("admin")) role = "admin";
    else if (orgRoles.includes("hr")) role = "hr";
    else if (orgRoles.includes("finance")) role = "finance";
    else if (orgRoles.includes("payroll")) role = "payroll";
    else if (orgRoles.includes("manager")) role = "manager";
    else role = "employee";
  }
  return { data: role, isLoading };
}
