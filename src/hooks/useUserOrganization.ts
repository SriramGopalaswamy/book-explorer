import { useQuery } from "@tanstack/react-query";
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
    retry: false, // Don't retry if profile not found
    queryFn: async () => {
      console.log("[useUserOrganization] Fetching organization for user:", user?.id);
      if (!user) {
        console.log("[useUserOrganization] No user, returning null");
        return null;
      }

      try {
        // Get org_id from profile
        console.log("[useUserOrganization] Fetching profile...");
        const { data: profile, error: profileError } = await supabase
          .from("grxbooks.profiles")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("[useUserOrganization] Profile fetch error:", profileError);
          throw profileError;
        }
        if (!profile) {
          console.error("[useUserOrganization] No profile found for user - clearing session");
          // Clear local storage and session
          localStorage.clear();
          sessionStorage.clear();
          // Sign out to force login
          await supabase.auth.signOut();
          // Throw error to stop loading
          throw new Error("Profile not found - please log in again");
        }

        const orgId = profile.organization_id;
        console.log("[useUserOrganization] Found orgId:", orgId);

        if (!orgId) {
          console.log("[useUserOrganization] Profile has no organization_id");
          return null;
        }

        // Get org details including org_state
        console.log("[useUserOrganization] Fetching organization details for orgId:", orgId);
        try {
          const { data: org, error: orgError } = await supabase
            .from("grxbooks.organizations")
            .select("id, name, status, org_state, created_at")
            .eq("id", orgId)
            .maybeSingle();

          console.log("[useUserOrganization] Organization query response:", { data: org, error: orgError });

          if (orgError) {
            console.error("[useUserOrganization] Organization fetch error:", orgError);
            throw orgError;
          }

          if (!org) {
            console.warn("[useUserOrganization] No organization found for orgId:", orgId);
            // Return orgId even if org details not found
            return {
              organizationId: orgId,
              orgName: null,
              orgStatus: null,
              orgState: null,
              createdAt: null,
            };
          }

          console.log("[useUserOrganization] Organization data:", org);
          return {
            organizationId: orgId,
            orgName: org?.name ?? null,
            orgStatus: org?.status ?? null,
            orgState: (org as any)?.org_state ?? null,
            createdAt: org?.created_at ?? null,
          };
        } catch (orgErr) {
          console.error("[useUserOrganization] Organization fetch exception:", orgErr);
          // Return orgId even if org details fetch failed
          return {
            organizationId: orgId,
            orgName: null,
            orgStatus: null,
            orgState: null,
            createdAt: null,
          };
        }
      } catch (err) {
        console.error("[useUserOrganization] Exception:", err);
        throw err;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10, // 10 min — org rarely changes
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
