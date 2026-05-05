import { useUserOrganization } from "@/hooks/useUserOrganization";

/**
 * Mounts useUserOrganization at the top of the tree so the org-lookup
 * fetch starts the moment auth resolves — in parallel with the lazy
 * route chunk download — instead of after the page component mounts.
 *
 * 95 hooks downstream call useUserOrganization; React Query dedupes
 * them onto the same in-flight request. By kicking it off here, every
 * org-scoped data hook on the first page sees a warm cache and can
 * issue its own query immediately instead of waiting on the cascade.
 *
 * Renders nothing.
 */
export function UserOrgPrefetch() {
  useUserOrganization();
  return null;
}
