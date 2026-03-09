import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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
  "Salaries":        "hsl(328, 86%, 58%)",  // magenta-pink
  "Operations":      "hsl(262, 70%, 65%)",  // bright violet
  "Marketing":       "hsl(38, 95%, 55%)",   // vivid amber
  "Rent & Utilities":"hsl(199, 85%, 55%)",  // bright sky blue
  "Software":        "hsl(142, 65%, 48%)",  // bright green
  "Others":          "hsl(220, 25%, 60%)",  // medium steel blue
  "Sales":           "hsl(15, 85%, 55%)",   // coral orange
  "Services":        "hsl(175, 65%, 45%)",  // teal
  "Investments":     "hsl(55, 80%, 50%)",   // golden yellow
  "Travel":          "hsl(290, 60%, 55%)",  // purple
  "Insurance":       "hsl(100, 55%, 50%)",  // lime green
  "Professional Fees":"hsl(350, 70%, 50%)", // crimson
  "Uncategorized":   "hsl(220, 15%, 55%)",  // neutral gray
};

// Dynamic fallback palette for categories not in the static map
const fallbackPalette = [
  "hsl(210, 70%, 55%)", "hsl(30, 80%, 55%)", "hsl(160, 60%, 45%)",
  "hsl(280, 65%, 55%)", "hsl(0, 70%, 55%)",  "hsl(70, 60%, 48%)",
  "hsl(190, 75%, 50%)", "hsl(310, 60%, 55%)", "hsl(120, 50%, 45%)",
  "hsl(240, 55%, 60%)",
];
let fallbackIndex = 0;
const dynamicColorCache: Record<string, string> = {};

function getCategoryColor(name: string): string {
  if (categoryColors[name]) return categoryColors[name];
  if (!dynamicColorCache[name]) {
    dynamicColorCache[name] = fallbackPalette[fallbackIndex % fallbackPalette.length];
    fallbackIndex++;
  }
  return dynamicColorCache[name];
}

// Org-scoped via RLS — no user_id filter needed for SELECT
export function useFinancialRecords() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["financial-records", user?.id, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockFinancialRecords;
      if (!user || !orgId) return [];
      
      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .eq("is_deleted", false)
        .eq("organization_id", orgId)
        .order("record_date", { ascending: false });

      if (error) throw error;
      return data as FinancialRecord[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
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
        .eq("is_deleted", false)
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

// Expense breakdown — pulls from expenses table (source of truth) + financial_records fallback
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
      const fromStr = fromDate.toISOString().split("T")[0];
      const toStr = toDate.toISOString().split("T")[0];

      // Fetch from both expenses table and financial_records
      const [expensesRes, financialRes] = await Promise.all([
        supabase
          .from("expenses")
          .select("category, amount")
          .eq("is_deleted", false)
          .gte("expense_date", fromStr)
          .lte("expense_date", toStr),
        supabase
          .from("financial_records")
          .select("category, amount")
          .eq("type", "expense")
          .eq("is_deleted", false)
          .gte("record_date", fromStr)
          .lte("record_date", toStr),
      ]);

      const categoryMap = new Map<string, number>();

      // Primary source: expenses table (all statuses)
      (expensesRes.data || []).forEach((record) => {
        const cat = record.category || "Uncategorized";
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(record.amount));
      });

      // Fallback: if no expenses found, use financial_records (manual journal entries)
      if (categoryMap.size === 0 && financialRes.data) {
        financialRes.data.forEach((record) => {
          const cat = record.category || "Uncategorized";
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(record.amount));
        });
      }

      if (categoryMap.size === 0) {
        return [];
      }

      return Array.from(categoryMap.entries()).map(([name, value]) => ({
        name,
        value,
        color: getCategoryColor(name),
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

      // ── Fiscal period guard ────────────────────────────────
      const { validateFiscalPeriod } = await import("@/lib/fiscal-period-guard");
      await validateFiscalPeriod(record.record_date);

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

      // Validate amount if provided
      if (record.amount !== undefined && record.amount <= 0) {
        throw new Error("Amount must be a positive number");
      }

      const { data, error } = await supabase
        .from("financial_records")
        .update(record)
        .eq("id", id)
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

      const { data, error } = await supabase
        .from("financial_records")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Unable to delete entry. You may not have permission.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-records"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["expense-breakdown"] });
    },
  });
}


function getDefaultExpenseData(): CategoryData[] {
  return [];
}
