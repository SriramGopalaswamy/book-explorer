import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to get current user's organization_id and org metadata.
 * Used to org-scope financial queries and check onboarding status.
 */
export function useUserOrganization() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-organization", user?.id],
    queryFn: async ({ signal }) => {
      if (!user) return null;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      signal?.addEventListener("abort", () => { clearTimeout(timer); controller.abort(); });
      try {
        // Single query: join profile → organization via foreign key
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("organization_id, organizations!profiles_organization_id_fkey(id, name, status, org_state, created_at)")
          .eq("user_id", user.id)
          .abortSignal(controller.signal)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile?.organization_id) return null;

        const org = profile.organizations as any;
        if (!org) return null;

        return {
          organizationId: profile.organization_id,
          orgName: org.name ?? null,
          orgStatus: org.status ?? null,
          orgState: org.org_state ?? null,
          createdAt: org.created_at ?? null,
        };
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!user,
    // Prevent undefined flicker during refetches / user transitions.
    // keepPreviousData ensures the last resolved value stays available
    // while a new fetch for a different user.id is in flight.
    placeholderData: keepPreviousData,
    // Auth-critical lookup: keep cached for 1 minute to reduce refetch noise.
    staleTime: 1000 * 60,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

/**
 * Check if the current user's org has been onboarded (Financial OS initialized).
 * Returns { initialized, loading }.
 */
export function useOnboardingStatus() {
  const { data: org, isLoading: orgLoading } = useUserOrganization();

  // If the org is in "active" state, it's considered initialized.
  // The onboarding_snapshots table may not exist yet, so we don't rely on it.
  const initialized = org?.orgState === "active";

  return {
    initialized,
    orgState: org?.orgState,
    loading: orgLoading,
    snapshot: null,
  };
}
