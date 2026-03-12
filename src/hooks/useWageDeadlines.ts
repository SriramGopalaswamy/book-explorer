import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface WagePaymentDeadline {
  id: string;
  organization_id: string;
  pay_period: string;
  employee_threshold: number;
  employee_count: number;
  deadline_date: string;
  actual_payment_date: string | null;
  status: "pending" | "compliant" | "overdue" | "paid_late";
  penalty_applicable: boolean;
  notes: string | null;
  created_at: string;
}

/**
 * Payment of Wages Act, 1936 §5
 * < 1000 employees → wages by 7th of following month
 * ≥ 1000 employees → wages by 10th of following month
 */
export function computeDeadlineDate(payPeriod: string, employeeCount: number): string {
  const [year, month] = payPeriod.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const day = employeeCount >= 1000 ? 10 : 7;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function useWageDeadlines() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wage-payment-deadlines"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wage_payment_deadlines")
        .select("*")
        .order("pay_period", { ascending: false });
      if (error) throw error;
      return data as WagePaymentDeadline[];
    },
    enabled: !!user,
  });
}

export function useCreateWageDeadline() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { pay_period: string; employee_count: number }) => {
      const deadline_date = computeDeadlineDate(input.pay_period, input.employee_count);
      const { data, error } = await (supabase as any)
        .from("wage_payment_deadlines")
        .insert({
          pay_period: input.pay_period,
          employee_count: input.employee_count,
          employee_threshold: 1000,
          deadline_date,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wage-payment-deadlines"] });
      toast.success("Wage deadline tracked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarkWagePaid() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, actual_payment_date }: { id: string; actual_payment_date: string }) => {
      // Fetch deadline to compare
      const { data: dl } = await (supabase as any)
        .from("wage_payment_deadlines")
        .select("deadline_date")
        .eq("id", id)
        .single();

      const isPastDeadline = actual_payment_date > dl.deadline_date;

      // Resolve caller org for tenant isolation
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser) throw new Error("Not authenticated");
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", currentUser.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { error } = await (supabase as any)
        .from("wage_payment_deadlines")
        .update({
          actual_payment_date,
          status: isPastDeadline ? "paid_late" : "compliant",
          penalty_applicable: isPastDeadline,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wage-payment-deadlines"] });
      toast.success("Payment date recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
