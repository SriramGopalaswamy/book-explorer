import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { captureError } from "@/lib/monitoring";

export interface VendorCreditSummary {
  id: string;
  vendor_credit_number: string;
  issue_date: string;
  amount: number;
  remaining_amount: number;
  reason: string | null;
}

export interface VendorCreditsAvailable {
  total_available: number;
  credits: VendorCreditSummary[];
}

type GetVendorAvailableCreditsRpc = (
  fn: "get_vendor_available_credits",
  args: { p_vendor_id: string; p_org_id: string },
) => Promise<{ data: VendorCreditsAvailable | null; error: unknown }>;

type ApplyVendorCreditRpc = (
  fn: "apply_vendor_credit_to_bill",
  args: { p_credit_id: string; p_bill_id: string; p_amount: number; p_org_id: string },
) => Promise<{ data: unknown; error: unknown }>;

export function useVendorCreditsForVendor(vendorId?: string | null) {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["vendor-credits-available", orgId, vendorId],
    queryFn: async (): Promise<VendorCreditsAvailable | null> => {
      if (!orgId || !vendorId) return null;
      const { data, error } = await (supabase.rpc as unknown as GetVendorAvailableCreditsRpc)(
        "get_vendor_available_credits",
        { p_vendor_id: vendorId, p_org_id: orgId },
      );
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!orgId && !!vendorId,
    staleTime: 30_000,
  });
}

export function useApplyVendorCredit() {
  const { data: org } = useUserOrganization();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      creditId: string;
      billId: string;
      amount: number;
      vendorId: string;
    }) => {
      if (!org?.organizationId) throw new Error("Organization not found");
      if (!params.amount || params.amount <= 0) throw new Error("Amount must be positive");
      const { data, error } = await (supabase.rpc as unknown as ApplyVendorCreditRpc)(
        "apply_vendor_credit_to_bill",
        {
          p_credit_id: params.creditId,
          p_bill_id: params.billId,
          p_amount: params.amount,
          p_org_id: org.organizationId,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["vendor-credits-available"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["vendor-credit-applications", variables.billId] });
      toast.success("Vendor credit applied successfully");
    },
    onError: (err: Error) => {
      captureError(err, { context: "useApplyVendorCredit" });
      toast.error(err.message || "Failed to apply vendor credit");
    },
  });
}

export function useVendorCreditApplications(billId?: string) {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;

  return useQuery({
    queryKey: ["vendor-credit-applications", billId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_credit_applications")
        .select("id, applied_amount, applied_at: created_at, vendor_credits(vendor_credit_number, amount)")
        .eq("organization_id", orgId!)
        .eq("bill_id", billId!);
      if (error) throw error;
      return ((data || []) as unknown) as {
        id: string;
        applied_amount: number;
        applied_at: string;
        vendor_credits: { vendor_credit_number: string; amount: number } | null;
      }[];
    },
    enabled: !!user && !!orgId && !!billId,
  });
}
