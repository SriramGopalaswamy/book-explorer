import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";

const ALL_MODULES = [
  "financial", "hrms", "performance", "audit", "assets",
  "inventory", "procurement", "sales", "manufacturing", "warehouse", "connectors",
] as const;
export type AppModule = (typeof ALL_MODULES)[number];

const ALL_MODULES_LIST = ALL_MODULES as unknown as string[];

/**
 * Returns which modules are enabled for the current tenant's subscription.
 * Super admins and org admins always see all modules regardless of subscription scope.
 */
export function useModuleAccess() {
  const { enabledModules, loading } = useSubscription();
  const { data: isSuperAdmin } = useIsSuperAdmin();

  // Super admins always have all modules — the subscription's enabled_modules list
  // only restricts non-admin roles. Without this check, a super admin whose org
  // subscribed to only e.g. "hrms" would see no financial nav in the sidebar.
  const modules = isSuperAdmin
    ? ALL_MODULES_LIST
    : (enabledModules ?? ALL_MODULES_LIST);

  const isModuleEnabled = (module: AppModule): boolean => {
    return modules.includes(module);
  };

  return { isModuleEnabled, enabledModules: modules, loading };
}
