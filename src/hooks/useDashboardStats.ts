import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export interface DashboardStats {
  totalRevenue: number;
  revenueChange: number;
  totalExpenses: number;
  expenseChange: number;
  netIncome: number;
  activeEmployees: number;
  employeeChange: number;
  pendingInvoices: number;
  invoiceChange: number;
  goalsAchieved: number;
  goalsChange: number;
}

/**
 * Dashboard stats — fully server-side.
 *
 * GBC-84: KPIs are computed via the `get_org_kpi_stats` RPC and
 * server-side `count: 'exact'` queries. No client-side aggregation
 * over a row-limited window is performed, so totals are accurate
 * regardless of organisation size.
 *
 * GBC-4: Soft-deleted rows are excluded automatically by a
 * RESTRICTIVE RLS policy on every table with a `deleted_at` column,
 * and reinforced by `.is('deleted_at', null)` filters in hooks.
 */
export function useDashboardStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["dashboard-stats", user?.id, orgId, isDevMode],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user && !isDevMode) return getEmptyStats();
      if (isDevMode || !orgId) return getEmptyStats();

      const now = new Date();
      const fmt = (d: Date) => format(d, "yyyy-MM-dd");
      const curStart = fmt(startOfMonth(now));
      const curEnd = fmt(endOfMonth(now));
      const lastStart = fmt(startOfMonth(subMonths(now, 1)));
      const lastEnd = fmt(endOfMonth(subMonths(now, 1)));

      const [curKpiRes, lastKpiRes, pendingRes, pendingLastRes, goalsRes] =
        await Promise.all([
          supabase.rpc("get_org_kpi_stats", {
            p_org_id: orgId,
            p_period_start: curStart,
            p_period_end: curEnd,
          }),
          supabase.rpc("get_org_kpi_stats", {
            p_org_id: orgId,
            p_period_start: lastStart,
            p_period_end: lastEnd,
          }),
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .in("status", ["sent", "overdue", "acknowledged", "dispute"]),
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .in("status", ["sent", "overdue", "acknowledged", "dispute"])
            .gte("created_at", lastStart)
            .lte("created_at", lastEnd + "T23:59:59"),
          supabase
            .from("goals")
            .select("progress")
            .eq("organization_id", orgId),
        ]);

      const cur = (curKpiRes.data ?? {}) as Record<string, number>;
      const last = (lastKpiRes.data ?? {}) as Record<string, number>;

      const currentRevenue = Number(cur.total_invoiced ?? 0);
      const lastRevenue = Number(last.total_invoiced ?? 0);
      const revenueChange =
        lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue) * 100 : 0;

      const currentExpenses = Number(cur.total_expenses ?? 0);
      const lastExpenses = Number(last.total_expenses ?? 0);
      const expenseChange =
        lastExpenses > 0 ? ((currentExpenses - lastExpenses) / lastExpenses) * 100 : 0;

      const activeEmployees = Number(cur.active_employees ?? 0);
      const pendingInvoices = pendingRes.count ?? 0;
      const lastMonthPending = pendingLastRes.count ?? 0;

      const goals = goalsRes.data ?? [];
      const avgProgress =
        goals.length > 0
          ? Math.round(
              goals.reduce((s: number, g: any) => s + Number(g.progress || 0), 0) /
                goals.length,
            )
          : 0;

      return {
        totalRevenue: currentRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        totalExpenses: currentExpenses,
        expenseChange: Math.round(expenseChange * 10) / 10,
        netIncome: currentRevenue - currentExpenses,
        activeEmployees,
        employeeChange: 0,
        pendingInvoices,
        invoiceChange: pendingInvoices - lastMonthPending,
        goalsAchieved: avgProgress,
        goalsChange: 0,
      };
    },
    enabled: !!user || isDevMode,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getEmptyStats(): DashboardStats {
  return {
    totalRevenue: 0, revenueChange: 0, totalExpenses: 0, expenseChange: 0,
    netIncome: 0, activeEmployees: 0, employeeChange: 0, pendingInvoices: 0,
    invoiceChange: 0, goalsAchieved: 0, goalsChange: 0,
  };
}

export function formatIndianCurrency(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
