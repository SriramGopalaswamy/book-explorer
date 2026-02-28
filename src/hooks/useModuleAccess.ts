import { useSubscription } from "@/contexts/SubscriptionContext";

const ALL_MODULES = ["financial", "hrms", "performance", "audit", "assets"] as const;
export type AppModule = (typeof ALL_MODULES)[number];

/**
 * Returns which modules are enabled for the current tenant's subscription.
 * Super admins bypass module restrictions (all modules enabled).
 */
export function useModuleAccess() {
  const { enabledModules, loading } = useSubscription();

  const modules = enabledModules ?? ALL_MODULES as unknown as string[];

  const isModuleEnabled = (module: AppModule): boolean => {
    return modules.includes(module);
  };

  return { isModuleEnabled, enabledModules: modules, loading };
}
