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
  created_at: string;
  updated_at: string;
}

export function useApprovalWorkflows() {
  return useQuery({
    queryKey: ["approval-workflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("approval_workflows").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ApprovalWorkflow[];
    },
  });
}

export function useCreateApprovalWorkflow() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (w: { workflow_type: string; threshold_amount: number; required_role: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!w.workflow_type?.trim()) throw new Error("Workflow type is required.");
      if (w.threshold_amount < 0) throw new Error("Threshold amount cannot be negative.");
      if (!w.required_role?.trim()) throw new Error("Required role is required.");

      const VALID_TYPES = ["invoice", "bill", "expense", "purchase_order", "payroll", "leave", "compensation"];
      if (!VALID_TYPES.includes(w.workflow_type)) {
        throw new Error(`Invalid workflow type. Must be one of: ${VALID_TYPES.join(", ")}`);
      }

      // Prevent duplicate active workflows for same type
      const { data: existing } = await supabase
        .from("approval_workflows")
        .select("id")
        .eq("workflow_type", w.workflow_type)
        .eq("is_active", true)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new Error(`An active approval workflow for "${w.workflow_type}" already exists. Deactivate it first.`);
      }

      const { error } = await supabase.from("approval_workflows").insert([{
        workflow_type: w.workflow_type,
        threshold_amount: w.threshold_amount,
        required_role: w.required_role,
      }] as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-workflows"] }); toast.success("Workflow created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("approval_workflows").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-workflows"] }); toast.success("Workflow updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useApprovalRequests() {
  return useQuery({
    queryKey: ["approval-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("approval_requests" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ApprovalRequest[];
    },
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Double-review guard: verify request is still pending
      const { data: current, error: fetchErr } = await supabase
        .from("approval_requests" as any)
        .select("status, document_type, document_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if ((current as any)?.status !== "pending") {
        throw new Error("This request has already been reviewed.");
      }

      const { error } = await supabase.from("approval_requests" as any).update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;

      // ── Auto-execute: propagate approval back to source document ──
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
          await supabase.from(table as any).update({ status: newStatus } as any).eq("id", docId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Request approved — document status updated");
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

      // Double-review guard
      const { data: current, error: fetchErr } = await supabase
        .from("approval_requests" as any)
        .select("status")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if ((current as any)?.status !== "pending") {
        throw new Error("This request has already been reviewed.");
      }

      const { error } = await supabase.from("approval_requests" as any).update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-requests"] }); toast.success("Request rejected"); },
    onError: (e: any) => toast.error(e.message),
  });
}
