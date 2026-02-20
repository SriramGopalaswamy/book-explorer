import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockPayrollRecords } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { createPayrollSchema } from "@/lib/validation-schemas";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

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
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["payroll", user?.id, payPeriod, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        if (payPeriod) return mockPayrollRecords.filter(r => r.pay_period === payPeriod);
        return mockPayrollRecords;
      }
      if (!user) return [];

      let query = supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name, email, department, job_title)")
        .order("created_at", { ascending: false });

      if (payPeriod) {
        query = query.eq("pay_period", payPeriod);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PayrollRecord[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useMyPayrollRecords() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-payroll", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name, email, department, job_title)")
        .eq("user_id", user.id)
        .order("pay_period", { ascending: false });

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

      const validated = createPayrollSchema.parse(data);

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", validated.profile_id)
        .single();

      const { data: record, error } = await supabase
        .from("payroll_records")
        .insert({
          profile_id: validated.profile_id,
          pay_period: validated.pay_period,
          basic_salary: validated.basic_salary,
          hra: validated.hra,
          transport_allowance: validated.transport_allowance,
          other_allowances: validated.other_allowances,
          pf_deduction: validated.pf_deduction,
          tax_deduction: validated.tax_deduction,
          other_deductions: validated.other_deductions,
          net_pay: validated.net_pay,
          status: validated.status ?? "draft",
          notes: validated.notes ?? null,
          user_id: profile?.user_id || user.id,
        })
        .select("*, profiles!profile_id(full_name, email, department, job_title)")
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
        .select("*, profiles!profile_id(full_name, email, department, job_title)")
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
      // Hard delete since deleted_at column doesn't exist in schema
      const { error } = await supabase
        .from("payroll_records")
        .delete()
        .eq("id", id);
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
      const { data, error } = await (supabase as any).rpc("process_payroll_batch", {
        p_payroll_ids: ids,
      });

      if (error) {
        if (error.message.includes("already processed")) {
          throw new Error(
            "Some payroll records have already been processed. Please refresh and try again."
          );
        } else if (error.message.includes("currently being processed")) {
          throw new Error(
            "Payroll is being processed by another user. Please wait and try again."
          );
        }
        throw error;
      }

      return data;
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
