import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_number: string | null;
  contact_person: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  tax_number: string;
  contact_person: string;
  notes: string;
};

export function useCustomers() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  return useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [] as Customer[];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
}

export function useCreateCustomer() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: CustomerForm) => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("customers")
        .insert({ ...values, user_id: user.id, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Customer Added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCustomer() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CustomerForm }) => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("customers")
        .update(values)
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;

      // Propagate updated GSTIN to all draft invoices for this customer
      if (values.tax_number !== undefined) {
        await supabase
          .from("invoices")
          .update({ customer_gstin: values.tax_number || null } as any)
          .eq("customer_id", id)
          .eq("organization_id", orgId)
          .eq("status", "draft");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success("Customer Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCustomer() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      // Check for linked invoices, credit notes, or quotes before deleting
      const [invoiceCheck, creditNoteCheck, quoteCheck] = await Promise.all([
        supabase.from("invoices").select("id").eq("customer_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("credit_notes").select("id").eq("customer_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("quotes").select("id").eq("customer_id", id).eq("organization_id", orgId).limit(1),
      ]);
      if (
        (invoiceCheck.data?.length ?? 0) > 0 ||
        (creditNoteCheck.data?.length ?? 0) > 0 ||
        (quoteCheck.data?.length ?? 0) > 0
      ) {
        throw new Error(
          "Cannot delete this customer because they have linked invoices, quotes, or credit notes. Mark them as inactive instead.",
        );
      }
      // Delete AI profile if exists (no user-facing data — failure is non-critical)
      await supabase.from("ai_customer_profiles").delete().eq("customer_id", id);
      const { data: deleted, error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Customer not found or could not be deleted.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Customer Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleCustomerStatus() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (!orgId) throw new Error("Organization not found");
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const { error } = await supabase
        .from("customers")
        .update({ status: newStatus })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Customer marked as ${newStatus}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
