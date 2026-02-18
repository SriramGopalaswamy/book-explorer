import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

export interface SparklinePoint {
  month: string;
  value: number;
}

export interface DashboardSparklines {
  revenue: SparklinePoint[];
  expenses: SparklinePoint[];
  netIncome: SparklinePoint[];
}

export function useSparklineData() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dashboard-sparklines", user?.id],
    queryFn: async (): Promise<DashboardSparklines> => {
      if (!user) return { revenue: [], expenses: [], netIncome: [] };

      const now = new Date();
      // Build last 6 months range
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(now, 5 - i);
        return {
          label: format(d, "MMM"),
          start: startOfMonth(d).toISOString().split("T")[0],
          end: endOfMonth(d).toISOString().split("T")[0],
        };
      });

      // Check admin/finance role once
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "hr", "finance"])
        .maybeSingle();
      const isAdminOrFinance = !!adminRole;

      // Fetch all financial_records in the 6-month window in one query
      const windowStart = months[0].start;
      const windowEnd = months[5].end;

      let query = supabase
        .from("financial_records")
        .select("amount, type, record_date")
        .gte("record_date", windowStart)
        .lte("record_date", windowEnd);

      if (!isAdminOrFinance) {
        query = query.eq("user_id", user.id);
      }

      const { data } = await query;
      const records = data || [];

      // Aggregate by month
      const revenue: SparklinePoint[] = months.map(({ label, start, end }) => ({
        month: label,
        value: records
          .filter(r => r.type === "revenue" && r.record_date >= start && r.record_date <= end)
          .reduce((s, r) => s + Number(r.amount), 0),
      }));

      const expenses: SparklinePoint[] = months.map(({ label, start, end }) => ({
        month: label,
        value: records
          .filter(r => r.type === "expense" && r.record_date >= start && r.record_date <= end)
          .reduce((s, r) => s + Number(r.amount), 0),
      }));

      const netIncome: SparklinePoint[] = months.map(({ label }, i) => ({
        month: label,
        value: revenue[i].value - expenses[i].value,
      }));

      return { revenue, expenses, netIncome };
    },
    enabled: !!user,
    staleTime: 60000,
  });
}
