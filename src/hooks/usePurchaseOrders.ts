import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface PurchaseOrder {
  id: string;
  organization_id: string;
  po_number: string;
  vendor_id: string | null;
  vendor_name: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface POItem {
  id: string;
  purchase_order_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  received_quantity: number;
  created_at: string;
}

export function usePurchaseOrders() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["purchase-orders", orgId],
    queryFn: async () => {
      if (!orgId) return [] as PurchaseOrder[];
      const { data, error } = await supabase.from("purchase_orders" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PurchaseOrder[];
    },
    enabled: !!orgId,
  });
}

export function usePurchaseOrderItems(poId?: string) {
  return useQuery({
    queryKey: ["po-items", poId],
    enabled: !!poId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items" as any)
        .select("*")
        .eq("purchase_order_id", poId!);
      if (error) throw error;
      return (data || []) as unknown as POItem[];
    },
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (po: { vendor_name: string; vendor_id?: string; order_date: string; expected_delivery?: string; notes?: string; items: { description: string; quantity: number; unit_price: number; tax_rate: number; item_id?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");

      // ── Validation ──
      if (!po.vendor_name.trim()) throw new Error("Vendor name is required.");
      if (!po.order_date) throw new Error("Order date is required.");
      if (po.items.length === 0) throw new Error("At least one line item is required.");
      if (po.items.some(i => i.quantity <= 0)) throw new Error("All quantities must be greater than zero.");
      if (po.items.some(i => i.unit_price < 0)) throw new Error("Unit prices cannot be negative.");
      if (po.items.some(i => i.tax_rate < 0 || i.tax_rate > 100)) throw new Error("Tax rates must be between 0% and 100%.");
      if (po.items.some(i => !i.description?.trim())) throw new Error("All line items must have a description.");

      // Expected delivery must be on or after order date
      if (po.expected_delivery && po.expected_delivery < po.order_date) {
        throw new Error("Expected delivery date cannot be before the order date.");
      }

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");
      const subtotal = po.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const tax = po.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);
      const poNum = `PO-${Date.now().toString(36).toUpperCase()}`;

      const { data: poData, error: poErr } = await supabase
        .from("purchase_orders" as any)
        .insert({
          po_number: poNum,
          vendor_name: po.vendor_name.trim(),
          vendor_id: po.vendor_id || null,
          order_date: po.order_date,
          expected_delivery: po.expected_delivery || null,
          notes: po.notes || null,
          subtotal,
          tax_amount: Math.round(tax * 100) / 100,
          total_amount: Math.round((subtotal + tax) * 100) / 100,
          created_by: user.id,
          organization_id: profile.organization_id,
        } as any)
        .select()
        .single();
      if (poErr) throw poErr;

      const items = po.items.map((i) => ({
        purchase_order_id: (poData as any).id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate,
        amount: Math.round(i.quantity * i.unit_price * (1 + i.tax_rate / 100) * 100) / 100,
        item_id: i.item_id || null,
      }));

      if (items.length > 0) {
        const { error: itemErr } = await supabase.from("purchase_order_items" as any).insert(items as any);
        if (itemErr) {
          // Rollback header on item insert failure
          await supabase.from("purchase_orders" as any).delete().eq("id", (poData as any).id);
          throw itemErr;
        }
      }
      return poData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("Purchase order created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

const VALID_PO_STATUSES = ["draft", "submitted", "approved", "partially_received", "received", "cancelled", "closed"] as const;
const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "cancelled"],
  approved: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed"],
  received: ["closed"],
};

export function useDeletePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: po } = await supabase.from("purchase_orders" as any).select("status").eq("id", id).maybeSingle();
      const status = (po as any)?.status;
      if (status && status !== "draft") {
        throw new Error(`Cannot delete a "${status}" purchase order. Only drafts can be deleted.`);
      }
      // Delete items first, then header
      await supabase.from("purchase_order_items" as any).delete().eq("purchase_order_id", id);
      const { error } = await supabase.from("purchase_orders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("Purchase order deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdatePOStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!VALID_PO_STATUSES.includes(status as any)) throw new Error(`Invalid PO status: ${status}`);

      // Verify current status allows transition
      const { data: current } = await supabase.from("purchase_orders" as any).select("status").eq("id", id).maybeSingle();
      const currentStatus = (current as any)?.status;
      if (currentStatus && PO_TRANSITIONS[currentStatus] && !PO_TRANSITIONS[currentStatus].includes(status)) {
        throw new Error(`Cannot transition PO from '${currentStatus}' to '${status}'`);
      }

      const { error } = await supabase.from("purchase_orders" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
