import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FinancialYear {
  id: string;
  organization_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Fetch financial years for the current user's org — org-scoped via RLS.
 */
export function useFinancialYears() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["financial-years", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("financial_years")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as FinancialYear[];
    },
    enabled: !!user,
  });
}

/**
 * Get the active financial year for the current org.
 */
export function useActiveFinancialYear() {
  const { data: years = [], isLoading } = useFinancialYears();
  const active = years.find((y) => y.is_active) ?? null;

  return {
    data: active,
    isLoading,
    years,
  };
}

/**
 * Format financial year display string.
 */
export function formatFinancialYear(fy: FinancialYear): string {
  const start = new Date(fy.start_date);
  const end = new Date(fy.end_date);
  return `FY ${start.getFullYear()}–${end.getFullYear()}`;
}

/**
 * Get status color for financial year.
 */
export function getFinancialYearStatusColor(isActive: boolean): string {
  return isActive
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
    : "bg-muted text-muted-foreground";
}
