/**
 * Server-side paginated payroll register (GBC-84 ext).
 *
 * The payroll register can contain hundreds of employees per run. This hook
 * fetches one page at a time using Supabase .range() instead of loading the
 * whole register into memory.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PayrollEntry } from "@/hooks/usePayrollEngine";

export interface PaginatedPayrollEntries {
  rows: PayrollEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PayrollEntriesParams {
  runId: string | null;
  page: number;       // 1-based
  pageSize: number;   // default 25
  search?: string;    // matches employee full_name / email
}

export function usePaginatedPayrollEntries({
  runId,
  page,
  pageSize = 25,
  search,
}: PayrollEntriesParams) {
  return useQuery<PaginatedPayrollEntries>({
    queryKey: ["payroll-entries-paginated", runId, page, pageSize, search ?? ""],
    enabled: !!runId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      if (!runId) return { rows: [], total: 0, page, pageSize, totalPages: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("payroll_entries")
        .select(
          "id, payroll_run_id, profile_id, organization_id, gross_earnings, total_deductions, net_pay, lwp_days, working_days, paid_days, status, payslip_url, payslip_generated_at, earnings_breakdown, deductions_breakdown, created_at, updated_at, profiles!profile_id(full_name, email, department, job_title)",
          { count: "exact" }
        )
        .eq("payroll_run_id", runId);

      if (search && search.trim()) {
        const s = search.trim().replace(/[,%]/g, "");
        q = q.or(
          `profiles.full_name.ilike.%${s}%,profiles.email.ilike.%${s}%`
        );
      }

      const { data, error, count } = await q
        .order("created_at", { ascending: true })
        .range(from, to);

      if (error) throw error;
      const total = count ?? 0;
      return {
        rows: (data ?? []) as unknown as PayrollEntry[],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  });
}
