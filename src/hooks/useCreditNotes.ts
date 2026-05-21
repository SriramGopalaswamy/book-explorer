import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface CreditNote {
  id: string;
  credit_note_number: string;
  client_name: string;
  customer_id: string | null;
  amount: number;
  reason: string | null;
  status: string;
  issue_date: string;
  created_at: string;
}

export interface CreditNoteCustomer {
  id: string;
  name: string;
}

export function useCreditNotes() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["credit-notes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("credit_notes")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditNote[];
    },
  });
}

export function useCreditNoteCustomers() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id,name")
        .eq("organization_id", orgId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as CreditNoteCustomer[];
    },
  });
}

export function useCreateCreditNote() {
  const { data: orgData } = useUserOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      customerId: string;
      customerName: string;
      amount: number;
      reason: string | null;
      issueDate: string;
      status: string;
    }) => {
      if (!orgData?.organizationId) throw new Error("Organization not found");
      const { error } = await supabase.from("credit_notes").insert({
        user_id: params.userId,
        organization_id: orgData.organizationId,
        credit_note_number: `CN-${Date.now().toString().slice(-6)}`,
        client_name: params.customerName,
        customer_id: params.customerId,
        amount: params.amount,
        reason: params.reason,
        issue_date: params.issueDate,
        status: params.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success("Credit Note Created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCreditNote() {
  const { data: orgData } = useUserOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      customerId: string;
      customerName: string;
      amount: number;
      reason: string | null;
      issueDate: string;
      status: string;
    }) => {
      if (!orgData?.organizationId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("credit_notes")
        .update({
          client_name: params.customerName,
          customer_id: params.customerId,
          amount: params.amount,
          reason: params.reason,
          issue_date: params.issueDate,
          status: params.status,
        })
        .eq("id", params.id)
        .eq("organization_id", orgData.organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["financial-data"] });
      toast.success("Credit Note Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCreditNoteStatus() {
  const { data: orgData } = useUserOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; status: string }) => {
      if (!orgData?.organizationId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("credit_notes")
        .update({ status: params.status })
        .eq("id", params.id)
        .eq("organization_id", orgData.organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["financial-data"] });
      toast.success("Status Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCreditNote() {
  const { data: orgData } = useUserOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgData?.organizationId) throw new Error("Organization not found");
      const orgId = orgData.organizationId;
      // GBC-91-sibling: An "applied" credit note has been offset against an
      // invoice (GL trigger has fired); an issued credit note may have
      // journal entries. Block both paths and direct the user to void instead.
      const [statusCheck, glCheck] = await Promise.all([
        supabase
          .from("credit_notes")
          .select("id")
          .eq("id", id)
          .eq("organization_id", orgId)
          .eq("status", "applied")
          .limit(1),
        supabase
          .from("journal_entries")
          .select("id")
          .eq("source_id", id)
          .eq("source_type", "credit_note")
          .eq("organization_id", orgId)
          .limit(1),
      ]);
      if ((statusCheck.data?.length ?? 0) > 0 || (glCheck.data?.length ?? 0) > 0) {
        throw new Error(
          "Cannot delete this credit note — it has been applied to an invoice or has journal entries. Void it instead.",
        );
      }
      const { data: deleted, error } = await supabase
        .from("credit_notes")
        .delete()
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("Credit note not found or could not be deleted.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["financial-data"] });
      toast.success("Credit Note Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
