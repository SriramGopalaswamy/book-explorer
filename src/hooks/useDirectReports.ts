import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface DirectReport {
  id: string;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
  avatar_url: string | null;
  manager_id: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  join_date: string | null;
}

/**
 * GBC-75 — Lazy-loads a single manager's direct reports.
 *
 * Use this hook for incremental org-chart expansion or "show team"
 * panels when bulk-loading every profile in a large organization
 * is wasteful. Honors soft-delete and tenant scoping.
 */
export function useDirectReports(managerId: string | null | undefined) {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["direct-reports", orgId, managerId ?? "root"],
    queryFn: async (): Promise<DirectReport[]> => {
      if (!orgId) return [];
      let q = supabase
        .from("profiles")
        .select("id, full_name, department, job_title, avatar_url, manager_id, status, email, phone, join_date")
        .eq("organization_id", orgId)
        .eq("is_deleted", false)
        .order("full_name")
        .limit(500);
      if (managerId) {
        q = q.eq("manager_id", managerId);
      } else {
        q = q.is("manager_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DirectReport[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}
