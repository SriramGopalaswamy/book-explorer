import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

export function useEInvoices() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["e_invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("e_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EInvoice[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (einv: EInvoiceInsert) => {
      const { data, error } = await (supabase as any)
        .from("e_invoices")
        .insert({ ...einv, user_id: user!.id })
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
      const { data, error } = await (supabase as any)
        .from("e_invoices")
        .update({
          status: "cancelled",
          cancel_reason: reason,
          cancel_remark: remark,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", id)
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
