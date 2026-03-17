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

      // Resolve caller org for tenant isolation
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("Organization not found");

      // Calculate next run date based on frequency and current date
      const calcNextRunDate = (startDate: string, frequency: string): string => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);

        // If start date is in the future, use it as next run date
        if (start > today) return startDate;

        // Otherwise calculate next run date from today
        const addInterval = (date: Date, freq: string): Date => {
          const d = new Date(date);
          switch (freq) {
            case "daily": d.setDate(d.getDate() + 1); break;
            case "weekly": d.setDate(d.getDate() + 7); break;
            case "monthly": d.setMonth(d.getMonth() + 1); break;
            case "quarterly": d.setMonth(d.getMonth() + 3); break;
            case "yearly": d.setFullYear(d.getFullYear() + 1); break;
          }
          return d;
        };

        // For daily, next run is today if start <= today
        if (frequency === "daily") {
          return today.toISOString().split("T")[0];
        }

        // For other frequencies, find the next occurrence from start date
        let next = new Date(start);
        while (next <= today) {
          next = addInterval(next, frequency);
        }
        return next.toISOString().split("T")[0];
      };

      const nextRunDate = calcNextRunDate(params.start_date, params.frequency);

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
          next_run_date: nextRunDate,
          status: "active",
          notes: params.notes || null,
          created_by: user.id,
          organization_id: profile.organization_id,
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

      // Resolve caller org for tenant isolation
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      if (!profile?.organization_id) throw new Error("Organization not found");

      const { error } = await supabase
        .from("recurring_transactions" as any)
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .eq("organization_id", profile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useExecuteRecurringTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/execute-recurring-transactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Execution failed");
      return body as { message: string; executed: number; total_due: number; errors?: string[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["recurring-transactions"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["financial-records"] });
      if (data.executed > 0) {
        toast.success(`Executed ${data.executed} recurring transaction(s)`);
      } else {
        toast.info(data.message);
      }
      if (data.errors && data.errors.length > 0) {
        toast.warning(`${data.errors.length} error(s) during execution`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
}
