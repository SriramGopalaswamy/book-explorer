/**
 * GBC-22: replaces the inline useEffect+supabase.from pattern in
 * Settings.tsx that fetched organization_settings.logo_url / favicon_url.
 * Cache-keyed by orgId so the entry is automatically invalidated on
 * org switch.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface OrgBranding {
  organization_id: string;
  logo_url: string | null;
  favicon_url: string | null;
}

export function useOrgBranding() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["org-branding", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgBranding | null> => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organization_settings")
        .select("organization_id, logo_url, favicon_url")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data as OrgBranding | null) ?? null;
    },
  });
}
