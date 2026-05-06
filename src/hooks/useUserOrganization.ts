import { useSessionContext } from "@/hooks/useSessionContext";

/**
 * Hook to get current user's organization_id and org metadata.
 * Reads from the session-context bootstrap (single round trip on login,
 * cached for the entire session). No separate network call.
 */
export function useUserOrganization() {
  const { data, isLoading, isFetching, isError, error } = useSessionContext();

  const result =
    data && data.organizationId && data.organization
      ? {
          organizationId: data.organizationId,
          orgName: data.organization.name ?? null,
          orgStatus: data.organization.status ?? null,
          orgState: data.organization.org_state ?? null,
          createdAt: data.organization.created_at ?? null,
        }
      : data && !data.organizationId
        ? null
        : undefined;

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
