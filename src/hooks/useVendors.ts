import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_number: string | null;
  contact_person: string | null;
  payment_terms: string | null;
  bank_account: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export type VendorForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  tax_number: string;
  contact_person: string;
  payment_terms: string;
  bank_account: string;
  notes: string;
};

export function useVendors() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  return useQuery({
    queryKey: ["vendors", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!user || !orgId) return [] as Vendor[];
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });
}

export function useActiveVendors() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  return useQuery({
    queryKey: ["vendors-active", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [] as { id: string; name: string }[];
      const { data } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

export function useCreateVendor() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: VendorForm) => {
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("vendors")
        .insert({ ...values, user_id: user.id, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Vendor Added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateVendor() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: VendorForm }) => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("vendors")
        .update(values)
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteVendor() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("Organization not found");
      // GBC-91: Preflight dependency checks.
      const [billCheck, poCheck, vcCheck, payCheck] = await Promise.all([
        supabase.from("bills").select("id").eq("vendor_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("purchase_orders").select("id").eq("vendor_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("vendor_credits").select("id").eq("vendor_id", id).eq("organization_id", orgId).limit(1),
        supabase.from("vendor_payments").select("id").eq("vendor_id", id).eq("organization_id", orgId).limit(1),
      ]);
      if (
        (billCheck.data?.length ?? 0) > 0 ||
        (poCheck.data?.length ?? 0) > 0 ||
        (vcCheck.data?.length ?? 0) > 0 ||
        (payCheck.data?.length ?? 0) > 0
      ) {
        throw new Error(
          "Cannot delete this vendor — they have linked bills, purchase orders, vendor credits, or payments. Mark them as inactive instead.",
        );
      }
      const { data: deleted, error } = await supabase
        .from("vendors")
        .delete()
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Vendor not found or could not be deleted.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Vendor Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleVendorStatus() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (!orgId) throw new Error("Organization not found");
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const { error } = await supabase
        .from("vendors")
        .update({ status: newStatus })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(`Vendor marked as ${newStatus}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
