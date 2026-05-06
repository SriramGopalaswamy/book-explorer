import { useSessionContext } from "@/hooks/useSessionContext";

/**
 * All role hooks read from the session-context bootstrap (single round
 * trip on login, cached for entire session). No additional network calls.
 *
 * NOTE: roles in session-context are already org-scoped server-side.
 */

function useOrgRoles() {
  const { data, isLoading } = useSessionContext();
  return {
    orgRoles: data?.roles ?? [],
    orgId: data?.organizationId ?? null,
    isLoading,
  };
}

export function useIsAdminOrHR() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  return {
    data: orgId ? orgRoles.some((r) => r === "admin" || r === "hr") : false,
    isLoading,
  };
}

export function useIsFinance() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  return {
    data: orgId ? orgRoles.some((r) => r === "admin" || r === "finance") : false,
    isLoading,
  };
}

export function useIsManager() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  return {
    data: orgId ? orgRoles.includes("manager") : false,
    isLoading,
  };
}

export function useCurrentRole() {
  const { orgRoles, orgId, isLoading } = useOrgRoles();
  let role: string | null = null;
  if (orgId) {
    if (orgRoles.includes("admin")) role = "admin";
    else if (orgRoles.includes("hr")) role = "hr";
    else if (orgRoles.includes("finance")) role = "finance";
    else if (orgRoles.includes("payroll")) role = "payroll";
    else if (orgRoles.includes("manager")) role = "manager";
    else role = "employee";
  }
  return { data: role, isLoading };
}
