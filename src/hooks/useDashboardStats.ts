import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

export interface DashboardStats {
  totalRevenue: number;
  revenueChange: number;
  activeEmployees: number;
  employeeChange: number;
  pendingInvoices: number;
  invoiceChange: number;
  goalsAchieved: number;
  goalsChange: number;
}

export function useDashboardStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dashboard-stats", user?.id],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user) {
        return getDefaultStats();
      }

      const now = new Date();
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));

      const [
        currentRevenueResult,
        lastMonthRevenueResult,
        employeesResult,
        pendingInvoicesResult,
        lastMonthInvoicesResult,
        goalsResult,
      ] = await Promise.all([
        supabase
          .from("financial_records")
          .select("amount")
          .eq("user_id", user.id)
          .eq("type", "revenue"),
        supabase
          .from("financial_records")
          .select("amount")
          .eq("user_id", user.id)
          .eq("type", "revenue")
          .gte("record_date", lastMonthStart.toISOString().split("T")[0])
          .lte("record_date", lastMonthEnd.toISOString().split("T")[0]),
        supabase
          .from("profiles")
          .select("id, status")
          .eq("status", "active"),
        supabase
          .from("invoices")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["draft", "sent"]),
        supabase
          .from("invoices")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["draft", "sent"])
          .gte("created_at", lastMonthStart.toISOString())
          .lte("created_at", lastMonthEnd.toISOString()),
        supabase
          .from("goals")
          .select("progress, status")
          .eq("user_id", user.id),
      ]);

      const totalRevenue = currentRevenueResult.data?.reduce(
        (sum, record) => sum + Number(record.amount), 0
      ) || 0;

      const lastMonthRevenue = lastMonthRevenueResult.data?.reduce(
        (sum, record) => sum + Number(record.amount), 0
      ) || 0;

      const revenueChange = lastMonthRevenue > 0
        ? ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

      const activeEmployees = employeesResult.data?.length || 0;
      const pendingInvoices = pendingInvoicesResult.data?.length || 0;
      const lastMonthPendingInvoices = lastMonthInvoicesResult.data?.length || 0;
      const invoiceChange = pendingInvoices - lastMonthPendingInvoices;

      const goals = goalsResult.data || [];
      const avgProgress = goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
        : 0;

      return {
        totalRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        activeEmployees,
        employeeChange: 0,
        pendingInvoices,
        invoiceChange,
        goalsAchieved: avgProgress,
        goalsChange: 0,
      };
    },
    enabled: !!user,
    staleTime: 30000,
  });
}

function getDefaultStats(): DashboardStats {
  return {
    totalRevenue: 4523000,
    revenueChange: 12.5,
    activeEmployees: 127,
    employeeChange: 3,
    pendingInvoices: 23,
    invoiceChange: -5,
    goalsAchieved: 85,
    goalsChange: 8,
  };
}

export function formatIndianCurrency(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
