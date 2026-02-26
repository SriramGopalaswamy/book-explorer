import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockFinancialRecords } from "@/lib/mock-data";
import { financialRecordSchema } from "@/lib/validation-schemas";

export interface FinancialRecord {
  id: string;
  user_id: string;
  type: "revenue" | "expense";
  category: string;
  amount: number;
  description: string | null;
  record_date: string;
  created_at: string;
  updated_at: string;
}

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
  "Salaries":        "hsl(328, 86%, 58%)",  // magenta-pink — brand accent, highly visible
  "Operations":      "hsl(262, 70%, 65%)",  // bright violet
  "Marketing":       "hsl(38, 95%, 55%)",   // vivid amber
  "Rent & Utilities":"hsl(199, 85%, 55%)",  // bright sky blue
  "Software":        "hsl(142, 65%, 48%)",  // bright green
  "Others":          "hsl(220, 25%, 60%)",  // medium steel blue — readable on both themes
  "Sales":           "hsl(328, 86%, 58%)",  // magenta-pink
  "Services":        "hsl(262, 70%, 65%)",  // bright violet
  "Investments":     "hsl(38, 95%, 55%)",   // vivid amber
};

// Org-scoped via RLS — no user_id filter needed for SELECT
export function useFinancialRecords() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["financial-records", user?.id, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockFinancialRecords;
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .order("record_date", { ascending: false });

      if (error) throw error;
      return data as FinancialRecord[];
    },
    enabled: !!user || isDevMode,
  });
}

// Monthly revenue — org-scoped via RLS
export function useMonthlyRevenueData(dateRange?: DateRangeFilter) {
  const isDevMode = useIsDevModeWithoutAuth();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["monthly-revenue", user?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<MonthlyData[]> => {
      if (!user) return [];

      const fromDate = dateRange?.from || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return d;
      })();
      const toDate = dateRange?.to || new Date();

      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .gte("record_date", fromDate.toISOString().split("T")[0])
        .lte("record_date", toDate.toISOString().split("T")[0]);

      if (error) throw error;

      const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      // Choose granularity based on range span
      const granularity: "daily" | "weekly" | "monthly" = diffDays <= 31 ? "daily" : diffDays <= 90 ? "weekly" : "monthly";

      const getBucketKey = (dateStr: string): string => {
        const d = new Date(dateStr);
        if (granularity === "daily") {
          return `${d.getDate()} ${months[d.getMonth()]}`;
        }
        if (granularity === "weekly") {
          // Week start (Monday)
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const weekStart = new Date(d);
          weekStart.setDate(diff);
          return `${weekStart.getDate()} ${months[weekStart.getMonth()]}`;
        }
        return `${months[d.getMonth()]} ${d.getFullYear()}`;
      };

      const bucketMap = new Map<string, { revenue: number; expenses: number }>();

      data.forEach((record) => {
        const key = getBucketKey(record.record_date);
        if (!bucketMap.has(key)) {
          bucketMap.set(key, { revenue: 0, expenses: 0 });
        }
        const current = bucketMap.get(key)!;
        if (record.type === "revenue") {
          current.revenue += Number(record.amount);
        } else {
          current.expenses += Number(record.amount);
        }
      });

      // Generate ordered buckets
      const result: MonthlyData[] = [];
      const currentDate = new Date(fromDate);

      if (granularity === "daily") {
        while (currentDate <= toDate) {
          const key = `${currentDate.getDate()} ${months[currentDate.getMonth()]}`;
          const d = bucketMap.get(key) || { revenue: 0, expenses: 0 };
          result.push({ month: key, ...d });
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (granularity === "weekly") {
        // Align to Monday
        const day = currentDate.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        currentDate.setDate(currentDate.getDate() + diff);
        while (currentDate <= toDate) {
          const key = `${currentDate.getDate()} ${months[currentDate.getMonth()]}`;
          const d = bucketMap.get(key) || { revenue: 0, expenses: 0 };
          result.push({ month: key, ...d });
          currentDate.setDate(currentDate.getDate() + 7);
        }
      } else {
        while (currentDate <= toDate) {
          const key = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
          const d = bucketMap.get(key) || { revenue: 0, expenses: 0 };
          result.push({ month: months[currentDate.getMonth()], ...d });
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }

      return result;
    },
    enabled: !!user || isDevMode,
  });
}

// Expense breakdown — org-scoped via RLS
export function useExpenseBreakdown(dateRange?: DateRangeFilter) {
  const isDevMode = useIsDevModeWithoutAuth();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["expense-breakdown", user?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<CategoryData[]> => {
      if (!user) return getDefaultExpenseData();

      const fromDate = dateRange?.from || (() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
      })();
      const toDate = dateRange?.to || new Date();

      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .eq("type", "expense")
        .gte("record_date", fromDate.toISOString().split("T")[0])
        .lte("record_date", toDate.toISOString().split("T")[0]);

      if (error) throw error;

      if (!data || data.length === 0) {
        return getDefaultExpenseData();
      }

      const categoryMap = new Map<string, number>();
      
      data.forEach((record) => {
        const current = categoryMap.get(record.category) || 0;
        categoryMap.set(record.category, current + Number(record.amount));
      });

      return Array.from(categoryMap.entries()).map(([name, value]) => ({
        name,
        value,
        color: categoryColors[name] || "hsl(220, 9%, 46%)",
      }));
    },
    enabled: !!user || isDevMode,
  });
}

export function useAddFinancialRecord() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (record: Omit<FinancialRecord, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user) throw new Error("User not authenticated");

      const validated = financialRecordSchema.parse(record);

      const { data, error } = await supabase
        .from("financial_records")
        .insert({
          type: validated.type,
          category: validated.category,
          amount: validated.amount,
          description: validated.description ?? null,
          record_date: validated.record_date,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-records"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["expense-breakdown"] });
    },
  });
}

export function useUpdateFinancialRecord() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...record }: { id: string } & Partial<Omit<FinancialRecord, "id" | "user_id" | "created_at" | "updated_at">>) => {
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("financial_records")
        .update(record)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-records"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["expense-breakdown"] });
    },
  });
}

export function useDeleteFinancialRecord() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("financial_records")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-records"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["expense-breakdown"] });
    },
  });
}


function getDefaultExpenseData(): CategoryData[] {
  return [
    { name: "Salaries",         value: 1850000, color: "hsl(328, 86%, 58%)" },
    { name: "Operations",       value: 420000,  color: "hsl(262, 70%, 65%)" },
    { name: "Marketing",        value: 280000,  color: "hsl(38, 95%, 55%)"  },
    { name: "Rent & Utilities", value: 180000,  color: "hsl(199, 85%, 55%)" },
    { name: "Software",         value: 120000,  color: "hsl(142, 65%, 48%)" },
    { name: "Others",           value: 150000,  color: "hsl(220, 25%, 60%)" },
  ];
}
