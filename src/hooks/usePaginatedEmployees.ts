/**
 * Server-side paginated employee list (GBC-84 ext).
 *
 * Use this in screens that render the full employee directory. Avoids loading
 * every profile row into browser memory.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface PaginatedEmployeeRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  department: string | null;
  status: string | null;
  employee_id: string | null;
  join_date: string | null;
}

export interface PaginatedEmployees {
  rows: PaginatedEmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EmployeeListParams {
  page: number;       // 1-based
  pageSize: number;   // default 25
  search?: string;    // ILIKE on full_name / email / employee_id
  status?: string;    // 'all' | 'active' | 'inactive' | 'on_leave' | ...
}

export function usePaginatedEmployees({
  page,
  pageSize = 25,
  search,
  status,
}: EmployeeListParams) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery<PaginatedEmployees>({
    queryKey: ["employees-paginated", orgId, page, pageSize, search ?? "", status ?? "all"],
    enabled: !!user && !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      if (!orgId) return { rows: [], total: 0, page, pageSize, totalPages: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("profiles")
        .select(
          "id, user_id, full_name, email, job_title, department, status, employee_id, join_date",
          { count: "exact" }
        )
        .eq("organization_id", orgId);

      if (status && status !== "all") {
        q = q.eq("status", status);
      }

      if (search && search.trim()) {
        const s = search.trim().replace(/[,%]/g, "");
        q = q.or(
          `full_name.ilike.%${s}%,email.ilike.%${s}%,employee_id.ilike.%${s}%`
        );
      }

      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      const total = count ?? 0;
      return {
        rows: (data ?? []) as PaginatedEmployeeRow[],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  });
}
