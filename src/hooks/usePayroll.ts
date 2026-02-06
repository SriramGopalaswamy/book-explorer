import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface PayrollRecord {
  id: string;
  user_id: string;
  profile_id: string | null;
  pay_period: string;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  other_allowances: number;
  pf_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  net_pay: number;
  status: string;
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined from profiles
  profiles?: {
    full_name: string | null;
    email: string | null;
    department: string | null;
    job_title: string | null;
  } | null;
}

export interface CreatePayrollData {
  profile_id: string;
  pay_period: string;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  other_allowances: number;
  pf_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  net_pay: number;
  status?: string;
  notes?: string;
}

export interface UpdatePayrollData extends Partial<CreatePayrollData> {
  id: string;
}

export function usePayrollRecords(payPeriod?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["payroll", user?.id, payPeriod],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from("payroll_records")
        .select("*, profiles(full_name, email, department, job_title)")
        .order("created_at", { ascending: false });

      if (payPeriod) {
        query = query.eq("pay_period", payPeriod);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PayrollRecord[];
    },
    enabled: !!user,
  });
}

export function usePayrollStats(payPeriod?: string) {
  const { data: records = [] } = usePayrollRecords(payPeriod);

  return {
    totalPayroll: records.reduce((sum, r) => sum + Number(r.net_pay), 0),
    totalEmployees: records.length,
    processed: records.filter((r) => r.status === "processed").length,
    pending: records.filter((r) => r.status === "pending" || r.status === "draft").length,
    totalBasic: records.reduce((sum, r) => sum + Number(r.basic_salary), 0),
    totalAllowances: records.reduce((sum, r) => sum + Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances), 0),
    totalDeductions: records.reduce((sum, r) => sum + Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions), 0),
  };
}

export function useCreatePayroll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreatePayrollData) => {
      if (!user) throw new Error("Not authenticated");

      // Get the profile to find their user_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", data.profile_id)
        .single();

      const { data: record, error } = await supabase
        .from("payroll_records")
        .insert({
          ...data,
          user_id: profile?.user_id || user.id,
        })
        .select("*, profiles(full_name, email, department, job_title)")
        .single();

      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Payroll Created", description: "Payroll record has been added." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdatePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdatePayrollData) => {
      const updateData: Record<string, unknown> = { ...data };
      if (data.status === "processed") {
        updateData.processed_at = new Date().toISOString();
      }

      const { data: record, error } = await supabase
        .from("payroll_records")
        .update(updateData)
        .eq("id", id)
        .select("*, profiles(full_name, email, department, job_title)")
        .single();

      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Payroll Updated", description: "Payroll record has been updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeletePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Payroll Deleted", description: "Payroll record has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useProcessPayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("payroll_records")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Payroll Processed", description: "Selected records have been marked as processed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
