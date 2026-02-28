import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

interface SubscriptionState {
  /** No active subscription exists */
  needsActivation: boolean;
  /** Subscription expired — UI should be read-only */
  readOnlyMode: boolean;
  /** Subscription active but org not yet onboarded */
  onboardingRequired: boolean;
  /** Subscription plan name */
  plan: string | null;
  /** Raw subscription status */
  subscriptionStatus: string | null;
  /** Loading state */
  loading: boolean;
  /** Organization id */
  organizationId: string | null;
  /** Modules enabled for this subscription */
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
  const { data: org, isLoading: orgLoading } = useUserOrganization();

  const orgId = org?.organizationId;

  const { data: subscription, isLoading: subLoading } = useQuery({
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
        return null;
      }
      return data;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  const loading = orgLoading || subLoading;

  const state = useMemo<SubscriptionState>(() => {
    if (loading || !org) {
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

    const hasSubscription = !!subscription;
    const isActive = subscription?.status === "active";
    const isExpired = subscription?.status === "expired";
    const orgActive = org.orgState === "active";

    return {
      needsActivation: !hasSubscription || (!isActive && !isExpired),
      readOnlyMode: isExpired || (subscription?.is_read_only ?? false),
      onboardingRequired: isActive && !orgActive,
      plan: subscription?.plan ?? null,
      subscriptionStatus: subscription?.status ?? null,
      loading: false,
      organizationId: orgId ?? null,
      enabledModules: subscription?.enabled_modules ?? null,
    };
  }, [loading, org, subscription, orgId]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
