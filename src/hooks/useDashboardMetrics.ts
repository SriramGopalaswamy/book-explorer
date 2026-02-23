import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useProfitAndLoss, useGLBalances } from "@/hooks/useCanonicalViews";

export interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
}

export interface CategoryData {
  name: string;
  value: number;
  color: string;
}

const categoryColors: Record<string, string> = {
  "Operating Expense": "hsl(262, 52%, 47%)",
  "Cost of Goods Sold": "hsl(199, 89%, 48%)",
  "Sales Revenue": "hsl(38, 92%, 50%)",
};

/**
 * Dashboard metrics from journal_lines + gl_accounts (unified source)
 */
export function useDashboardMetricsFromLedger(organizationId?: string) {
  const { user } = useAuth();
  const { data: profitAndLoss } = useProfitAndLoss(organizationId);

  return useQuery({
    queryKey: ["dashboard-metrics-ledger", organizationId, user?.id],
    queryFn: async () => {
      const revenue = profitAndLoss?.summary.revenue || 0;
      const expenses = profitAndLoss?.summary.expenses || 0;
      const netIncome = profitAndLoss?.summary.netIncome || 0;

      return {
        totalRevenue: revenue,
        totalExpenses: expenses,
        netIncome,
        grossProfit: profitAndLoss?.summary.grossProfit || 0,
      };
    },
    enabled: !!profitAndLoss,
  });
}

/**
 * Expense breakdown from GL accounts
 */
export function useExpenseBreakdownFromLedger(organizationId?: string) {
  const { data: balances = [] } = useGLBalances();

  return useQuery({
    queryKey: ["expense-breakdown-ledger-gl", organizationId],
    queryFn: async (): Promise<CategoryData[]> => {
      const expenses = balances
        .filter((b) => b.account_type === "expense" && b.balance > 0);

      if (expenses.length === 0) return [{ name: "No Data", value: 0, color: "hsl(220, 9%, 46%)" }];

      return expenses.map((e) => ({
        name: e.name,
        value: e.balance,
        color: categoryColors[e.name] || "hsl(220, 9%, 46%)",
      }));
    },
    enabled: balances.length > 0,
  });
}

/**
 * Revenue breakdown from GL accounts
 */
export function useRevenueBreakdownFromLedger(organizationId?: string) {
  const { data: balances = [] } = useGLBalances();

  return useQuery({
    queryKey: ["revenue-breakdown-ledger-gl", organizationId],
    queryFn: async (): Promise<CategoryData[]> => {
      const revenues = balances
        .filter((b) => b.account_type === "revenue" && Math.abs(b.balance) > 0);

      return revenues.map((r) => ({
        name: r.name,
        value: Math.abs(r.balance),
        color: categoryColors[r.name] || "hsl(222, 47%, 14%)",
      }));
    },
    enabled: balances.length > 0,
  });
}
