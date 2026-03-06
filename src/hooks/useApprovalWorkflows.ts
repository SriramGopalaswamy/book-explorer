import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  return useMutation({
    mutationFn: async (w: { workflow_type: string; threshold_amount: number; required_role: string }) => {
      const { error } = await supabase.from("approval_workflows").insert({
        workflow_type: w.workflow_type,
        threshold_amount: w.threshold_amount,
        required_role: w.required_role,
      });
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
      const { error } = await supabase.from("approval_requests" as any).update({
        status: "approved",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-requests"] }); toast.success("Request approved"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("approval_requests" as any).update({
        status: "rejected",
        rejected_by: user?.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approval-requests"] }); toast.success("Request rejected"); },
    onError: (e: any) => toast.error(e.message),
  });
}
