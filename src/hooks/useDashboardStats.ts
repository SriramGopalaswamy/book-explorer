import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
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
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["dashboard-stats", user?.id, isDevMode],
    queryFn: async (): Promise<DashboardStats> => {
      if (!user && !isDevMode) {
        return getEmptyStats();
      }
      if (isDevMode) {
        return getEmptyStats();
      }

      const now = new Date();
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));

      // Check if user is admin/HR for company-wide view
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .in("role", ["admin", "hr", "finance"])
        .maybeSingle();

      const isAdminOrFinance = !!adminRole;

      // Build queries — admin/finance sees all, others see only their own
      let revenueQuery = supabase
        .from("financial_records")
        .select("amount")
        .eq("type", "revenue");

      let lastMonthRevenueQuery = supabase
        .from("financial_records")
        .select("amount")
        .eq("type", "revenue")
        .gte("record_date", lastMonthStart.toISOString().split("T")[0])
        .lte("record_date", lastMonthEnd.toISOString().split("T")[0]);

      let invoicesQuery = supabase
        .from("invoices")
        .select("id")
        .in("status", ["draft", "sent"]);

      let lastMonthInvoicesQuery = supabase
        .from("invoices")
        .select("id")
        .in("status", ["draft", "sent"])
        .gte("created_at", lastMonthStart.toISOString())
        .lte("created_at", lastMonthEnd.toISOString());

      let goalsQuery = supabase
        .from("goals")
        .select("progress, status");

      if (!isAdminOrFinance) {
        revenueQuery = revenueQuery.eq("user_id", user!.id);
        lastMonthRevenueQuery = lastMonthRevenueQuery.eq("user_id", user!.id);
        invoicesQuery = invoicesQuery.eq("user_id", user!.id);
        lastMonthInvoicesQuery = lastMonthInvoicesQuery.eq("user_id", user!.id);
        goalsQuery = goalsQuery.eq("user_id", user!.id);
      }

      const [
        currentRevenueResult,
        lastMonthRevenueResult,
        employeesResult,
        pendingInvoicesResult,
        lastMonthInvoicesResult,
        goalsResult,
      ] = await Promise.all([
        revenueQuery,
        lastMonthRevenueQuery,
        supabase
          .from("profiles")
          .select("id")
          .eq("status", "active"),
        invoicesQuery,
        lastMonthInvoicesQuery,
        goalsQuery,
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
    enabled: !!user || isDevMode,
    staleTime: 30000,
  });
}

function getEmptyStats(): DashboardStats {
  return {
    totalRevenue: 0,
    revenueChange: 0,
    activeEmployees: 0,
    employeeChange: 0,
    pendingInvoices: 0,
    invoiceChange: 0,
    goalsAchieved: 0,
    goalsChange: 0,
  };
}

export function formatIndianCurrency(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
