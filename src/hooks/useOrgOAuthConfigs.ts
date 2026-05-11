/**
 * GBC-22: replaces the inline useEffect+supabase.from pattern in
 * IntegrationsStep.tsx (and any future consumer). Fetches all
 * organization_oauth_configs rows for the caller's org.
 *
 * The hook accepts an optional `orgId` so the onboarding step (which
 * has the org id in props before useUserOrganization can resolve it)
 * can pass it through explicitly. When omitted the resolved org is used.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface OrgOAuthConfig {
  id: string;
  organization_id: string;
  provider: "microsoft" | "google" | string;
  tenant_id: string | null;
  client_id: string;
  client_secret: string;
  sender_email: string | null;
  is_verified: boolean | null;
}

export function useOrgOAuthConfigs(orgIdOverride?: string | null) {
  const { data: orgData } = useUserOrganization();
  const orgId = orgIdOverride ?? orgData?.organizationId ?? null;

  return useQuery({
    queryKey: ["org-oauth-configs", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgOAuthConfig[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("organization_oauth_configs")
        .select("id, organization_id, provider, tenant_id, client_id, client_secret, sender_email, is_verified")
        .eq("organization_id", orgId);
      if (error) throw error;
      return (data as OrgOAuthConfig[]) ?? [];
    },
  });
}
