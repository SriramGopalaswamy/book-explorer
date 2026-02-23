import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";

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

import { useMutation, useQueryClient } from "@tanstack/react-query";

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

const ALL_TIME_FROM = "2000-01-01";
const getAllTimeTo = () => new Date().toISOString().split("T")[0];

// ─── P&L from RPC ────────────────────────────────────────────

export function useProfitLoss(): ProfitLossData {
  const { data: org } = useUserOrganization();
  const { user } = useAuth();
  const orgId = org?.organizationId;

  const { data } = useQuery({
    queryKey: ["rpc-profit-loss", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("get_profit_loss", {
        p_org_id: orgId,
        p_from: ALL_TIME_FROM,
        p_to: getAllTimeTo(),
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  const rows = data || [];
  const revenue = rows
    .filter((r: any) => r.account_type === "revenue")
    .map((r: any) => ({ name: r.account_name, amount: Number(r.amount) }))
    .filter((r: any) => r.amount > 0);

  const expenses = rows
    .filter((r: any) => r.account_type === "expense")
    .map((r: any) => ({ name: r.account_name, amount: Number(r.amount) }))
    .filter((e: any) => e.amount > 0);

  const totalRevenue = revenue.reduce((s: number, r: any) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);

  return {
    revenue, expenses, totalRevenue, totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
  };
}

// ─── Balance Sheet from RPC ──────────────────────────────────

export function useBalanceSheet(): BalanceSheetData {
  const { data: org } = useUserOrganization();
  const { user } = useAuth();
  const orgId = org?.organizationId;

  const { data } = useQuery({
    queryKey: ["rpc-balance-sheet", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("get_balance_sheet", {
        p_org_id: orgId,
        p_as_of: getAllTimeTo(),
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  const rows = data || [];

  const mapType = (type: string) =>
    rows
      .filter((r: any) => r.account_type === type)
      .map((r: any) => ({ name: r.account_name, code: r.account_code, balance: Number(r.balance) }));

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

// ─── Expense breakdown from P&L ──────────────────────────────

export function useExpenseByCategory(): ExpenseByCategoryData[] {
  const pl = useProfitLoss();
  const total = pl.totalExpenses;
  return pl.expenses.map((e, i) => ({
    name: e.name,
    value: e.amount,
    percentage: total > 0 ? (e.amount / total) * 100 : 0,
    color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
  }));
}

// ─── AR Aging from RPC ───────────────────────────────────────

export function useARAging() {
  const { data: org } = useUserOrganization();
  const { user } = useAuth();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["rpc-ar-aging", orgId],
    queryFn: async (): Promise<ARAgingData> => {
      if (!orgId) return { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };
      const { data, error } = await supabase.rpc("get_ar_aging", {
        p_org_id: orgId,
        p_as_of: getAllTimeTo(),
      });
      if (error) throw error;
      if (!data || data.length === 0) return { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };

      const aging: ARAgingData = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overNinety: 0, total: 0 };
      (data as any[]).forEach((row) => {
        const amt = Number(row.total_amount);
        const bucket = row.aging_bucket;
        if (bucket === "Current") aging.current += amt;
        else if (bucket === "1-30 days") aging.thirtyDays += amt;
        else if (bucket === "31-60 days") aging.sixtyDays += amt;
        else if (bucket === "61-90 days") aging.ninetyDays += amt;
        else aging.overNinety += amt;
        aging.total += amt;
      });
      return aging;
    },
    enabled: !!user && !!orgId,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Monthly trend from journal_lines (no monthly RPC exists) ─

export function useMonthlyTrend() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["monthly-trend-gl", user?.id],
    queryFn: async (): Promise<MonthlyTrendData[]> => {
      if (!user) return [];

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);

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

// ─── Revenue by source from P&L ─────────────────────────────

export function useRevenueBySource() {
  const pl = useProfitLoss();
  return pl.revenue
    .filter((r) => r.amount > 0)
    .map((r, i) => ({
      name: r.name,
      value: r.amount,
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
}

// ─── All-time P&L wrapper ────────────────────────────────────

export function useProfitLossAllTime() {
  const pl = useProfitLoss();
  return { data: pl, isLoading: false };
}

// ─── P&L by date range from RPC ─────────────────────────────

export function useProfitLossForPeriod(from?: Date, to?: Date) {
  const { data: org } = useUserOrganization();
  const { user } = useAuth();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["rpc-pl-period", orgId, from?.toISOString(), to?.toISOString()],
    queryFn: async (): Promise<ProfitLossData> => {
      if (!orgId) return { revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, netIncome: 0, grossMargin: 0 };

      const { data, error } = await supabase.rpc("get_profit_loss", {
        p_org_id: orgId,
        p_from: from ? from.toISOString().split("T")[0] : ALL_TIME_FROM,
        p_to: to ? to.toISOString().split("T")[0] : getAllTimeTo(),
      });
      if (error) throw error;

      const rows = data || [];
      const revenue = rows
        .filter((r: any) => r.account_type === "revenue")
        .map((r: any) => ({ name: r.account_name, amount: Number(r.amount) }))
        .filter((r: any) => r.amount > 0);

      const expenses = rows
        .filter((r: any) => r.account_type === "expense")
        .map((r: any) => ({ name: r.account_name, amount: Number(r.amount) }))
        .filter((e: any) => e.amount > 0);

      const totalRevenue = revenue.reduce((s: number, r: any) => s + r.amount, 0);
      const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);

      return {
        revenue, expenses, totalRevenue, totalExpenses,
        netIncome: totalRevenue - totalExpenses,
        grossMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
      };
    },
    enabled: !!user && !!orgId && (!!from || !!to),
  });
}
