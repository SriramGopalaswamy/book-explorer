import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

export function useEwayBills() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["eway_bills"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EwayBill[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (bill: EwayBillInsert) => {
      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .insert({ ...bill, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
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
      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .update(updates)
        .eq("id", id)
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
      const { data, error } = await (supabase as any)
        .from("eway_bills")
        .update({
          status: "cancelled",
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", id)
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

  return {
    ewayBills: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    cancel: cancelMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
