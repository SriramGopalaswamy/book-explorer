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
    queryFn: async () => {
      if (!user) return null;

      // Get org_id from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) return null;

      const orgId = profile.organization_id;

      // Get org details including org_state
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, status, org_state, created_at")
        .eq("id", orgId)
        .maybeSingle();

      if (orgError) throw orgError;

      return {
        organizationId: orgId,
        orgName: org?.name ?? null,
        orgStatus: org?.status ?? null,
        orgState: (org as any)?.org_state ?? null,
        createdAt: org?.created_at ?? null,
      };
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

  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ["onboarding-snapshot", org?.organizationId],
    queryFn: async () => {
      if (!org?.organizationId) return null;

      const { data, error } = await supabase
        .from("onboarding_snapshots")
        .select("id, version, initialized_at")
        .eq("organization_id", org.organizationId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!org?.organizationId,
    staleTime: 1000 * 60 * 5,
  });

  return {
    initialized: org?.orgState === "active" && !!snapshot,
    orgState: org?.orgState,
    loading: orgLoading || snapLoading,
    snapshot,
  };
}
