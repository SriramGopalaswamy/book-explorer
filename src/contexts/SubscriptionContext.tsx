import { createContext, useContext, ReactNode, useMemo } from "react";
import { isSessionContextDegraded, useSessionContext } from "@/hooks/useSessionContext";

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
  const { data, isLoading, isFetching, isError } = useSessionContext();

  const state = useMemo<SubscriptionState>(() => {
    const degraded = isSessionContextDegraded(data);

    if ((isLoading && !data) || degraded) {
      return {
        needsActivation: false,
        readOnlyMode: false,
        onboardingRequired: false,
        plan: null,
        subscriptionStatus: null,
        loading: true,
        organizationId: null,
        enabledModules: null,
      };
    }

    if (isError || !data) {
      // Errored — don't block, allow guard to make decision
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

    const org = data.organization;
    const subscription = data.subscription;
    const orgId = data.organizationId;

    // No org membership → needs activation (super-admins are bypassed by guard)
    if (!orgId || !org) {
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
    const orgActive = org.org_state === "active";
    const orgInitializing = org.org_state === "initializing" || org.org_state === "draft";

    return {
      needsActivation: !hasSubscription || (!isActive && !isExpired),
      readOnlyMode: isExpired || (subscription?.is_read_only ?? false) || (isActive && orgInitializing),
      onboardingRequired: isActive && !orgActive,
      plan: subscription?.plan ?? null,
      subscriptionStatus: subscription?.status ?? null,
      loading: false,
      organizationId: orgId,
      enabledModules: subscription?.enabled_modules ?? null,
    };
  }, [data, isLoading, isFetching, isError]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
