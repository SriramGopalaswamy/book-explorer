import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface RecurringTransaction {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  frequency: string; // daily | weekly | monthly | quarterly | yearly
  debit_account_id: string | null;
  credit_account_id: string | null;
  amount: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  next_run_date: string | null;
  last_run_date: string | null;
  status: string; // active | paused | completed | cancelled
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useRecurringTransactions() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["recurring-transactions", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("recurring_transactions" as any)
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RecurringTransaction[];
    },
    enabled: !!orgId,
  });
}

export function useCreateRecurringTransaction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      frequency: string;
      amount: number;
      currency?: string;
      debit_account_id?: string;
      credit_account_id?: string;
      start_date: string;
      end_date?: string;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.name?.trim()) throw new Error("Name is required");
      if (params.amount <= 0) throw new Error("Amount must be greater than zero");
      const VALID_FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"];
      if (!VALID_FREQUENCIES.includes(params.frequency)) throw new Error("Invalid frequency");

      const { data, error } = await supabase
        .from("recurring_transactions" as any)
        .insert({
          name: params.name.trim(),
          description: params.description || null,
          frequency: params.frequency,
          amount: params.amount,
          currency: params.currency || "INR",
          debit_account_id: params.debit_account_id || null,
          credit_account_id: params.credit_account_id || null,
          start_date: params.start_date,
          end_date: params.end_date || null,
          next_run_date: params.start_date,
          status: "active",
          notes: params.notes || null,
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      toast.success("Recurring transaction created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateRecurringTransactionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const VALID = ["active", "paused", "completed", "cancelled"] as const;
      if (!VALID.includes(status as any)) throw new Error(`Invalid status: ${status}`);
      const { error } = await supabase
        .from("recurring_transactions" as any)
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
