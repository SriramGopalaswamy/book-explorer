import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { postGoodsReceiptStock, postDeliveryNoteStock } from "@/lib/stock-ledger-sync";

// ─── Helper: resolve caller org ──────────────────────────────────
async function resolveCallerOrg(userId: string) {
  const { data } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  if (!data?.organization_id) throw new Error("Organization not found");
  return data.organization_id;
}

// ─── State machines ──────────────────────────────────────────────
const GR_TRANSITIONS: Record<string, string[]> = {
  draft: ["inspecting", "accepted", "cancelled"],
  inspecting: ["accepted", "rejected"],
  accepted: [],   // terminal
  rejected: [],   // terminal
  cancelled: [],  // terminal
};

const DN_TRANSITIONS: Record<string, string[]> = {
  draft: ["dispatched", "cancelled"],
  dispatched: ["in_transit", "delivered"],
  in_transit: ["delivered", "returned"],
  delivered: [],   // terminal
  returned: [],    // terminal
  cancelled: [],   // terminal
};

// ─── Quote → Sales Order ─────────────────────────────────────────
export function useConvertQuoteToSO() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (quote: {
      id: string; client_name: string; customer_id?: string | null;
      amount: number; due_date: string; notes?: string | null;
      quote_items?: { description: string; quantity: number; rate: number; amount: number; hsn_sac?: string }[];
    }) => {
      if (!user) throw new Error("Not authenticated");
      const callerOrgId = await resolveCallerOrg(user.id);

      const soNum = `SO-${Date.now().toString(36).toUpperCase()}`;
      const items = quote.quote_items || [];
      const subtotal = items.reduce((s, i) => s + i.amount, 0) || quote.amount;

      const { data: so, error: soErr } = await supabase
        .from("sales_orders" as any)
        .insert({
          so_number: soNum,
          customer_name: quote.client_name,
          customer_id: quote.customer_id || null,
          order_date: new Date().toISOString().split("T")[0],
          expected_delivery: quote.due_date,
          notes: quote.notes || null,
          subtotal,
          tax_amount: 0,
          total_amount: subtotal,
          created_by: user.id,
          organization_id: callerOrgId,
          status: "draft",
        } as any)
        .select()
        .single();
      if (soErr) throw soErr;

      if (items.length > 0) {
        const soItems = items.map((i) => ({
          sales_order_id: (so as any).id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.rate,
          tax_rate: 0,
          amount: i.amount,
          item_id: null,
        }));
        const { error: itemErr } = await supabase.from("sales_order_items" as any).insert(soItems as any);
        if (itemErr) {
          await supabase.from("sales_orders" as any).delete().eq("id", (so as any).id);
          throw itemErr;
        }
      }

      // Mark quote as converted (org-scoped)
      await supabase.from("quotes").update({ status: "converted" } as any).eq("id", quote.id).eq("organization_id", callerOrgId);
      return so;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Quote converted to Sales Order");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── PO → Goods Receipt ─────────────────────────────────────────
export function useCreateGoodsReceipt() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      purchase_order_id: string;
      receipt_date: string;
      notes?: string;
      items: { item_id?: string; description: string; quantity_received: number }[];
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.purchase_order_id) throw new Error("Purchase Order is required");
      if (params.items.length === 0) throw new Error("At least one item is required");

      const callerOrgId = await resolveCallerOrg(user.id);

      // Verify PO belongs to caller's org
      const { data: poCheck } = await supabase.from("purchase_orders" as any).select("id").eq("id", params.purchase_order_id).eq("organization_id", callerOrgId).maybeSingle();
      if (!poCheck) throw new Error("Purchase order not found in your organization.");

      const grnNum = `GRN-${Date.now().toString(36).toUpperCase()}`;

      const { data: gr, error: grErr } = await supabase
        .from("goods_receipts" as any)
        .insert({
          grn_number: grnNum,
          purchase_order_id: params.purchase_order_id,
          receipt_date: params.receipt_date,
          notes: params.notes || null,
          status: "draft",
          received_by: user.id,
          organization_id: callerOrgId,
        } as any)
        .select()
        .single();
      if (grErr) throw grErr;

      // Insert GR items
      const grItems = params.items.map((i) => ({
        goods_receipt_id: (gr as any).id,
        item_id: i.item_id || null,
        description: i.description,
        quantity_received: i.quantity_received,
      }));
      const { error: itemErr } = await supabase.from("goods_receipt_items" as any).insert(grItems as any);
      if (itemErr) {
        await supabase.from("goods_receipts" as any).delete().eq("id", (gr as any).id);
        throw itemErr;
      }

      // Update PO received quantities (org-scoped)
      for (const item of params.items) {
        if (item.item_id) {
          const { data: poItem } = await supabase
            .from("purchase_order_items" as any)
            .select("id, received_quantity")
            .eq("purchase_order_id", params.purchase_order_id)
            .eq("item_id", item.item_id)
            .maybeSingle();
          if (poItem) {
            await supabase.from("purchase_order_items" as any)
              .update({ received_quantity: Number((poItem as any).received_quantity || 0) + item.quantity_received } as any)
              .eq("id", (poItem as any).id);
          }
        }
      }

      // Check if PO should transition to partially_received or received
      const { data: poItems } = await supabase
        .from("purchase_order_items" as any)
        .select("quantity, received_quantity")
        .eq("purchase_order_id", params.purchase_order_id);
      if (poItems && (poItems as any[]).length > 0) {
        const allReceived = (poItems as any[]).every((i: any) => Number(i.received_quantity) >= Number(i.quantity));
        const someReceived = (poItems as any[]).some((i: any) => Number(i.received_quantity) > 0);
        if (allReceived) {
          await supabase.from("purchase_orders" as any).update({ status: "received" } as any).eq("id", params.purchase_order_id).eq("organization_id", callerOrgId);
        } else if (someReceived) {
          await supabase.from("purchase_orders" as any).update({ status: "partially_received" } as any).eq("id", params.purchase_order_id).eq("organization_id", callerOrgId);
        }
      }

      return gr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["po-items"] });
      toast.success("Goods receipt created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── GR Status Updates ──────────────────────────────────────────
export function useUpdateGRStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      const callerOrgId = await resolveCallerOrg(user.id);

      const { data: current } = await supabase.from("goods_receipts" as any).select("status").eq("id", id).eq("organization_id", callerOrgId).maybeSingle();
      if (!current) throw new Error("Goods receipt not found in your organization.");
      const currentStatus = (current as any)?.status;
      const allowed = GR_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot transition GR from "${currentStatus}" to "${status}"`);
      }
      const { error } = await supabase.from("goods_receipts" as any).update({ status } as any).eq("id", id).eq("organization_id", callerOrgId);
      if (error) throw error;

      // ── Auto stock-in when GR is accepted ──
      if (status === "accepted") {
        try {
          await postGoodsReceiptStock(id);
        } catch (stockErr: any) {
          toast.error(`Stock ledger sync failed for GR: ${stockErr?.message ?? stockErr}`);
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goods-receipts"] }); qc.invalidateQueries({ queryKey: ["stock-ledger"] }); toast.success("GR status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── GR → Bill ──────────────────────────────────────────────────
export function useCreateBillFromGR() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { goods_receipt_id: string; purchase_order_id: string }) => {
      if (!user) throw new Error("Not authenticated");
      const callerOrgId = await resolveCallerOrg(user.id);

      // Verify PO belongs to caller's org
      const { data: po } = await supabase.from("purchase_orders" as any)
        .select("vendor_name, vendor_id, subtotal, tax_amount, total_amount")
        .eq("id", params.purchase_order_id).eq("organization_id", callerOrgId).single();
      if (!po) throw new Error("Purchase Order not found in your organization.");

      const billNum = `BILL-${Date.now().toString(36).toUpperCase()}`;
      const { data: bill, error } = await supabase.from("bills").insert({
        bill_number: billNum,
        vendor_name: (po as any).vendor_name,
        vendor_id: (po as any).vendor_id || null,
        purchase_order_id: params.purchase_order_id,
        goods_receipt_id: params.goods_receipt_id,
        amount: Number((po as any).subtotal),
        tax_amount: Number((po as any).tax_amount),
        total_amount: Number((po as any).total_amount),
        bill_date: new Date().toISOString().split("T")[0],
        status: "Draft",
        user_id: user.id,
        organization_id: callerOrgId,
      } as any).select().single();
      if (error) throw error;

      // Copy PO items as bill items
      const { data: poItems } = await supabase.from("purchase_order_items" as any)
        .select("*").eq("purchase_order_id", params.purchase_order_id);
      if (poItems && (poItems as any[]).length > 0) {
        const billItems = (poItems as any[]).map((i: any) => ({
          bill_id: (bill as any).id,
          description: i.description,
          quantity: i.received_quantity || i.quantity,
          rate: i.unit_price,
          amount: (i.received_quantity || i.quantity) * i.unit_price,
        }));
        await supabase.from("bill_items").insert(billItems);
      }

      return bill;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Bill created from Goods Receipt");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── SO → Delivery Note ────────────────────────────────────────
export function useCreateDeliveryNote() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      sales_order_id: string;
      delivery_date: string;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.sales_order_id) throw new Error("Sales Order is required");

      const callerOrgId = await resolveCallerOrg(user.id);

      // Verify SO belongs to caller's org
      const { data: soCheck } = await supabase.from("sales_orders" as any).select("id").eq("id", params.sales_order_id).eq("organization_id", callerOrgId).maybeSingle();
      if (!soCheck) throw new Error("Sales order not found in your organization.");

      const dnNum = `DN-${Date.now().toString(36).toUpperCase()}`;

      const { data: dn, error } = await supabase
        .from("delivery_notes" as any)
        .insert({
          dn_number: dnNum,
          sales_order_id: params.sales_order_id,
          delivery_date: params.delivery_date,
          notes: params.notes || null,
          status: "draft",
          created_by: user.id,
          organization_id: callerOrgId,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Copy SO items as DN items
      const { data: soItems } = await supabase
        .from("sales_order_items" as any)
        .select("*")
        .eq("sales_order_id", params.sales_order_id);
      if (soItems && (soItems as any[]).length > 0) {
        const dnItems = (soItems as any[]).map((i: any) => ({
          delivery_note_id: (dn as any).id,
          item_id: i.item_id || null,
          description: i.description,
          quantity: i.quantity,
          shipped_quantity: i.quantity,
        }));
        const { error: itemErr } = await supabase.from("delivery_note_items" as any).insert(dnItems as any);
        if (itemErr) {
          await supabase.from("delivery_notes" as any).delete().eq("id", (dn as any).id);
          throw itemErr;
        }
      }

      return dn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-notes"] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Delivery note created from Sales Order");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── DN Status Updates (with SO auto-update) ────────────────────
export function useUpdateDNStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      const callerOrgId = await resolveCallerOrg(user.id);

      const { data: current } = await supabase.from("delivery_notes" as any).select("status, sales_order_id").eq("id", id).eq("organization_id", callerOrgId).maybeSingle();
      if (!current) throw new Error("Delivery note not found in your organization.");
      const currentStatus = (current as any)?.status;
      const allowed = DN_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot transition DN from "${currentStatus}" to "${status}"`);
      }
      const { error } = await supabase.from("delivery_notes" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id).eq("organization_id", callerOrgId);
      if (error) throw error;

      // ── Auto stock-out when DN is delivered ──
      if (status === "delivered") {
        try {
          await postDeliveryNoteStock(id);
        } catch (stockErr: any) {
          toast.error(`Stock ledger sync failed for DN: ${stockErr?.message ?? stockErr}`);
        }
      }

      // Auto-update SO status when DN is delivered (org-scoped)
      const soId = (current as any)?.sales_order_id;
      if (status === "delivered" && soId) {
        await supabase.from("sales_orders" as any).update({ status: "delivered" } as any).eq("id", soId).eq("organization_id", callerOrgId);
      } else if (status === "dispatched" && soId) {
        const { data: so } = await supabase.from("sales_orders" as any).select("status").eq("id", soId).eq("organization_id", callerOrgId).maybeSingle();
        if ((so as any)?.status === "processing" || (so as any)?.status === "confirmed") {
          await supabase.from("sales_orders" as any).update({ status: "shipped" } as any).eq("id", soId).eq("organization_id", callerOrgId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-notes"] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      toast.success("Delivery note status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── SO → Invoice conversion ────────────────────────────────────
export function useConvertSOToInvoice() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (so: {
      id: string; customer_name: string; customer_id?: string | null;
      total_amount: number; subtotal: number; tax_amount: number;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const callerOrgId = await resolveCallerOrg(user.id);

      // Verify SO belongs to caller's org
      const { data: soCheck } = await supabase.from("sales_orders" as any).select("id").eq("id", so.id).eq("organization_id", callerOrgId).maybeSingle();
      if (!soCheck) throw new Error("Sales order not found in your organization.");

      const invoiceNum = `INV-${Date.now().toString().slice(-8)}`;
      const { data: inv, error } = await supabase.from("invoices").insert({
        user_id: user.id,
        invoice_number: invoiceNum,
        client_name: so.customer_name,
        client_email: "",
        customer_id: so.customer_id || null,
        amount: so.total_amount,
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        status: "draft",
        subtotal: so.subtotal,
        total_amount: so.total_amount,
        organization_id: callerOrgId,
      } as any).select().single();
      if (error) throw error;

      // Copy SO items as invoice items
      const { data: soItems } = await supabase
        .from("sales_order_items" as any)
        .select("*")
        .eq("sales_order_id", so.id);
      if (soItems && (soItems as any[]).length > 0) {
        const invItems = (soItems as any[]).map((i: any) => ({
          invoice_id: inv.id,
          description: i.description,
          quantity: i.quantity,
          rate: i.unit_price,
          amount: i.amount,
        }));
        const { error: itemErr } = await supabase.from("invoice_items").insert(invItems);
        if (itemErr) {
          await supabase.from("invoices").delete().eq("id", inv.id);
          throw itemErr;
        }
      }

      // Mark SO as closed (org-scoped)
      await supabase.from("sales_orders" as any).update({ status: "closed" } as any).eq("id", so.id).eq("organization_id", callerOrgId);
      return inv;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Sales Order converted to Invoice");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
