import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface ApprovalWorkflow {
  id: string;
  organization_id: string;
  workflow_type: string;
  threshold_amount: number;
  required_role: string;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalWorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  required_role: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  organization_id: string;
  workflow_id: string | null;
  document_type: string;
  document_id: string;
  document_number: string | null;
  document_amount: number | null;
  requested_by: string;
  requested_at: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  current_step: number;
  total_steps: number;
  created_at: string;
  updated_at: string;
}

export function useApprovalWorkflows() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["approval-workflows", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("approval_workflows").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ApprovalWorkflow[];
    },
    enabled: !!orgId,
  });
}

export function useApprovalWorkflowSteps(workflowIds: string[]) {
  return useQuery({
    queryKey: ["approval-workflow-steps", workflowIds],
    queryFn: async () => {
      if (workflowIds.length === 0) return [];
      const { data, error } = await supabase
        .from("approval_workflow_steps" as any)
        .select("*")
        .in("workflow_id", workflowIds)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ApprovalWorkflowStep[];
    },
    enabled: workflowIds.length > 0,
  });
}

export function useCreateApprovalWorkflow() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  return useMutation({
    mutationFn: async (w: { workflow_type: string; threshold_amount: number; steps: { role: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!org?.organizationId) throw new Error("Organization context not available");
      if (!w.workflow_type?.trim()) throw new Error("Workflow type is required.");
      if (w.threshold_amount < 0) throw new Error("Threshold amount cannot be negative.");
      if (!w.steps || w.steps.length === 0) throw new Error("At least one approval step is required.");

      const VALID_TYPES = ["invoice", "bill", "expense", "purchase_order", "payroll", "leave", "compensation", "sales_order", "reimbursement"];
      if (!VALID_TYPES.includes(w.workflow_type)) {
        throw new Error(`Invalid workflow type. Must be one of: ${VALID_TYPES.join(", ")}`);
      }

      // Prevent duplicate active workflows for same type within this org
      const { data: existing } = await supabase
        .from("approval_workflows")
        .select("id")
        .eq("workflow_type", w.workflow_type)
        .eq("organization_id", org!.organizationId)
        .eq("is_active", true)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new Error(`An active approval workflow for "${w.workflow_type}" already exists. Deactivate it first.`);
      }

      // Create the workflow with first step's role as required_role (backward compat)
      const { data: wfData, error: wfErr } = await supabase.from("approval_workflows").insert([{
        organization_id: org!.organizationId,
        workflow_type: w.workflow_type,
        threshold_amount: w.threshold_amount,
        required_role: w.steps[0].role,
      }] as any).select("id").single();
      if (wfErr) throw wfErr;

      const workflowId = (wfData as any).id;

      // Insert chain steps
      if (w.steps.length > 0) {
        const stepRows = w.steps.map((s, i) => ({
          workflow_id: workflowId,
          step_order: i + 1,
          required_role: s.role,
        }));
        const { error: stepErr } = await supabase
          .from("approval_workflow_steps" as any)
          .insert(stepRows as any);
        if (stepErr) {
          // Rollback: delete the workflow
          await supabase.from("approval_workflows").delete().eq("id", workflowId);
          throw stepErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-workflows"] });
      qc.invalidateQueries({ queryKey: ["approval-workflow-steps"] });
      toast.success("Workflow created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      if (!profile?.organization_id) throw new Error("Organization not found");
      const { error } = await supabase.from("approval_workflows").update({ is_active }).eq("id", id).eq("organization_id", profile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-workflows"] }); toast.success("Workflow updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useApprovalRequests() {
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["approval-requests", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("approval_requests" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ApprovalRequest[];
    },
    enabled: !!orgId,
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Double-review guard
      const { data: current, error: fetchErr } = await supabase
        .from("approval_requests" as any)
        .select("status, document_type, document_id, requested_by, current_step, total_steps, workflow_id")
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id)
        .single();
      if (fetchErr) throw fetchErr;
      if ((current as any)?.status !== "pending") {
        throw new Error("This request has already been reviewed.");
      }

      // Maker-checker
      if ((current as any)?.requested_by === user.id) {
        throw new Error("You cannot approve your own request.");
      }

      const currentStep = (current as any)?.current_step || 1;
      const totalSteps = (current as any)?.total_steps || 1;

      if (currentStep < totalSteps) {
        // Advance to next step — not fully approved yet
        const { error } = await supabase.from("approval_requests" as any).update({
          current_step: currentStep + 1,
          notes: `Step ${currentStep} approved by ${user.id} at ${new Date().toISOString()}. ${(current as any)?.notes || ""}`.trim(),
          updated_at: new Date().toISOString(),
        } as any).eq("id", id).eq("organization_id", callerProfile.organization_id);
        if (error) throw error;

        return { advanced: true, currentStep, totalSteps };
      }

      // Final step — fully approve
      const { error } = await supabase.from("approval_requests" as any).update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", id).eq("organization_id", callerProfile.organization_id);
      if (error) throw error;

      // Auto-execute: propagate approval back to source document
      const docType = (current as any)?.document_type;
      const docId = (current as any)?.document_id;
      if (docType && docId) {
        const tableMap: Record<string, string> = {
          invoice: "invoices",
          bill: "bills",
          expense: "expenses",
          purchase_order: "purchase_orders",
        };
        const statusMap: Record<string, string> = {
          invoice: "sent",
          bill: "Received",
          expense: "approved",
          purchase_order: "approved",
        };
        const table = tableMap[docType];
        const newStatus = statusMap[docType];
        if (table && newStatus) {
          await supabase.from(table as any).update({ status: newStatus } as any).eq("id", docId).eq("organization_id", callerProfile.organization_id);
        }
      }

      return { advanced: false, currentStep, totalSteps };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      if (result?.advanced) {
        toast.success(`Step ${result.currentStep} approved — awaiting next approver (step ${result.currentStep + 1} of ${result.totalSteps})`);
      } else {
        toast.success("Request fully approved — document status updated");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!reason?.trim()) throw new Error("A rejection reason is required.");

      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Double-review guard
      const { data: current, error: fetchErr } = await supabase
        .from("approval_requests" as any)
        .select("status, requested_by")
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id)
        .single();
      if (fetchErr) throw fetchErr;
      if ((current as any)?.status !== "pending") {
        throw new Error("This request has already been reviewed.");
      }

      // Maker-checker
      if ((current as any)?.requested_by === user.id) {
        throw new Error("You cannot reject your own request.");
      }

      const { error } = await supabase.from("approval_requests" as any).update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", id).eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-requests"] }); toast.success("Request rejected"); },
    onError: (e: any) => toast.error(e.message),
  });
}
