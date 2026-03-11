import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";

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
  const { data: org, isLoading: orgLoading, isError: orgError } = useUserOrganization();
  const { data: isSuperAdmin, isLoading: saLoading } = useIsSuperAdmin();

  const orgId = org?.organizationId;

  // Super admins skip subscription fetch entirely
  const shouldSkipSubscription = isSuperAdmin === true;

  // Only fetch subscription if user is authenticated and not a super admin
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: async () => {
      console.log("[SubscriptionContext] Fetching subscription for orgId:", orgId);
      if (!orgId) {
        console.log("[SubscriptionContext] No orgId, skipping subscription fetch");
        return null;
      }
      try {
        const { data, error } = await supabase
          .from("grxbooks.subscriptions")
          .select("id, plan, status, source, valid_until, is_read_only, enabled_modules")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.error("[SubscriptionContext] Subscription fetch error:", error);
          return null;
        }
        console.log("[SubscriptionContext] Subscription data:", data);
        return data;
      } catch (err) {
        console.error("[SubscriptionContext] Subscription fetch exception:", err);
        return null;
      }
    },
    enabled: !!user && !!orgId && !shouldSkipSubscription, // Skip for super admins
    staleTime: 1000 * 60 * 5,
  });

  // Only show loading if user is authenticated, otherwise don't block
  // Don't wait for subscription if user is super admin
  // If org query has error, don't stay in loading state
  const loading = user ? (saLoading || (shouldSkipSubscription ? false : ((orgLoading && !orgError) || subLoading))) : false;

  const state = useMemo<SubscriptionState>(() => {
    // Super admins get full access without subscription checks
    if (shouldSkipSubscription && !saLoading) {
      console.log("[SubscriptionContext] Super admin detected, skipping subscription validation");
      return {
        needsActivation: false,
        readOnlyMode: false,
        onboardingRequired: false,
        plan: "platform_admin",
        subscriptionStatus: "active",
        loading: false,
        organizationId: orgId ?? null,
        enabledModules: ["all"],
      };
    }

    // If org query has error, stop loading and let auth redirect to login
    if (orgError) {
      console.error("[SubscriptionContext] Organization query error - stopping loading");
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
  }, [loading, org, subscription, orgId, shouldSkipSubscription, saLoading, orgError]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
