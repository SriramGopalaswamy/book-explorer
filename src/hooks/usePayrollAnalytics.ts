import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PayrollAnalyticsData {
  monthlyCostTrend: { month: string; gross: number; net: number; deductions: number }[];
  departmentCosts: { department: string; total: number; count: number }[];
  tdsCollectedTrend: { month: string; tds: number }[];
  pfContributionTrend: { month: string; employee_pf: number; employer_pf: number }[];
  lwpImpact: { month: string; lwp_days: number; lwp_deduction: number }[];
  averageSalaryByRole: { role: string; avg_salary: number; count: number }[];
  totalEmployees: number;
  totalPayrollCost: number;
  avgCTC: number;
}

export function usePayrollAnalytics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["payroll-analytics"],
    queryFn: async (): Promise<PayrollAnalyticsData> => {
      // Fetch all locked payroll runs with entries
      const { data: runs } = await supabase
        .from("payroll_runs")
        .select("id, pay_period, total_gross, total_deductions, total_net, employee_count, status")
        .in("status", ["locked", "approved", "completed"])
        .order("pay_period", { ascending: true })
        .limit(24);

      const runIds = (runs ?? []).map((r) => r.id);

      const { data: entries } = await supabase
        .from("payroll_entries")
        .select("*, profiles!profile_id(full_name, department, job_title)")
        .in("payroll_run_id", runIds.length > 0 ? runIds : ["none"]);

      const allEntries = entries ?? [];
      const allRuns = runs ?? [];

      // Monthly cost trend
      const monthlyCostTrend = allRuns.map((r) => ({
        month: r.pay_period,
        gross: Number(r.total_gross),
        net: Number(r.total_net),
        deductions: Number(r.total_deductions),
      }));

      // Department costs (from latest run)
      const deptMap = new Map<string, { total: number; count: number }>();
      allEntries.forEach((e: any) => {
        const dept = e.profiles?.department || "Unassigned";
        const existing = deptMap.get(dept) || { total: 0, count: 0 };
        existing.total += Number(e.gross_earnings);
        existing.count += 1;
        deptMap.set(dept, existing);
      });
      const departmentCosts = Array.from(deptMap.entries()).map(([department, v]) => ({
        department,
        ...v,
      }));

      // TDS trend
      const tdsMap = new Map<string, number>();
      allEntries.forEach((e: any) => {
        const run = allRuns.find((r) => r.id === e.payroll_run_id);
        if (run) {
          tdsMap.set(run.pay_period, (tdsMap.get(run.pay_period) || 0) + Number(e.tds_amount || 0));
        }
      });
      const tdsCollectedTrend = Array.from(tdsMap.entries())
        .map(([month, tds]) => ({ month, tds }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // PF trend
      const pfMap = new Map<string, { employee_pf: number; employer_pf: number }>();
      allEntries.forEach((e: any) => {
        const run = allRuns.find((r) => r.id === e.payroll_run_id);
        if (run) {
          const existing = pfMap.get(run.pay_period) || { employee_pf: 0, employer_pf: 0 };
          existing.employee_pf += Number(e.pf_employee || 0);
          existing.employer_pf += Number(e.pf_employer || 0);
          pfMap.set(run.pay_period, existing);
        }
      });
      const pfContributionTrend = Array.from(pfMap.entries())
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // LWP impact
      const lwpMap = new Map<string, { lwp_days: number; lwp_deduction: number }>();
      allEntries.forEach((e: any) => {
        const run = allRuns.find((r) => r.id === e.payroll_run_id);
        if (run) {
          const existing = lwpMap.get(run.pay_period) || { lwp_days: 0, lwp_deduction: 0 };
          existing.lwp_days += Number(e.lwp_days || 0);
          existing.lwp_deduction += Number(e.lwp_deduction || 0);
          lwpMap.set(run.pay_period, existing);
        }
      });
      const lwpImpact = Array.from(lwpMap.entries())
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Avg salary by role (job_title)
      const roleMap = new Map<string, { total: number; count: number }>();
      allEntries.forEach((e: any) => {
        const role = e.profiles?.job_title || "Unspecified";
        const existing = roleMap.get(role) || { total: 0, count: 0 };
        existing.total += Number(e.net_pay);
        existing.count += 1;
        roleMap.set(role, existing);
      });
      const averageSalaryByRole = Array.from(roleMap.entries()).map(([role, v]) => ({
        role,
        avg_salary: Math.round(v.total / v.count),
        count: v.count,
      }));

      const totalPayrollCost = allRuns.reduce((s, r) => s + Number(r.total_net), 0);
      const totalEmployees = new Set(allEntries.map((e: any) => e.profile_id)).size;
      const avgCTC = allEntries.length > 0
        ? Math.round(allEntries.reduce((s: number, e: any) => s + Number(e.annual_ctc), 0) / allEntries.length)
        : 0;

      return {
        monthlyCostTrend,
        departmentCosts,
        tdsCollectedTrend,
        pfContributionTrend,
        lwpImpact,
        averageSalaryByRole,
        totalEmployees,
        totalPayrollCost,
        avgCTC,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}
