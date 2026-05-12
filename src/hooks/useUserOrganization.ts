import { useSessionContext } from "@/hooks/useSessionContext";

/**
 * Hook to get current user's organization_id and org metadata.
 * Reads from the session-context bootstrap (single round trip on login,
 * cached for the entire session). No separate network call.
 */
export function useUserOrganization() {
  const { data, isLoading, isFetching, isError, error } = useSessionContext();

  // CRITICAL: gate ONLY on organizationId. The `organization` metadata join
  // can come back null (transient RLS hiccup, RPC partial result) even when
  // organizationId is set. Previously we returned `undefined` in that case,
  // which left every consumer hook (useEmployees, usePayroll, usePayslips,
  // etc.) with `enabled: false` and the page hung forever waiting for a
  // request that never fired.
  const result = data
    ? data.organizationId
      ? {
          organizationId: data.organizationId,
          orgName: data.organization?.name ?? null,
          orgStatus: data.organization?.status ?? null,
          orgState: data.organization?.org_state ?? null,
          createdAt: data.organization?.created_at ?? null,
        }
      : null
    : undefined;

  // eslint-disable-next-line no-console
  console.log("[useUserOrganization]", {
    isLoading,
    isFetching,
    hasData: !!data,
    orgIdInData: data?.organizationId ?? null,
    rolesInData: data?.roles ?? null,
    isSuperAdmin: data?.isSuperAdmin ?? null,
    resolvedResult: result,
  });

  return {
    data: result,
    isLoading,
    isFetching,
    isError,
    error,
  };
}

/**
 * Check if the current user's org has been onboarded (Financial OS initialized).
 */
export function useOnboardingStatus() {
  const { data: org, isLoading: orgLoading } = useUserOrganization();
  const initialized = org?.orgState === "active";
  return {
    initialized,
    orgState: org?.orgState,
    loading: orgLoading,
    snapshot: null,
  };
}
