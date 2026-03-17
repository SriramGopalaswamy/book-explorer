/**
 * Approval Gate — checks if a document mutation requires approval
 * before allowing a status transition.
 *
 * Usage:
 *   const gate = await checkApprovalGate("invoice", amount);
 *   if (gate.requiresApproval) { createApprovalRequest(...); return; }
 *   // else proceed with direct status change
 */
import { supabase } from "@/integrations/supabase/client";

interface ApprovalGateResult {
  requiresApproval: boolean;
  workflowId: string | null;
  requiredRole: string | null;
  thresholdAmount: number | null;
}

export async function checkApprovalGate(
  documentType: string,
  amount: number
): Promise<ApprovalGateResult> {
  const { data: workflows } = await supabase
    .from("approval_workflows")
    .select("id, threshold_amount, required_role, is_active")
    .eq("workflow_type", documentType)
    .eq("is_active", true)
    .order("threshold_amount", { ascending: false })
    .limit(1);

  if (!workflows || workflows.length === 0) {
    return { requiresApproval: false, workflowId: null, requiredRole: null, thresholdAmount: null, totalSteps: 1 };
  }

  const wf = workflows[0];
  if (amount >= wf.threshold_amount) {
    // Count chain steps
    const { data: steps } = await supabase
      .from("approval_workflow_steps" as any)
      .select("id")
      .eq("workflow_id", wf.id);
    const totalSteps = steps && steps.length > 0 ? steps.length : 1;

    return {
      requiresApproval: true,
      workflowId: wf.id,
      requiredRole: wf.required_role,
      thresholdAmount: wf.threshold_amount,
      totalSteps,
    };
  }

  return { requiresApproval: false, workflowId: null, requiredRole: null, thresholdAmount: null, totalSteps: 1 };
}

export async function createApprovalRequest(params: {
  workflowId: string;
  documentType: string;
  documentId: string;
  documentNumber: string | null;
  documentAmount: number | null;
  requestedBy: string;
  notes?: string;
}): Promise<void> {
  // Prevent duplicate pending requests for the same document
  const { data: existing } = await supabase
    .from("approval_requests" as any)
    .select("id")
    .eq("document_id", params.documentId)
    .eq("document_type", params.documentType)
    .eq("status", "pending")
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error("An approval request for this document is already pending.");
  }

  const { error } = await supabase.from("approval_requests" as any).insert({
    workflow_id: params.workflowId,
    document_type: params.documentType,
    document_id: params.documentId,
    document_number: params.documentNumber,
    document_amount: params.documentAmount,
    requested_by: params.requestedBy,
    status: "pending",
    notes: params.notes || null,
  } as any);
  if (error) throw error;
}
