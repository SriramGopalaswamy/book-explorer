import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface FiscalPeriod {
  id: string;
  user_id: string;
  year: number;
  period: number;
  start_date: string;
  end_date: string;
  status: "open" | "closed" | "locked";
  closed_by: string | null;
  closed_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useFiscalPeriods(year?: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["fiscalPeriods", user?.id, year],
    queryFn: async () => {
      if (!user) return [];

      let query = (supabase as any)
        .from("fiscal_periods")
        .select("*")
        .order("year", { ascending: false })
        .order("period", { ascending: false });

      if (year) {
        query = query.eq("year", year);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FiscalPeriod[];
    },
    enabled: !!user,
  });
}

export function useCurrentPeriodStatus() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["periodStatus", user?.id, today],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from("fiscal_periods")
        .select("*")
        .lte("start_date", today)
        .gte("end_date", today)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return (data as FiscalPeriod) ?? null;
    },
    enabled: !!user,
  });
}

export function useInitializeFiscalYear() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (year: number) => {
      const { data, error } = await (supabase as any).rpc("initialize_fiscal_year", {
        p_year: year,
      });

      if (error) throw error;
      return (data ?? []) as FiscalPeriod[];
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fiscalPeriods"] });
      toast({
        title: "Fiscal Year Initialized",
        description: `Created ${data.length} fiscal periods for the year.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to initialize fiscal year: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useCloseFiscalPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await (supabase as any).rpc("close_fiscal_period", {
        p_period_id: periodId,
      });

      if (error) throw error;
      return data as FiscalPeriod;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fiscalPeriods"] });
      queryClient.invalidateQueries({ queryKey: ["periodStatus"] });
      toast({
        title: "Period Closed",
        description: `Fiscal period has been closed. No further modifications allowed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message.includes("records in")
          ? "Cannot close period - there are transactions that need to be resolved first."
          : `Failed to close period: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useReopenFiscalPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await (supabase as any).rpc("reopen_fiscal_period", {
        p_period_id: periodId,
      });

      if (error) throw error;
      return data as FiscalPeriod;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscalPeriods"] });
      queryClient.invalidateQueries({ queryKey: ["periodStatus"] });
      toast({
        title: "Period Reopened",
        description: `Fiscal period has been reopened.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message.includes("administrators")
          ? "Only administrators can reopen fiscal periods."
          : `Failed to reopen period: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useDatePeriodStatus(date: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["datePeriodStatus", user?.id, date],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from("fiscal_periods")
        .select("status")
        .lte("start_date", date)
        .gte("end_date", date)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data?.status || "open";
    },
    enabled: !!user && !!date,
  });
}

export function formatPeriodName(period: FiscalPeriod): string {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${monthNames[period.period - 1]} ${period.year}`;
}

export function getPeriodStatusColor(status: FiscalPeriod["status"]): string {
  switch (status) {
    case "open":
      return "bg-green-100 text-green-800";
    case "closed":
      return "bg-yellow-100 text-yellow-800";
    case "locked":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
