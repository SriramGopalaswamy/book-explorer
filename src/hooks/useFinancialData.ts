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
        .eq("user_id", user.id)
        .order("record_date", { ascending: false });

      if (error) throw error;
      return data as FinancialRecord[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useMonthlyRevenueData(dateRange?: DateRangeFilter) {
  const isDevMode = useIsDevModeWithoutAuth();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["monthly-revenue", user?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<MonthlyData[]> => {
      if (!user) return getDefaultMonthlyData();

      const fromDate = dateRange?.from || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return d;
      })();
      const toDate = dateRange?.to || new Date();

      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .eq("user_id", user.id)
        .gte("record_date", fromDate.toISOString().split("T")[0])
        .lte("record_date", toDate.toISOString().split("T")[0]);

      if (error) throw error;

      if (!data || data.length === 0) {
        return getDefaultMonthlyData();
      }

      const monthlyMap = new Map<string, { revenue: number; expenses: number }>();
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      data.forEach((record) => {
        const date = new Date(record.record_date);
        const monthKey = `${months[date.getMonth()]} ${date.getFullYear()}`;
        
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { revenue: 0, expenses: 0 });
        }
        
        const current = monthlyMap.get(monthKey)!;
        if (record.type === "revenue") {
          current.revenue += Number(record.amount);
        } else {
          current.expenses += Number(record.amount);
        }
      });

      const result: MonthlyData[] = [];
      const currentDate = new Date(fromDate);
      
      while (currentDate <= toDate) {
        const monthKey = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        const data = monthlyMap.get(monthKey) || { revenue: 0, expenses: 0 };
        result.push({ month: months[currentDate.getMonth()], ...data });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return result;
    },
    enabled: !!user || isDevMode,
  });
}

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
        .eq("user_id", user.id)
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

function getDefaultMonthlyData(): MonthlyData[] {
  return [
    { month: "Jan", revenue: 2850000, expenses: 1800000 },
    { month: "Feb", revenue: 3200000, expenses: 2100000 },
    { month: "Mar", revenue: 2900000, expenses: 1900000 },
    { month: "Apr", revenue: 3800000, expenses: 2400000 },
    { month: "May", revenue: 4100000, expenses: 2600000 },
    { month: "Jun", revenue: 4523000, expenses: 2900000 },
  ];
}

function getDefaultExpenseData(): CategoryData[] {
  return [
    { name: "Salaries", value: 1850000, color: "hsl(222, 47%, 14%)" },
    { name: "Operations", value: 420000, color: "hsl(262, 52%, 47%)" },
    { name: "Marketing", value: 280000, color: "hsl(38, 92%, 50%)" },
    { name: "Rent & Utilities", value: 180000, color: "hsl(199, 89%, 48%)" },
    { name: "Software", value: 120000, color: "hsl(142, 76%, 36%)" },
    { name: "Others", value: 150000, color: "hsl(220, 9%, 46%)" },
  ];
}
