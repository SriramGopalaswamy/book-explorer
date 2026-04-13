import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockPayrollRecords } from "@/lib/mock-data";
import { toast } from "sonner";
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
  lop_days: number;
  lop_deduction: number;
  working_days: number;
  paid_days: number;
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
    employee_id: string | null;
    join_date: string | null;
    employee_details?: {
      pan_number: string | null;
      bank_name: string | null;
      uan_number: string | null;
      gender: string | null;
      bank_account_number: string | null;
      bank_ifsc: string | null;
      employee_id_number: string | null;
    } | null;
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
  lop_days?: number;
  lop_deduction?: number;
  working_days?: number;
  paid_days?: number;
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["payroll", user?.id, payPeriod, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        if (payPeriod) return mockPayrollRecords.filter(r => r.pay_period === payPeriod);
        return mockPayrollRecords;
      }
      if (!user || !orgId) return [];

      let query = supabase
        .from("payroll_records")
        .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, employee_details(pan_number, bank_name, uan_number, gender, bank_account_number, bank_ifsc, employee_id_number))")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (payPeriod) query = query.eq("pay_period", payPeriod);

      const { data, error } = await query;
      if (error) throw error;
      return data as PayrollRecord[];
    },
    enabled: (!!user && !!orgId) || isDevMode,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // Reduced from 15s to 60s to save bandwidth
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
        .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, employee_details(pan_number, bank_name, uan_number, gender, bank_account_number, bank_ifsc, employee_id_number))")
        .eq("user_id", user.id)
        .order("pay_period", { ascending: false });

      if (error) throw error;
      return data as PayrollRecord[];
    },
    enabled: !!user,
  });
}

export function usePayrollStats(payPeriod?: string) {
  const { data: allRecords = [] } = usePayrollRecords(payPeriod);

  // Exclude superseded records from all stats
  const records = allRecords.filter((r) => r.status !== "superseded");

  return {
    totalPayroll: records.reduce((sum, r) => sum + Number(r.net_pay), 0),
    totalEmployees: records.length,
    processed: records.filter((r) => r.status === "locked" || r.status === "processed").length,
    pending: records.filter((r) => r.status === "under_review" || r.status === "approved" || r.status === "pending" || r.status === "draft").length,
    totalBasic: records.reduce((sum, r) => sum + Number(r.basic_salary), 0),
    totalAllowances: records.reduce((sum, r) => sum + Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances), 0),
    totalDeductions: records.reduce((sum, r) => sum + Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions) + (Number(r.lop_deduction) || 0), 0),
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
          lop_days: validated.lop_days ?? 0,
          lop_deduction: validated.lop_deduction ?? 0,
          working_days: validated.working_days ?? 0,
          paid_days: validated.paid_days ?? 0,
          net_pay: validated.net_pay,
          status: validated.status ?? "draft",
          notes: validated.notes ?? null,
          user_id: profile?.user_id || user.id,
        })
        .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, employee_details(pan_number, bank_name, uan_number, gender, bank_account_number, bank_ifsc, employee_id_number))")
        .single();

      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// ── Payroll lifecycle state-machine ──────────────────────────
const PAYROLL_TRANSITIONS: Record<string, string[]> = {
  draft: ["under_review", "cancelled"],
  under_review: ["approved", "draft", "cancelled"],
  approved: ["pending", "cancelled"],
  pending: ["processed"],
  processed: ["locked"],
  locked: [],      // terminal
  cancelled: [],   // terminal
  superseded: [],  // terminal
};
const PAYROLL_TERMINAL = ["locked", "cancelled", "superseded"];

export function useUpdatePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdatePayrollData) => {
      // ── State machine enforcement ──────────────────────────
      // Resolve caller's org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      if (data.status) {
        const { data: current, error: fetchErr } = await supabase
          .from("payroll_records")
          .select("status, organization_id")
          .eq("id", id)
          .eq("organization_id", callerOrgId)
          .single();
        if (fetchErr) throw fetchErr;
        if (!current) throw new Error("Payroll record not found in your organization.");
        const currentStatus = current?.status as string;

        if (PAYROLL_TERMINAL.includes(currentStatus)) {
          throw new Error(`Cannot modify a "${currentStatus}" payroll record.`);
        }

        const allowed = PAYROLL_TRANSITIONS[currentStatus];
        if (allowed && !allowed.includes(data.status)) {
          throw new Error(`Cannot transition payroll from "${currentStatus}" to "${data.status}".`);
        }
      }

      const updateData: Record<string, unknown> = { ...data };
      if (data.status === "processed") {
        updateData.processed_at = new Date().toISOString();
      }

      const { data: record, error } = await supabase
        .from("payroll_records")
        .update(updateData as any)
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .select("*, profiles!profile_id(full_name, email, department, job_title, employee_id, join_date, employee_details(pan_number, bank_name, uan_number, gender, bank_account_number, bank_ifsc, employee_id_number))")
        .single();

      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Resolve caller's org for tenant isolation
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      // ── Only draft/cancelled records can be deleted ────────
      const { data: check, error: checkErr } = await supabase
        .from("payroll_records")
        .select("status")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .single();
      if (checkErr) throw checkErr;
      const status = check?.status as string;
      if (status && !["draft", "cancelled"].includes(status)) {
        throw new Error(`Cannot delete a "${status}" payroll record. Only draft or cancelled records can be deleted.`);
      }

      const { error } = await supabase
        .from("payroll_records")
        .delete()
        .eq("id", id)
        .eq("organization_id", callerOrgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useProcessPayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Resolve caller's org — mirrors the server-side guard in process_payroll_batch RPC
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization context required");

      // Verify every supplied ID belongs to the caller's org before hitting the RPC
      const { data: ownerCheck, error: ownerErr } = await supabase
        .from("payroll_records")
        .select("id, organization_id")
        .in("id", ids);
      if (ownerErr) throw ownerErr;
      const crossTenant = (ownerCheck ?? []).filter(
        (r: { id: string; organization_id: string }) =>
          r.organization_id !== callerProfile.organization_id
      );
      if (crossTenant.length > 0) {
        throw new Error("Cannot process payroll records from another organization.");
      }

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

      // Check RPC-level errors
      if (data?.processed === 0 && data?.skipped > 0) {
        throw new Error("All selected records were already processed.");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
