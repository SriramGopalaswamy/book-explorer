import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";
import { isValidGSTIN, isValidHSN } from "@/hooks/useGSTReconciliation";

// ── Pincode validation (6 digits, Indian) ──
const PINCODE_REGEX = /^\d{6}$/;
// ── State codes 01-38 ──
const isValidStateCode = (code: string) => {
  const n = parseInt(code, 10);
  return !isNaN(n) && n >= 1 && n <= 38 && code.length === 2;
};

export interface EInvoiceItem {
  sl_no: number;
  product_description: string;
  is_service: boolean;
  hsn_code: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  discount: number;
  assessable_value: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  total_item_value: number;
}

export interface EInvoice {
  id: string;
  organization_id: string;
  user_id: string;
  invoice_id: string | null;
  irn: string | null;
  irn_generated_at: string | null;
  ack_number: string | null;
  ack_date: string | null;
  signed_qr_code: string | null;
  status: string;
  doc_type: string;
  doc_number: string;
  doc_date: string;
  supply_type: string;
  seller_gstin: string;
  seller_legal_name: string;
  seller_trade_name: string | null;
  seller_address: string | null;
  seller_location: string | null;
  seller_pincode: string | null;
  seller_state_code: string | null;
  buyer_gstin: string | null;
  buyer_legal_name: string;
  buyer_trade_name: string | null;
  buyer_address: string | null;
  buyer_location: string | null;
  buyer_pincode: string | null;
  buyer_state_code: string | null;
  buyer_pos: string | null;
  total_assessable_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_cess: number;
  total_discount: number;
  total_other_charges: number;
  total_invoice_value: number;
  items: EInvoiceItem[];
  eway_bill_number: string | null;
  created_at: string;
  updated_at: string;
}

export type EInvoiceInsert = Partial<EInvoice> & {
  doc_number: string;
  doc_date: string;
  seller_gstin: string;
  seller_legal_name: string;
  buyer_legal_name: string;
  total_invoice_value: number;
};

/** Validates e-invoice data before submission */
function validateEInvoice(einv: EInvoiceInsert): string | null {
  if (!isValidGSTIN(einv.seller_gstin)) return "Invalid Seller GSTIN format. Must be 15 characters (e.g., 29ABCDE1234F1Z5).";
  if (einv.buyer_gstin && !isValidGSTIN(einv.buyer_gstin)) return "Invalid Buyer GSTIN format.";
  if (!einv.seller_pincode || !PINCODE_REGEX.test(einv.seller_pincode)) return "Seller Pincode is required and must be 6 digits.";
  if (!einv.buyer_pincode || !PINCODE_REGEX.test(einv.buyer_pincode)) return "Buyer Pincode is required and must be 6 digits.";
  if (!einv.seller_state_code || !isValidStateCode(einv.seller_state_code)) return "Seller State is required.";
  if (!einv.buyer_state_code || !isValidStateCode(einv.buyer_state_code)) return "Buyer State / Place of Supply is required.";
  if (einv.total_invoice_value <= 0) return "Invoice value must be greater than zero.";

  // HSN validation on items
  if (einv.items && einv.items.length > 0) {
    for (const item of einv.items) {
      if (!isValidHSN(item.hsn_code)) return `Invalid HSN code "${item.hsn_code}" for "${item.product_description}". Must be 4, 6, or 8 digits.`;
      if (item.quantity <= 0) return `Quantity must be > 0 for "${item.product_description}".`;
    }
  }

  // Inter-state / intra-state tax consistency
  if (einv.seller_state_code && einv.buyer_state_code) {
    const isInterState = einv.seller_state_code !== einv.buyer_state_code;
    if (isInterState && ((einv.total_cgst || 0) > 0 || (einv.total_sgst || 0) > 0)) {
      return "Inter-state supply should use IGST, not CGST/SGST.";
    }
    if (!isInterState && (einv.total_igst || 0) > 0) {
      return "Intra-state supply should use CGST/SGST, not IGST.";
    }
  }

  return null;
}

export function useEInvoices() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["e_invoices", orgId],
    queryFn: async () => {
      if (!orgId) return [] as EInvoice[];
      const { data, error } = await (supabase as any).from("e_invoices").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as EInvoice[];
    },
    enabled: !!user && !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (einv: EInvoiceInsert) => {
      const validationError = validateEInvoice(einv);
      if (validationError) throw new Error(validationError);

      const { data, error } = await (supabase as any)
        .from("e_invoices")
        .insert({ ...einv, user_id: user!.id, organization_id: orgId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["e_invoices"] });
      toast.success("E-Invoice created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateIRN = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      // Simulate IRN generation (in production, this would call the NIC API via edge function)
      const irn = `IRN${Date.now()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const ackNo = `1${Date.now()}`;
      const qrData = JSON.stringify({ irn, ackNo, docNo: id, ts: new Date().toISOString() });
      
      const { data, error } = await (supabase as any)
        .from("e_invoices")
        .update({
          status: "generated",
          irn,
          irn_generated_at: new Date().toISOString(),
          ack_number: ackNo,
          ack_date: new Date().toISOString(),
          signed_qr_code: btoa(qrData),
        })
        .eq("id", id)
        .eq("organization_id", callerProfile.organization_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["e_invoices"] });
      toast.success("IRN generated successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelEInvoice = useMutation({
    mutationFn: async ({ id, reason, remark }: { id: string; reason: string; remark?: string }) => {
      if (!user) throw new Error("Not authenticated");
      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");
      const callerOrgId = callerProfile.organization_id;

      // Enforce 24-hour cancellation window (Rule 48(4))
      const { data: existing } = await (supabase as any)
        .from("e_invoices")
        .select("irn_generated_at, status")
        .eq("id", id)
        .eq("organization_id", callerOrgId)
        .single();

      if (existing?.status === "cancelled") throw new Error("E-Invoice is already cancelled.");
      if (existing?.irn_generated_at) {
        const generatedAt = new Date(existing.irn_generated_at).getTime();
        const now = Date.now();
        const hoursSinceGeneration = (now - generatedAt) / (1000 * 60 * 60);
        if (hoursSinceGeneration > 24) {
          throw new Error("E-Invoice cancellation window expired. IRN was generated more than 24 hours ago per Rule 48(4).");
        }
      }

      const { data, error } = await (supabase as any)
        .from("e_invoices")
        .update({
          status: "cancelled",
          cancel_reason: reason,
          cancel_remark: remark,
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
      qc.invalidateQueries({ queryKey: ["e_invoices"] });
      toast.success("E-Invoice cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    eInvoices: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    generateIRN: generateIRN.mutateAsync,
    cancel: cancelEInvoice.mutateAsync,
    isCreating: createMutation.isPending,
    isGenerating: generateIRN.isPending,
  };
}
