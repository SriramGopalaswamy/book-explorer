import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { useCallback } from "react";

const BLOCKED_STATES = ["suspended", "locked", "archived"];

/**
 * Returns a guard function that checks whether the current org allows write operations.
 * Usage:
 *   const { canWrite, guardWrite } = useOrgWriteBlock();
 *   // Before a mutation: if (!guardWrite()) return;
 */
export function useOrgWriteBlock() {
  const { data: org } = useUserOrganization();

  const orgState = org?.orgState as string | null;
  const orgStatus = org?.orgStatus as string | null;

  const isBlocked =
    (orgState && BLOCKED_STATES.includes(orgState)) ||
    (orgStatus && BLOCKED_STATES.includes(orgStatus));

  const guardWrite = useCallback(() => {
    if (isBlocked) {
      toast.error("This organization is currently in a restricted state. Write operations are disabled.", {
        description: `Organization state: ${orgState || orgStatus}`,
      });
      return false;
    }
    return true;
  }, [isBlocked, orgState, orgStatus]);

  return { canWrite: !isBlocked, guardWrite, orgState, orgStatus };
}
