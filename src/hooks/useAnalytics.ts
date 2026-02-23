import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGLBalances } from "@/hooks/useCanonicalViews";

// ─── Re-export Chart of Accounts CRUD (used by AccountFormDialog, ChartOfAccountsTable) ───

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

export function useChartOfAccounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chart-of-accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("chart_of_accounts").select("*").order("account_code");
      if (error) throw error;
      return data as ChartAccount[];
    },
    enabled: !!user,
  });
}

export function useCreateAccount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChartAccountInput) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("chart_of_accounts").insert({ ...input, user_id: user.id }).select().single();
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
      const { data, error } = await supabase.from("chart_of_accounts").update(input).eq("id", id).select().single();
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
      const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-of-accounts"] }),
  });
}

// ─── Interfaces ───────────────────────────────────────────────

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
  "hsl(262, 52%, 47%)", "hsl(199, 89%, 48%)", "hsl(38, 92%, 50%)",
  "hsl(142, 76%, 36%)", "hsl(346, 87%, 43%)", "hsl(222, 47%, 41%)",
  "hsl(180, 60%, 40%)", "hsl(30, 80%, 55%)", "hsl(280, 60%, 55%)",
  "hsl(120, 40%, 45%)",
];

// ─── P&L from GL (journal_lines + gl_accounts) ───────────────

export function useProfitLoss(): ProfitLossData {
  const { data: balances = [] } = useGLBalances();

  const revenue = balances
    .filter((b) => b.account_type === "revenue")
    .map((b) => ({ name: b.name, amount: Math.abs(b.balance) }))
    .filter((r) => r.amount > 0);

  const expenses = balances
    .filter((b) => b.account_type === "expense")
    .map((b) => ({ name: b.name, amount: Math.abs(b.balance) }))
    .filter((e) => e.amount > 0);

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    revenue, expenses, totalRevenue, totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
  };
}

// ─── Balance Sheet from GL ───────────────────────────────────

export function useBalanceSheet(): BalanceSheetData {
  const { data: balances = [] } = useGLBalances();

  const mapType = (type: string) =>
    balances
      .filter((b) => b.account_type === type)
      .map((b) => ({
        name: b.name,
        code: b.code,
        balance: type === "liability" || type === "equity" ? Math.abs(b.balance) : b.balance,
      }));

  const assets = mapType("asset");
  const liabilities = mapType("liability");
  const equity = mapType("equity");

  return {
    assets, liabilities, equity,
    totalAssets: assets.reduce((s, a) => s + a.balance, 0),
    totalLiabilities: liabilities.reduce((s, l) => s + l.balance, 0),
    totalEquity: equity.reduce((s, e) => s + e.balance, 0),
  };
}

// ─── Expense breakdown from GL ───────────────────────────────

export function useExpenseByCategory(): ExpenseByCategoryData[] {
  const { data: balances = [] } = useGLBalances();

  const expenseAccounts = balances
    .filter((b) => b.account_type === "expense" && b.balance > 0);

  const total = expenseAccounts.reduce((s, e) => s + e.balance, 0);

  return expenseAccounts.map((e, i) => ({
    name: e.name,
    value: e.balance,
    percentage: total > 0 ? (e.balance / total) * 100 : 0,
    color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
  }));
}

// ─── AR Aging from invoices ──────────────────────────────────

