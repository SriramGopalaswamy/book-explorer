import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PayslipDispute {
  id: string;
  payroll_record_id: string;
  profile_id: string;
  organization_id: string;
  pay_period: string;
  dispute_category: string;
  description: string;
  status: string;
  manager_reviewed_at: string | null;
  manager_reviewed_by: string | null;
  manager_notes: string | null;
  hr_reviewed_at: string | null;
  hr_reviewed_by: string | null;
  hr_notes: string | null;
  finance_reviewed_at: string | null;
  finance_reviewed_by: string | null;
  finance_notes: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  revised_payroll_record_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  profiles?: { full_name: string | null; email: string | null; department: string | null } | null;
}

const DISPUTE_CATEGORIES = [
  { value: "salary_mismatch", label: "Salary Mismatch" },
  { value: "deduction_error", label: "Incorrect Deduction" },
  { value: "allowance_missing", label: "Missing Allowance" },
  { value: "tax_error", label: "Tax Calculation Error" },
  { value: "ot_missing", label: "Overtime Not Reflected" },
  { value: "other", label: "Other" },
] as const;

export { DISPUTE_CATEGORIES };

/** Employee: view my own disputes */
export function useMyPayslipDisputes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-payslip-disputes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return [];

      const { data, error } = await supabase
        .from("payslip_disputes" as any)
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PayslipDispute[];
    },
    enabled: !!user,
  });
}

/** Employee: raise a dispute */
export function useRaisePayslipDispute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      payroll_record_id: string;
      pay_period: string;
      dispute_category: string;
      description: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      // Fetch the user's organization_id (required by RLS)
      const { data: orgData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", profile.id)
        .single();
      if (!orgData?.organization_id) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("payslip_disputes" as any)
        .insert({
          payroll_record_id: input.payroll_record_id,
          profile_id: profile.id,
          organization_id: orgData.organization_id,
          pay_period: input.pay_period,
          dispute_category: input.dispute_category,
          description: input.description,
          status: "pending_manager",
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-payslip-disputes"] });
      toast.success("Payslip dispute raised successfully. Your manager will review it.");
    },
    onError: (err: any) => toast.error("Failed to raise dispute: " + err.message),
  });
}

/** Manager/HR/Finance: get pending disputes for review */
export function usePendingPayslipDisputes(role: "manager" | "hr" | "finance") {
  const { user } = useAuth();
  const statusMap = {
    manager: "pending_manager",
    hr: "pending_hr",
    finance: "pending_finance",
  };

  return useQuery({
    queryKey: ["payslip-disputes-pending", role, user?.id],
    queryFn: async () => {
      if (!user) return [];

      // For manager role, only fetch disputes from direct reports (exclude own)
      if (role === "manager") {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (!myProfile) return [];

        const { data: reports } = await supabase
          .from("profiles")
          .select("id")
          .eq("manager_id", myProfile.id);
        const reportIds = (reports || []).map((r) => r.id);
        if (reportIds.length === 0) return [];

        const { data, error } = await supabase
          .from("payslip_disputes" as any)
          .select("*, profiles:profile_id(full_name, email, department)")
          .eq("status", statusMap[role])
          .in("profile_id", reportIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data || []) as unknown as PayslipDispute[];
      }

      // HR/Finance: fetch all disputes with the relevant status
      const { data, error } = await supabase
        .from("payslip_disputes" as any)
        .select("*, profiles:profile_id(full_name, email, department)")
        .eq("status", statusMap[role])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PayslipDispute[];
    },
    enabled: !!user,
  });
}

/** Manager: forward to HR or reject */
export function useManagerReviewDispute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ disputeId, action, notes }: { disputeId: string; action: "forward" | "reject"; notes?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const update: any = {
        manager_reviewed_at: new Date().toISOString(),
        manager_reviewed_by: user.id,
        manager_notes: notes || null,
        updated_at: new Date().toISOString(),
      };
      if (action === "forward") {
        update.status = "pending_hr";
      } else {
        update.status = "rejected";
        update.resolved_at = new Date().toISOString();
        update.resolution_notes = notes || "Rejected by manager";
      }
      const { error } = await supabase
        .from("payslip_disputes" as any)
        .update(update)
        .eq("id", disputeId);
      if (error) throw error;
      return { disputeId, action, notes };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payslip-disputes-pending"] });
      queryClient.invalidateQueries({ queryKey: ["my-payslip-disputes"] });
      toast.success(result.action === "forward" ? "Dispute forwarded to HR" : "Dispute rejected");

      // Send notification & email
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "payslip_dispute_reviewed",
          payload: {
            dispute_id: result.disputeId,
            decision: result.action === "forward" ? "forwarded_to_hr" : "rejected",
            reviewer_name: user?.user_metadata?.full_name ?? user?.email ?? "Manager",
            reviewer_notes: result.notes || null,
          },
        },
      }).catch((err) => console.warn("Failed to send dispute review notification:", err));
    },
    onError: (err: any) => toast.error(err.message),
  });
}

/** HR: forward to Finance or reject */
export function useHRReviewDispute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ disputeId, action, notes }: { disputeId: string; action: "forward" | "reject"; notes?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const update: any = {
        hr_reviewed_at: new Date().toISOString(),
        hr_reviewed_by: user.id,
        hr_notes: notes || null,
        updated_at: new Date().toISOString(),
      };
      if (action === "forward") {
        update.status = "pending_finance";
      } else {
        update.status = "rejected";
        update.resolved_at = new Date().toISOString();
        update.resolution_notes = notes || "Rejected by HR";
      }
      const { error } = await supabase
        .from("payslip_disputes" as any)
        .update(update)
        .eq("id", disputeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payslip-disputes-pending"] });
      toast.success("Dispute reviewed successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

/** Finance: approve (enable payslip revision) or reject */
export function useFinanceReviewDispute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ disputeId, action, notes }: { disputeId: string; action: "approve" | "reject"; notes?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const update: any = {
        finance_reviewed_at: new Date().toISOString(),
        finance_reviewed_by: user.id,
        finance_notes: notes || null,
        updated_at: new Date().toISOString(),
      };
      if (action === "approve") {
        update.status = "approved";
        update.resolved_at = new Date().toISOString();
        update.resolution_notes = notes || "Approved by Finance — payslip revision enabled";
      } else {
        update.status = "rejected";
        update.resolved_at = new Date().toISOString();
        update.resolution_notes = notes || "Rejected by Finance";
      }
      const { error } = await supabase
        .from("payslip_disputes" as any)
        .update(update)
        .eq("id", disputeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payslip-disputes-pending"] });
      toast.success("Dispute reviewed successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

/** Check if a payslip dispute is approved (enables editing) for a given payroll record */
export function useHasApprovedDispute(payrollRecordId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["approved-dispute", payrollRecordId],
    queryFn: async () => {
      if (!payrollRecordId) return false;
      const { data, error } = await supabase
        .from("payslip_disputes" as any)
        .select("id")
        .eq("payroll_record_id", payrollRecordId)
        .eq("status", "approved")
        .is("revised_payroll_record_id", null)
        .limit(1);
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user && !!payrollRecordId,
  });
}
