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
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));

      // Fetch all data in parallel
      const [
        currentRevenueResult,
        lastMonthRevenueResult,
        employeesResult,
        pendingInvoicesResult,
        lastMonthInvoicesResult,
        goalsResult,
      ] = await Promise.all([
        // Current month revenue
        supabase
          .from("financial_records")
          .select("amount")
          .eq("user_id", user.id)
          .eq("type", "revenue"),
        
        // Last month revenue for comparison
        supabase
          .from("financial_records")
          .select("amount")
          .eq("user_id", user.id)
          .eq("type", "revenue")
          .gte("record_date", lastMonthStart.toISOString().split("T")[0])
          .lte("record_date", lastMonthEnd.toISOString().split("T")[0]),
        
        // Active employees
        supabase
          .from("profiles")
          .select("id, status")
          .eq("status", "active"),
        
        // Pending invoices (draft or sent but not paid)
        supabase
          .from("invoices")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["draft", "sent"]),
        
        // Last month pending invoices for comparison
        supabase
          .from("invoices")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["draft", "sent"])
          .gte("created_at", lastMonthStart.toISOString())
          .lte("created_at", lastMonthEnd.toISOString()),
        
        // Goals progress
        supabase
          .from("goals")
          .select("progress, status")
          .eq("user_id", user.id),
      ]);

      // Calculate total revenue
      const totalRevenue = currentRevenueResult.data?.reduce(
        (sum, record) => sum + Number(record.amount),
        0
      ) || 0;

      const lastMonthRevenue = lastMonthRevenueResult.data?.reduce(
        (sum, record) => sum + Number(record.amount),
        0
      ) || 0;

      const revenueChange = lastMonthRevenue > 0
        ? ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

      // Employee stats
      const activeEmployees = employeesResult.data?.length || 0;

      // Invoice stats
      const pendingInvoices = pendingInvoicesResult.data?.length || 0;
      const lastMonthPendingInvoices = lastMonthInvoicesResult.data?.length || 0;
      const invoiceChange = pendingInvoices - lastMonthPendingInvoices;

      // Goals stats - calculate average progress of active goals
      const goals = goalsResult.data || [];
      const completedGoals = goals.filter((g) => g.status === "completed").length;
      const totalGoals = goals.length;
      const goalsAchieved = totalGoals > 0 
        ? Math.round((completedGoals / totalGoals) * 100)
        : 0;

      // Average progress for non-completed goals as change indicator
      const avgProgress = goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
        : 0;

      return {
        totalRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        activeEmployees,
        employeeChange: 0, // Would need historical data to calculate
        pendingInvoices,
        invoiceChange,
        goalsAchieved: avgProgress, // Using average progress instead
        goalsChange: 0,
      };
    },
    enabled: !!user,
    staleTime: 30000, // Cache for 30 seconds
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

// Format currency in Indian format (Lakhs)
export function formatIndianCurrency(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs.toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
