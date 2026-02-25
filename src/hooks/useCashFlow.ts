import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockScheduledPayments } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { createScheduledPaymentSchema } from "@/lib/validation-schemas";

export interface ScheduledPayment {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  due_date: string;
  payment_type: "inflow" | "outflow";
  status: "scheduled" | "pending" | "completed" | "cancelled";
  category: string | null;
  recurring: boolean;
  recurrence_interval: "weekly" | "monthly" | "quarterly" | "yearly" | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledPaymentData {
  name: string;
  amount: number;
  due_date: string;
  payment_type: "inflow" | "outflow";
  category?: string;
  recurring?: boolean;
  recurrence_interval?: ScheduledPayment["recurrence_interval"];
}

export function useScheduledPayments() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["scheduled-payments", user?.id, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockScheduledPayments;
      if (!user) return [];
      const { data, error } = await supabase
        .from("scheduled_payments")
        .select("*")
        .in("status", ["scheduled", "pending"])
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as ScheduledPayment[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useCreateScheduledPayment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateScheduledPaymentData) => {
      if (!user) throw new Error("Not authenticated");
      const validated = createScheduledPaymentSchema.parse(data);
      const { data: payment, error } = await supabase
        .from("scheduled_payments")
        .insert({
          name: validated.name,
          amount: validated.amount,
          due_date: validated.due_date,
          payment_type: validated.payment_type,
          category: validated.category ?? null,
          recurring: validated.recurring ?? false,
          recurrence_interval: validated.recurrence_interval ?? null,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-payments"] });
      toast({ title: "Payment Scheduled", description: "Payment has been scheduled successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ScheduledPayment["status"] }) => {
      const { data, error } = await supabase
        .from("scheduled_payments")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-payments"] });
      toast({ title: "Status Updated", description: "Payment status has been updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteScheduledPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-payments"] });
      toast({ title: "Payment Deleted", description: "Scheduled payment has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Summary stats for cash flow
export function useCashFlowSummary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["cash-flow-summary", user?.id],
    queryFn: async () => {
      if (!user) {
        return {
          totalInflow: 9250000,
          totalOutflow: 7830000,
          netCashFlow: 1420000,
          runway: 8.5,
        };
      }

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("transaction_type, amount")
        .gte("transaction_date", sixMonthsAgo.toISOString().split("T")[0]);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          totalInflow: 9250000,
          totalOutflow: 7830000,
          netCashFlow: 1420000,
          runway: 8.5,
        };
      }

      const stats = data.reduce(
        (acc, tx) => {
          if (tx.transaction_type === "credit") {
            acc.totalInflow += Number(tx.amount);
          } else {
            acc.totalOutflow += Number(tx.amount);
          }
          return acc;
        },
        { totalInflow: 0, totalOutflow: 0 }
      );

      const netCashFlow = stats.totalInflow - stats.totalOutflow;
      const monthlyBurn = stats.totalOutflow / 6;
      
      // Get current balance
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("balance");

      const totalBalance = (accounts || []).reduce((sum, acc) => sum + Number(acc.balance), 0);
      const runway = monthlyBurn > 0 ? totalBalance / monthlyBurn : 0;

      return {
        ...stats,
        netCashFlow,
        runway: Math.round(runway * 10) / 10,
      };
    },
    enabled: !!user,
  });
}
