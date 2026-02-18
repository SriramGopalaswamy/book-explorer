import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfitAndLoss, useTrialBalance } from "@/hooks/useCanonicalViews";

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

export interface DateRangeFilter {
  from: Date;
  to: Date;
}

const categoryColors: Record<string, string> = {
  "Salaries": "hsl(222, 47%, 14%)",
  "Operations": "hsl(262, 52%, 47%)",
  "Marketing": "hsl(38, 92%, 50%)",
  "Rent & Utilities": "hsl(199, 89%, 48%)",
  "Software": "hsl(142, 76%, 36%)",
  "Others": "hsl(220, 9%, 46%)",
  "Sales": "hsl(222, 47%, 14%)",
  "Services": "hsl(262, 52%, 47%)",
  "Investments": "hsl(38, 92%, 50%)",
};

/**
 * Enhanced hook that uses canonical views for dashboard metrics
 * This ensures consistency with the general ledger
 */
export function useDashboardMetricsFromLedger(organizationId?: string) {
  const { user } = useAuth();
  const { data: profitAndLoss } = useProfitAndLoss(organizationId);

  return useQuery({
    queryKey: ["dashboard-metrics-ledger", organizationId, user?.id],
    queryFn: async () => {
      // Use P&L view as source of truth
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
 * Get expense breakdown by category from canonical P&L view
 */
export function useExpenseBreakdownFromLedger(organizationId?: string) {
  const { data: profitAndLoss } = useProfitAndLoss(organizationId);

  return useQuery({
    queryKey: ["expense-breakdown-ledger", organizationId],
    queryFn: async (): Promise<CategoryData[]> => {
      if (!profitAndLoss?.details) {
        return getDefaultExpenseData();
      }

      // Get expense accounts from P&L
      const expenses = profitAndLoss.details.filter(
        (row) => row.section === 'Expense' || row.section === 'Cost of Goods Sold'
      );

      if (expenses.length === 0) {
        return getDefaultExpenseData();
      }

      // Group by category
      return expenses.map((expense) => ({
        name: expense.category || expense.account_name,
        value: Number(expense.amount) || 0,
        color: categoryColors[expense.category] || categoryColors[expense.account_name] || "hsl(220, 9%, 46%)",
      }));
    },
    enabled: !!profitAndLoss,
  });
}

/**
 * Get revenue breakdown by category from canonical P&L view
 */
export function useRevenueBreakdownFromLedger(organizationId?: string) {
  const { data: profitAndLoss } = useProfitAndLoss(organizationId);

  return useQuery({
    queryKey: ["revenue-breakdown-ledger", organizationId],
    queryFn: async (): Promise<CategoryData[]> => {
      if (!profitAndLoss?.details) {
        return [];
      }

      // Get revenue accounts from P&L
      const revenues = profitAndLoss.details.filter(
        (row) => row.section === 'Revenue'
      );

      return revenues.map((revenue) => ({
        name: revenue.category || revenue.account_name,
        value: Number(revenue.amount) || 0,
        color: categoryColors[revenue.category] || categoryColors[revenue.account_name] || "hsl(222, 47%, 14%)",
      }));
    },
    enabled: !!profitAndLoss,
  });
}

function getDefaultMonthlyData(): MonthlyData[] {
  return [
    { month: "Jan", revenue: 0, expenses: 0 },
    { month: "Feb", revenue: 0, expenses: 0 },
    { month: "Mar", revenue: 0, expenses: 0 },
    { month: "Apr", revenue: 0, expenses: 0 },
    { month: "May", revenue: 0, expenses: 0 },
    { month: "Jun", revenue: 0, expenses: 0 },
  ];
}

function getDefaultExpenseData(): CategoryData[] {
  return [
    { name: "No Data", value: 0, color: "hsl(220, 9%, 46%)" },
  ];
}
