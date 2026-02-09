import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ChartAccount {
  id: string;
  user_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_id: string | null;
  description: string | null;
  is_active: boolean;
  opening_balance: number;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface ProfitLossData {
  revenue: { name: string; amount: number }[];
  expenses: { name: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  grossMargin: number;
}

export interface BalanceSheetData {
  assets: { name: string; code: string; balance: number }[];
  liabilities: { name: string; code: string; balance: number }[];
  equity: { name: string; code: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface ARAgingData {
  current: number;
  thirtyDays: number;
  sixtyDays: number;
  ninetyDays: number;
  overNinety: number;
  total: number;
}

export interface MonthlyTrendData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ExpenseByCategoryData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

const EXPENSE_COLORS = [
  "hsl(262, 52%, 47%)",
  "hsl(199, 89%, 48%)",
  "hsl(38, 92%, 50%)",
  "hsl(142, 76%, 36%)",
  "hsl(346, 87%, 43%)",
  "hsl(222, 47%, 41%)",
  "hsl(180, 60%, 40%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(120, 40%, 45%)",
];

// Fetch chart of accounts
export function useChartOfAccounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chart-of-accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("account_code");
      if (error) throw error;
      return data as ChartAccount[];
    },
    enabled: !!user,
  });
}

export type ChartAccountInput = {
  account_code: string;
  account_name: string;
  account_type: string;
  description?: string | null;
  opening_balance?: number;
  current_balance?: number;
  is_active?: boolean;
  parent_id?: string | null;
};

export function useCreateAccount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChartAccountInput) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-of-accounts"] }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ChartAccountInput & { id: string }) => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-of-accounts"] }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("chart_of_accounts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-of-accounts"] }),
  });
}

// P&L from chart of accounts
export function useProfitLoss() {
  const { data: accounts = [] } = useChartOfAccounts();

  const revenue = accounts
    .filter((a) => a.account_type === "revenue" && a.account_code !== "4000")
    .map((a) => ({ name: a.account_name, amount: Number(a.current_balance) }));

  const expenses = accounts
    .filter((a) => a.account_type === "expense" && a.account_code !== "5000")
    .map((a) => ({ name: a.account_name, amount: Number(a.current_balance) }));

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
  } as ProfitLossData;
}

// Balance sheet from chart of accounts
export function useBalanceSheet() {
  const { data: accounts = [] } = useChartOfAccounts();

  const mapAccounts = (type: string, parentCode: string) =>
    accounts
      .filter((a) => a.account_type === type && a.account_code !== parentCode)
      .map((a) => ({ name: a.account_name, code: a.account_code, balance: Number(a.current_balance) }));

  const assets = mapAccounts("asset", "1000");
  const liabilities = mapAccounts("liability", "2000");
  const equity = mapAccounts("equity", "3000");

  return {
    assets,
    liabilities,
    equity,
    totalAssets: assets.reduce((s, a) => s + a.balance, 0),
    totalLiabilities: liabilities.reduce((s, l) => s + l.balance, 0),
    totalEquity: equity.reduce((s, e) => s + e.balance, 0),
  } as BalanceSheetData;
}

// Expense breakdown with percentages
export function useExpenseByCategory() {
  const { data: accounts = [] } = useChartOfAccounts();

  const expenseAccounts = accounts
    .filter((a) => a.account_type === "expense" && a.account_code !== "5000" && Number(a.current_balance) > 0);

  const total = expenseAccounts.reduce((s, a) => s + Number(a.current_balance), 0);

  return expenseAccounts.map((a, i) => ({
    name: a.account_name,
    value: Number(a.current_balance),
    percentage: total > 0 ? (Number(a.current_balance) / total) * 100 : 0,
    color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
  })) as ExpenseByCategoryData[];
}

// AR Aging from invoices
export function useARAging() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ar-aging", user?.id],
    queryFn: async () => {
      if (!user) return getDefaultARAging();

      const { data, error } = await supabase
        .from("invoices")
        .select("amount, due_date, status")
        .eq("user_id", user.id)
        .in("status", ["sent", "overdue", "draft"]);

      if (error) throw error;
      if (!data || data.length === 0) return getDefaultARAging();

      const now = new Date();
      const aging: ARAgingData = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };

      data.forEach((inv) => {
        const due = new Date(inv.due_date);
        const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const amt = Number(inv.amount);

        if (daysOverdue <= 0) aging.current += amt;
        else if (daysOverdue <= 30) aging.thirtyDays += amt;
        else if (daysOverdue <= 60) aging.sixtyDays += amt;
        else if (daysOverdue <= 90) aging.ninetyDays += amt;
        else aging.overNinety += amt;

        aging.total += amt;
      });

      return aging;
    },
    enabled: !!user,
  });
}

// Monthly revenue trend from financial records
export function useMonthlyTrend() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["monthly-trend", user?.id],
    queryFn: async () => {
      if (!user) return getDefaultMonthlyTrend();

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);

      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .eq("user_id", user.id)
        .gte("record_date", twelveMonthsAgo.toISOString().split("T")[0]);

      if (error) throw error;
      if (!data || data.length === 0) return getDefaultMonthlyTrend();

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const map = new Map<string, { revenue: number; expenses: number }>();

      // Initialize all 12 months
      for (let i = 0; i < 12; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - 11 + i);
        const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        map.set(key, { revenue: 0, expenses: 0 });
      }

      data.forEach((r) => {
        const d = new Date(r.record_date);
        const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        const entry = map.get(key);
        if (entry) {
          if (r.type === "revenue") entry.revenue += Number(r.amount);
          else entry.expenses += Number(r.amount);
        }
      });

      return Array.from(map.entries()).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        profit: data.revenue - data.expenses,
      }));
    },
    enabled: !!user,
  });
}

// Revenue by source
export function useRevenueBySource() {
  const { data: accounts = [] } = useChartOfAccounts();

  return accounts
    .filter((a) => a.account_type === "revenue" && a.account_code !== "4000" && Number(a.current_balance) > 0)
    .map((a, i) => ({
      name: a.account_name,
      value: Number(a.current_balance),
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
}

function getDefaultARAging(): ARAgingData {
  return { current: 580000, thirtyDays: 320000, sixtyDays: 180000, ninetyDays: 95000, overNinety: 75000, total: 1250000 };
}

function getDefaultMonthlyTrend(): MonthlyTrendData[] {
  const months = ["Mar 25", "Apr 25", "May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25", "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26"];
  const revBase = [4200, 4500, 4800, 5100, 4900, 5300, 5600, 5200, 5800, 6100, 5900, 6200];
  const expBase = [3100, 3300, 3500, 3600, 3400, 3700, 3800, 3600, 3900, 4100, 3800, 3950];

  return months.map((m, i) => ({
    month: m,
    revenue: revBase[i] * 1000,
    expenses: expBase[i] * 1000,
    profit: (revBase[i] - expBase[i]) * 1000,
  }));
}
