import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";

const ALL_MODULES = ["financial", "hrms", "performance", "audit", "assets"] as const;
export type AppModule = (typeof ALL_MODULES)[number];

/**
 * Returns which modules are enabled for the current tenant's subscription.
 * Super admins bypass module restrictions (all modules enabled).
 */
export function useModuleAccess() {
  const { enabledModules, loading, plan } = useSubscription();
  const { data: isSuperAdmin } = useIsSuperAdmin();

  // Super admins get all modules OR if plan is platform_admin
  if (isSuperAdmin || plan === "platform_admin") {
    console.log("[useModuleAccess] Super admin detected - enabling all modules");
    return {
      isModuleEnabled: () => true,
      enabledModules: ALL_MODULES as unknown as string[],
      loading: false
    };
  }

  const modules = (enabledModules && enabledModules.length > 0)
    ? enabledModules
    : ALL_MODULES as unknown as string[];

  console.log("[useModuleAccess] Enabled modules:", modules);

  const isModuleEnabled = (module: AppModule): boolean => {
    return modules.includes(module);
  };

  return { isModuleEnabled, enabledModules: modules, loading };
}
