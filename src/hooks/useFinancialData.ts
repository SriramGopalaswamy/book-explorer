import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockFinancialRecords, mockMonthlyData } from "@/lib/mock-data";
import { financialRecordSchema } from "@/lib/validation-schemas";
import { toast } from "sonner";

export interface FinancialRecord {
  id: string;
  user_id: string;
  organization_id?: string;
  type: "revenue" | "expense";
  category: string;
  amount: number;
  description: string | null;
  record_date: string;
  currency_code?: string | null;
  exchange_rate?: number | null;
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
const MAX_DYNAMIC_COLORS = 100;
let fallbackIndex = 0;
const dynamicColorCache: Record<string, string> = {};

function getCategoryColor(name: string): string {
  if (categoryColors[name]) return categoryColors[name];
  if (!dynamicColorCache[name]) {
    // Cap the cache to prevent unbounded memory growth
    if (Object.keys(dynamicColorCache).length >= MAX_DYNAMIC_COLORS) {
      return fallbackPalette[name.length % fallbackPalette.length];
    }
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

        .eq("organization_id", orgId)
        .order("record_date", { ascending: false }).limit(500);

      if (error) throw error;
      return data as FinancialRecord[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

// GBC-50: monthly revenue/expense buckets sourced from the
// monthly_revenue(p_from, p_to, p_granularity) RPC. Granularity is
// chosen from the span like the legacy client code did.
export function useMonthlyRevenueData(dateRange?: DateRangeFilter) {
  const isDevMode = useIsDevModeWithoutAuth();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["monthly-revenue", user?.id, orgId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<MonthlyData[]> => {
      if (isDevMode) return mockMonthlyData;
      if (!user || !orgId) return [];

      const fromDate = dateRange?.from || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return d;
      })();
      const toDate = dateRange?.to || new Date();

      const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      const granularity: "daily" | "weekly" | "monthly" =
        diffDays <= 31 ? "daily" : diffDays <= 90 ? "weekly" : "monthly";

      const { data, error } = await (supabase as any).rpc("monthly_revenue", {
        p_from: fromDate.toISOString().split("T")[0],
        p_to: toDate.toISOString().split("T")[0],
        p_granularity: granularity,
      });
      if (error) throw error;

      return ((data ?? []) as Array<{ bucket_label: string; revenue: number; expenses: number }>)
        .map((r) => ({
          month: r.bucket_label,
          revenue: Number(r.revenue),
          expenses: Number(r.expenses),
        }));
    },
    enabled: (!!user && !!orgId) || isDevMode,
    staleTime: 60_000,
  });
}

// GBC-50: expense breakdown by category sourced from the
// expense_breakdown(p_from, p_to) RPC. The RPC merges the expenses
// table (approved + paid) with financial_records (type='expense')
// server-side via UNION ALL, so the page no longer pulls two full
// tables to reduce them in the browser.
export function useExpenseBreakdown(dateRange?: DateRangeFilter) {
  const isDevMode = useIsDevModeWithoutAuth();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["expense-breakdown", user?.id, orgId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<CategoryData[]> => {
      if (!user || !orgId) return getDefaultExpenseData();

      const fromStr = dateRange?.from ? dateRange.from.toISOString().split("T")[0] : null;
      const toStr   = dateRange?.to   ? dateRange.to.toISOString().split("T")[0]   : null;

      const { data, error } = await (supabase as any).rpc("expense_breakdown", {
        p_from: fromStr,
        p_to: toStr,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ category: string; total_amount: number }>;
      if (rows.length === 0) return [];
      return rows.map((r) => ({
        name: r.category || "Uncategorized",
        value: Number(r.total_amount),
        color: getCategoryColor(r.category || "Uncategorized"),
      }));
    },
    enabled: (!!user && !!orgId) || isDevMode,
    staleTime: 60_000,
  });
}

export function useAddFinancialRecord() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();

  return useMutation({
    mutationFn: async (record: Omit<FinancialRecord, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user) throw new Error("User not authenticated");

      // ── Fiscal period guard ────────────────────────────────
      const { validateFiscalPeriod } = await import("@/lib/fiscal-period-guard");
      await validateFiscalPeriod(record.record_date);

      const validated = financialRecordSchema.parse(record);
      const orgId = orgData?.organizationId;
      const currencyCode = record.currency_code || "INR";
      let exchangeRate: number;
      if (currencyCode === "INR") {
        exchangeRate = 1;
      } else if (record.exchange_rate && Number.isFinite(record.exchange_rate) && record.exchange_rate > 0) {
        exchangeRate = record.exchange_rate;
      } else {
        throw new Error("A valid exchange rate is required for non-INR transactions.");
      }

      const { data, error } = await supabase
        .from("financial_records")
        .insert({
          type: validated.type,
          category: validated.category,
          amount: validated.amount,
          description: validated.description ?? null,
          record_date: validated.record_date,
          currency_code: currencyCode,
          exchange_rate: exchangeRate,
          user_id: user.id,
          ...(orgId ? { organization_id: orgId } : {}),
        } as any)
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
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save transaction. Please try again.");
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

      // Validate exchange_rate when currency is being changed or rate is being set.
      // Mirrors the same guard in useAddFinancialRecord — prevents a record from being
      // updated to a non-INR currency without a valid positive exchange rate.
      if (record.currency_code !== undefined || record.exchange_rate !== undefined) {
        const newCurrency = record.currency_code ?? "INR";
        if (newCurrency !== "INR") {
          const rate = record.exchange_rate;
          if (!rate || !Number.isFinite(rate) || rate <= 0) {
            throw new Error("A valid exchange rate is required for non-INR transactions.");
          }
        }
      }

      // Resolve org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      const { data, error } = await supabase
        .from("financial_records")
        .update(record)
        .eq("id", id)
        .eq("organization_id", callerOrgId)
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
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update transaction. Please try again.");
    },
  });
}

export function useDeleteFinancialRecord() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User not authenticated");

      // Resolve org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      const { data, error } = await supabase
        .from("financial_records")
        .delete()
        .eq("id", id)
        .eq("organization_id", callerOrgId)
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
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete transaction. Please try again.");
    },
  });
}


function getDefaultExpenseData(): CategoryData[] {
  return [];
}
