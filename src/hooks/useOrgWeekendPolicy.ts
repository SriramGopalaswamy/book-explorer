/**
 * GBC-22: small focused hook for organizations.weekend_policy. Drop-in
 * replacement for the previous useEffect+supabase.from pattern in the
 * PayrollConfigSection of Settings.tsx.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export function useOrgWeekendPolicy() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["org-weekend-policy", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("weekend_policy")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.weekend_policy as string | null) ?? null;
    },
  });
}
