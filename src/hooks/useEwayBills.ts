import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { isValidGSTIN, isValidHSN } from "@/hooks/useGSTReconciliation";

// ── Vehicle number: AA00AA0000 format ──
const VEHICLE_REGEX = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/;
// ── Pincode: 6 digits ──
const PINCODE_REGEX = /^\d{6}$/;

// ── Distance-based validity (Rule 138) ──
function getEwayValidityDays(distanceKm: number): number {
  if (distanceKm <= 200) return 1;
  return 1 + Math.ceil((distanceKm - 200) / 200);
}

export interface EwayBill {
  id: string;
  organization_id: string;
  user_id: string;
  eway_bill_number: string | null;
  eway_bill_date: string | null;
  valid_until: string | null;
  status: string;
  supply_type: string;
  sub_supply_type: string | null;
  document_type: string | null;
  document_number: string | null;
  document_date: string | null;
  from_gstin: string | null;
  from_name: string | null;
  from_address: string | null;
  from_place: string | null;
  from_state_code: string | null;
  from_pincode: string | null;
  to_gstin: string | null;
  to_name: string | null;
  to_address: string | null;
  to_place: string | null;
  to_state_code: string | null;
  to_pincode: string | null;
  hsn_code: string | null;
  product_name: string | null;
  product_description: string | null;
  quantity: number;
  unit: string;
  taxable_value: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cess_rate: number;
  total_value: number;
  transporter_id: string | null;
  transporter_name: string | null;
  transport_mode: string | null;
  transport_doc_number: string | null;
  transport_doc_date: string | null;
  vehicle_number: string | null;
  vehicle_type: string | null;
  invoice_id: string | null;
  delivery_note_id: string | null;
  sales_order_id: string | null;
  distance_km: number;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  extended_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EwayBillInsert = Partial<EwayBill> & {
  supply_type: string;
  taxable_value: number;
  total_value: number;
};

/** Validates e-way bill data before creation/update */
function validateEwayBill(bill: EwayBillInsert): string | null {
  if (bill.total_value < 50000) {
    console.warn(`E-Way Bill created below ₹50,000 threshold (₹${bill.total_value}). Not mandatory per Rule 138.`);
  }
  if (bill.from_gstin && !isValidGSTIN(bill.from_gstin)) return "Invalid consignor GSTIN format.";
  if (bill.to_gstin && !isValidGSTIN(bill.to_gstin)) return "Invalid consignee GSTIN format.";
  if (bill.from_pincode && !PINCODE_REGEX.test(bill.from_pincode)) return "Origin Pincode must be 6 digits.";
  if (bill.to_pincode && !PINCODE_REGEX.test(bill.to_pincode)) return "Destination Pincode must be 6 digits.";
  if (bill.vehicle_number && !VEHICLE_REGEX.test(bill.vehicle_number.replace(/\s/g, "").toUpperCase())) {
    return "Vehicle number format invalid. Expected: AA00AA0000.";
  }
  if (bill.hsn_code && !isValidHSN(bill.hsn_code)) return "HSN code must be 4, 6, or 8 digits.";
  if (bill.distance_km !== undefined && bill.distance_km < 0) return "Distance cannot be negative.";

  // Inter-state / intra-state tax consistency
  if (bill.from_state_code && bill.to_state_code) {
    const isInterState = bill.from_state_code !== bill.to_state_code;
    if (isInterState && ((bill.cgst_rate || 0) > 0 || (bill.sgst_rate || 0) > 0)) {
      return "Inter-state supply should use IGST, not CGST/SGST.";
    }
    if (!isInterState && (bill.igst_rate || 0) > 0) {
      return "Intra-state supply should use CGST/SGST, not IGST.";
    }
  }

  return null;
}

export function useEwayBills() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["eway_bills", orgId],
    queryFn: async () => {
      if (!orgId) return [] as EwayBill[];
      const { data, error } = await (supabase as any).from("eway_bills").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as EwayBill[];
    },
    enabled: !!user && !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (bill: EwayBillInsert) => {
      const validationError = validateEwayBill(bill);
      if (validationError) throw new Error(validationError);

      // Normalize vehicle number
      if (bill.vehicle_number) {
        bill.vehicle_number = bill.vehicle_number.replace(/\s/g, "").toUpperCase();
      }

      // Auto-calculate validity based on distance
      const validityDays = getEwayValidityDays(bill.distance_km || 0);

      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .insert({ ...bill, user_id: user!.id, organization_id: orgId })
        .select()
        .single();
      if (error) throw error;

      // Log validity guidance
      if (bill.distance_km) {
        console.info(`E-Way Bill validity: ${validityDays} day(s) for ${bill.distance_km} km distance`);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eway_bills"] });
      toast.success("E-Way Bill created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EwayBill> & { id: string }) => {
      if (!user) throw new Error("Not authenticated");
      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");
      const callerOrgId = callerProfile.organization_id;

      // Validate vehicle number if being updated
      if (updates.vehicle_number) {
        updates.vehicle_number = updates.vehicle_number.replace(/\s/g, "").toUpperCase();
        if (!VEHICLE_REGEX.test(updates.vehicle_number)) {
          throw new Error("Vehicle number format invalid. Expected: AA00AA0000.");
        }
      }

      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eway_bills"] });
      toast.success("E-Way Bill updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!user) throw new Error("Not authenticated");
      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");
      const callerOrgId = callerProfile.organization_id;

      // Enforce 24-hour cancellation window
      const { data: existing } = await (supabase as any)
        .from("eway_bills")
        .select("eway_bill_date, status")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .single();

      if (existing?.status === "cancelled") throw new Error("E-Way Bill is already cancelled.");
      if (existing?.eway_bill_date) {
        const billDate = new Date(existing.eway_bill_date).getTime();
        const hoursSince = (Date.now() - billDate) / (1000 * 60 * 60);
        if (hoursSince > 24) {
          throw new Error("E-Way Bill cancellation window expired (24 hours from generation).");
        }
      }

      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .update({
          status: "cancelled",
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eway_bills"] });
      toast.success("E-Way Bill cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");
      const { error } = await (supabase as any)
        .from("eway_bills")
        .delete()
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eway_bills"] });
      toast.success("E-Way Bill deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    ewayBills: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    cancel: cancelMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    getValidityDays: getEwayValidityDays,
  };
}
