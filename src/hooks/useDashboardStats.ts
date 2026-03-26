import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

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
 * Dashboard stats now read from journal_lines + gl_accounts (unified source).
 * Revenue = credits to revenue GL accounts in current month.
 * Expenses = debits to expense GL accounts in current month.
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
      if (isDevMode) return getEmptyStats();

      const now = new Date();
      const currentMonthStart = startOfMonth(now).toISOString().split("T")[0];
      const currentMonthEnd = endOfMonth(now).toISOString().split("T")[0];
      const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
      const lastMonthEnd = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];

      // Get GL accounts to identify revenue vs expense — org-scoped
      let glQuery = supabase
        .from("gl_accounts")
        .select("id, account_type")
        .in("account_type", ["revenue", "expense"])
        .eq("is_active", true);
      if (orgId) glQuery = glQuery.eq("organization_id", orgId);
      const { data: glAccounts } = await glQuery;

      const revenueIds = new Set((glAccounts || []).filter((a: any) => a.account_type === "revenue").map((a: any) => a.id));
      const expenseIds = new Set((glAccounts || []).filter((a: any) => a.account_type === "expense").map((a: any) => a.id));

      // Current month journal lines — org-scoped via journal_entries join, only posted & non-deleted entries
      let curLinesQ = supabase
        .from("journal_lines")
        .select("debit, credit, gl_account_id, journal_entries!inner(entry_date, is_posted, is_deleted, organization_id)")
        .eq("journal_entries.is_posted", true)
        .eq("journal_entries.is_deleted", false)
        .gte("journal_entries.entry_date", currentMonthStart)
        .lte("journal_entries.entry_date", currentMonthEnd);
      if (orgId) curLinesQ = curLinesQ.eq("journal_entries.organization_id", orgId);
      const { data: currentLines } = await curLinesQ;

      // Last month journal lines — org-scoped via journal_entries join, only posted & non-deleted entries
      let lastLinesQ = supabase
        .from("journal_lines")
        .select("debit, credit, gl_account_id, journal_entries!inner(entry_date, is_posted, is_deleted, organization_id)")
        .eq("journal_entries.is_posted", true)
        .eq("journal_entries.is_deleted", false)
        .gte("journal_entries.entry_date", lastMonthStart)
        .lte("journal_entries.entry_date", lastMonthEnd);
      if (orgId) lastLinesQ = lastLinesQ.eq("journal_entries.organization_id", orgId);
      const { data: lastMonthLines } = await lastLinesQ;

      const calcTotals = (lines: any[]) => {
        let revenue = 0, expenses = 0;
        (lines || []).forEach((l: any) => {
          if (revenueIds.has(l.gl_account_id)) {
            revenue += Number(l.credit || 0) - Number(l.debit || 0);
          }
          if (expenseIds.has(l.gl_account_id)) {
            expenses += Number(l.debit || 0) - Number(l.credit || 0);
          }
        });
        return { revenue, expenses };
      };

      const current = calcTotals(currentLines || []);
      const lastMonth = calcTotals(lastMonthLines || []);

      const revenueChange = lastMonth.revenue > 0
        ? ((current.revenue - lastMonth.revenue) / lastMonth.revenue) * 100
        : 0;
      const expenseChange = lastMonth.expenses > 0
        ? ((current.expenses - lastMonth.expenses) / lastMonth.expenses) * 100
        : 0;

      // Non-financial stats (unchanged)
      // Org-scoped non-financial stats
      let empQ = supabase.from("profiles").select("id").eq("status", "active");
      let invQ = supabase.from("invoices").select("id").eq("is_deleted", false).in("status", ["draft", "sent", "overdue"]);
      let invLastQ = supabase.from("invoices").select("id").eq("is_deleted", false).in("status", ["draft", "sent", "overdue"]).gte("created_at", lastMonthStart).lte("created_at", lastMonthEnd);
      let goalsQ = supabase.from("goals").select("progress, status");
      if (orgId) {
        empQ = empQ.eq("organization_id", orgId);
        invQ = invQ.eq("organization_id", orgId);
        invLastQ = invLastQ.eq("organization_id", orgId);
        goalsQ = goalsQ.eq("organization_id", orgId);
      }
      const [employeesResult, pendingInvoicesResult, lastMonthInvoicesResult, goalsResult] = await Promise.all([
        empQ, invQ, invLastQ, goalsQ,
      ]);

      const activeEmployees = employeesResult.data?.length || 0;
      const pendingInvoices = pendingInvoicesResult.data?.length || 0;
      const lastMonthPendingInvoices = lastMonthInvoicesResult.data?.length || 0;

      const goals = goalsResult.data || [];
      const avgProgress = goals.length > 0
        ? Math.round(goals.reduce((sum: number, g: any) => sum + g.progress, 0) / goals.length)
        : 0;

      return {
        totalRevenue: current.revenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        totalExpenses: current.expenses,
        expenseChange: Math.round(expenseChange * 10) / 10,
        netIncome: current.revenue - current.expenses,
        activeEmployees,
        employeeChange: 0,
        pendingInvoices,
        invoiceChange: pendingInvoices - lastMonthPendingInvoices,
        goalsAchieved: avgProgress,
        goalsChange: 0,
      };
    },
    enabled: !!user || isDevMode,
    staleTime: 30000,
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
