import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockScheduledPayments } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { createScheduledPaymentSchema } from "@/lib/validation-schemas";
import { createBankTransaction } from "@/lib/bank-transaction-sync";

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
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ScheduledPayment["status"] }) => {
      if (!user) throw new Error("Not authenticated");
      const validStatuses: ScheduledPayment["status"][] = ["scheduled", "pending", "completed", "cancelled"];
      if (!validStatuses.includes(status)) throw new Error("Invalid payment status");

      // ── Lifecycle state-machine ───────────────────────────────
      const SP_TRANSITIONS: Record<string, string[]> = {
        scheduled: ["pending", "cancelled"],
        pending: ["completed", "cancelled"],
        completed: [],   // terminal
        cancelled: [],   // terminal
      };

      // Fetch current status to enforce transitions
      const { data: current, error: fetchErr } = await supabase
        .from("scheduled_payments")
        .select("status")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      const currentStatus = current?.status as string;

      const allowed = SP_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot change scheduled payment from "${currentStatus}" to "${status}".`);
      }

      const { data, error } = await supabase
        .from("scheduled_payments")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // When marking as completed, create a bank transaction to update KPIs
      if (status === "completed" && user) {
        const payment = data as ScheduledPayment;
        await createBankTransaction({
          userId: user.id,
          amount: Number(payment.amount),
          type: payment.payment_type === "inflow" ? "credit" : "debit",
          description: `Scheduled payment: ${payment.name}`,
          reference: payment.id,
          category: payment.category || (payment.payment_type === "inflow" ? "Scheduled Inflow" : "Scheduled Outflow"),
          date: payment.due_date,
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-payments"] });
      queryClient.invalidateQueries({ queryKey: ["cash-flow-summary"] });
      queryClient.invalidateQueries({ queryKey: ["cash-flow-data"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({ title: "Status Updated", description: "Payment marked as completed and cash flow updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteScheduledPayment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");

      // Only scheduled/pending payments can be deleted; completed ones are immutable
      const { data: payment, error: fetchErr } = await supabase
        .from("scheduled_payments")
        .select("status")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if (payment?.status === "completed") {
        throw new Error("Completed payments cannot be deleted. They form part of the cash flow record.");
      }

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
      if (!user) return { totalInflow: 0, totalOutflow: 0, netCashFlow: 0, runway: 0 };

      // Resolve org for scoping
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const orgId = profile?.organization_id;

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (!orgId) return { totalInflow: 0, totalOutflow: 0, netCashFlow: 0, runway: 0 };

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("transaction_type, amount")
        .gte("transaction_date", sixMonthsAgo.toISOString().split("T")[0])
        .eq("organization_id", orgId);

      if (error) throw error;

      if (!data || data.length === 0) {
        return { totalInflow: 0, totalOutflow: 0, netCashFlow: 0, runway: 0 };
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
      
      // Get current balance — org-scoped
      const { data: accounts } = await supabase.from("bank_accounts").select("balance").eq("organization_id", orgId);

      const totalBalance = (accounts || []).reduce((sum, acc) => sum + Number(acc.balance), 0);
      const runway = monthlyBurn > 0 ? totalBalance / monthlyBurn : 0;

      return {
        ...stats,
        netCashFlow,
        runway: Math.round(runway * 10) / 10,
      };
    },
    enabled: !!user && !!orgId,
  });
}
