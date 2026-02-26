import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
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

  return useQuery({
    queryKey: ["dashboard-stats", user?.id, isDevMode],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user && !isDevMode) return getEmptyStats();
      if (isDevMode) return getEmptyStats();

      const now = new Date();
      const currentMonthStart = startOfMonth(now).toISOString().split("T")[0];
      const currentMonthEnd = endOfMonth(now).toISOString().split("T")[0];
      const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
      const lastMonthEnd = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];

      // Get GL accounts to identify revenue vs expense
      const { data: glAccounts } = await supabase
        .from("gl_accounts")
        .select("id, account_type")
        .in("account_type", ["revenue", "expense"]);

      const revenueIds = new Set((glAccounts || []).filter((a: any) => a.account_type === "revenue").map((a: any) => a.id));
      const expenseIds = new Set((glAccounts || []).filter((a: any) => a.account_type === "expense").map((a: any) => a.id));

      // Current month journal lines
      const { data: currentLines } = await supabase
        .from("journal_lines")
        .select("debit, credit, gl_account_id, journal_entries!inner(entry_date)")
        .gte("journal_entries.entry_date", currentMonthStart)
        .lte("journal_entries.entry_date", currentMonthEnd);

      // Last month journal lines
      const { data: lastMonthLines } = await supabase
        .from("journal_lines")
        .select("debit, credit, gl_account_id, journal_entries!inner(entry_date)")
        .gte("journal_entries.entry_date", lastMonthStart)
        .lte("journal_entries.entry_date", lastMonthEnd);

      const calcTotals = (lines: any[]) => {
        let revenue = 0, expenses = 0;
        (lines || []).forEach((l: any) => {
          if (revenueIds.has(l.gl_account_id)) revenue += Number(l.credit || 0);
          if (expenseIds.has(l.gl_account_id)) expenses += Number(l.debit || 0);
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
      const [employeesResult, pendingInvoicesResult, lastMonthInvoicesResult, goalsResult] = await Promise.all([
        supabase.from("profiles").select("id").eq("status", "active"),
        supabase.from("invoices").select("id").in("status", ["draft", "sent", "overdue"]),
        supabase.from("invoices").select("id").in("status", ["draft", "sent", "overdue"]).gte("created_at", lastMonthStart).lte("created_at", lastMonthEnd),
        supabase.from("goals").select("progress, status"),
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
