import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

interface SubscriptionState {
  needsActivation: boolean;
  readOnlyMode: boolean;
  onboardingRequired: boolean;
  plan: string | null;
  subscriptionStatus: string | null;
  loading: boolean;
  organizationId: string | null;
  enabledModules: string[] | null;
}

const SubscriptionContext = createContext<SubscriptionState>({
  needsActivation: false,
  readOnlyMode: false,
  onboardingRequired: false,
  plan: null,
  subscriptionStatus: null,
  loading: true,
  organizationId: null,
  enabledModules: null,
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading, isError: orgError } = useUserOrganization();

  const orgId = org?.organizationId;

  const { data: subscription, isLoading: subLoading, isError: subError } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, plan, status, source, valid_until, is_read_only, enabled_modules")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Subscription fetch error:", error);
        throw error; // Let React Query handle retry
      }
      return data;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
    retry: 2, // Don't retry indefinitely
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  // Treat errors as "done loading" to prevent permanent spinner
  const loading = orgLoading || (!!orgId && subLoading);

  const state = useMemo<SubscriptionState>(() => {
    if (loading) {
      return {
        needsActivation: false,
        readOnlyMode: false,
        onboardingRequired: false,
        plan: null,
        subscriptionStatus: null,
        loading: true,
        organizationId: orgId ?? null,
        enabledModules: null,
      };
    }

    // Query errored (network/schema reload) — don't assume needs activation
    if (orgError) {
      return {
        needsActivation: false,
        readOnlyMode: false,
        onboardingRequired: false,
        plan: null,
        subscriptionStatus: null,
        loading: false,
        organizationId: null,
        enabledModules: null,
      };
    }

    // Query succeeded but no org found — needs activation
    if (!org) {
      return {
        needsActivation: true,
        readOnlyMode: false,
        onboardingRequired: false,
        plan: null,
        subscriptionStatus: null,
        loading: false,
        organizationId: null,
        enabledModules: null,
      };
    }

    const hasSubscription = !!subscription;
    const isActive = subscription?.status === "active";
    const isExpired = subscription?.status === "expired";
    const orgActive = org.orgState === "active";
    const orgInitializing = org.orgState === "initializing" || org.orgState === "draft";

    return {
      needsActivation: !hasSubscription || (!isActive && !isExpired),
      readOnlyMode: isExpired || (subscription?.is_read_only ?? false) || (isActive && orgInitializing),
      onboardingRequired: isActive && !orgActive,
      plan: subscription?.plan ?? null,
      subscriptionStatus: subscription?.status ?? null,
      loading: false,
      organizationId: orgId ?? null,
      enabledModules: subscription?.enabled_modules ?? null,
    };
  }, [loading, org, orgError, subscription, orgId]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