export function useARAging() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ar-aging-gl", user?.id],
    queryFn: async (): Promise<ARAgingData> => {
      if (!user) return { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };

      const { data, error } = await supabase
        .from("invoices")
        .select("total_amount, amount, due_date, status")
        .in("status", ["sent", "overdue"]);

      if (error) throw error;
      if (!data || data.length === 0) return { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };

      const now = new Date();
      const aging: ARAgingData = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };

      data.forEach((inv) => {
        const due = new Date(inv.due_date);
        const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const amt = Number(inv.total_amount || inv.amount);

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

// ─── Monthly trend from journal_lines ────────────────────────

export function useMonthlyTrend() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["monthly-trend-gl", user?.id],
    queryFn: async (): Promise<MonthlyTrendData[]> => {
      if (!user) return [];

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);

      // Get GL accounts
      const { data: glAccounts } = await supabase
        .from("gl_accounts")
        .select("id, account_type")
        .in("account_type", ["revenue", "expense"]);

      const revenueIds = new Set((glAccounts || []).filter((a: any) => a.account_type === "revenue").map((a: any) => a.id));
      const expenseIds = new Set((glAccounts || []).filter((a: any) => a.account_type === "expense").map((a: any) => a.id));

      const { data: lines, error } = await supabase
        .from("journal_lines")
        .select("debit, credit, gl_account_id, journal_entries!inner(entry_date)")
        .gte("journal_entries.entry_date", twelveMonthsAgo.toISOString().split("T")[0]);

      if (error) throw error;
      if (!lines || lines.length === 0) return [];

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const map = new Map<string, { revenue: number; expenses: number }>();

      for (let i = 0; i < 12; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - 11 + i);
        const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        map.set(key, { revenue: 0, expenses: 0 });
      }

      lines.forEach((l: any) => {
        const entryDate = (l.journal_entries as any)?.entry_date;
        if (!entryDate) return;
        const d = new Date(entryDate);
        const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        const entry = map.get(key);
        if (entry) {
          if (revenueIds.has(l.gl_account_id)) entry.revenue += Number(l.credit || 0);
          if (expenseIds.has(l.gl_account_id)) entry.expenses += Number(l.debit || 0);
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

// ─── Revenue by source from GL ───────────────────────────────

export function useRevenueBySource() {
  const { data: balances = [] } = useGLBalances();

  return balances
    .filter((b) => b.account_type === "revenue" && Math.abs(b.balance) > 0)
    .map((b, i) => ({
      name: b.name,
      value: Math.abs(b.balance),
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
}

// ─── All-time P&L from GL ────────────────────────────────────

export function useProfitLossAllTime() {
  const pl = useProfitLoss();
  return {
    data: pl,
    isLoading: false,
  };
}

// ─── P&L by date range from journal_lines ────────────────────

export function useProfitLossForPeriod(from?: Date, to?: Date) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pl-period-gl", user?.id, from?.toISOString(), to?.toISOString()],
    queryFn: async (): Promise<ProfitLossData> => {
      if (!user) return { revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, netIncome: 0, grossMargin: 0 };

      const { data: glAccounts } = await supabase
        .from("gl_accounts")
        .select("id, name, account_type")
        .in("account_type", ["revenue", "expense"]);

      const accountMap = new Map((glAccounts || []).map((a: any) => [a.id, a]));

      let query = supabase
        .from("journal_lines")
        .select("debit, credit, gl_account_id, journal_entries!inner(entry_date)");

      if (from) query = query.gte("journal_entries.entry_date", from.toISOString().split("T")[0]);
      if (to) query = query.lte("journal_entries.entry_date", to.toISOString().split("T")[0]);

      const { data: lines, error } = await query;
      if (error) throw error;

      const aggregated = new Map<string, number>();
      (lines || []).forEach((l: any) => {
        const acc = accountMap.get(l.gl_account_id);
        if (!acc) return;
        const current = aggregated.get(l.gl_account_id) || 0;
        if (acc.account_type === "revenue") aggregated.set(l.gl_account_id, current + Number(l.credit || 0));
        else aggregated.set(l.gl_account_id, current + Number(l.debit || 0));
      });

      const revenue = Array.from(aggregated.entries())
        .filter(([id]) => accountMap.get(id)?.account_type === "revenue")
        .map(([id, amount]) => ({ name: accountMap.get(id)!.name, amount }))
        .filter((r) => r.amount > 0);

      const expenses = Array.from(aggregated.entries())
        .filter(([id]) => accountMap.get(id)?.account_type === "expense")
        .map(([id, amount]) => ({ name: accountMap.get(id)!.name, amount }))
        .filter((e) => e.amount > 0);

      const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

      return {
        revenue, expenses, totalRevenue, totalExpenses,
        netIncome: totalRevenue - totalExpenses,
        grossMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
      };
    },
    enabled: !!user && (!!from || !!to),
  });
}
