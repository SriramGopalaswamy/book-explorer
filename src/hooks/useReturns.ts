import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface SalesReturn {
  id: string;
  organization_id: string;
  return_number: string;
  sales_order_id: string | null;
  delivery_note_id: string | null;
  customer_id: string | null;
  customer_name: string;
  return_date: string;
  reason: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  credit_note_id: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface SalesReturnItem {
  id: string;
  sales_return_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  reason: string | null;
}

export interface PurchaseReturn {
  id: string;
  organization_id: string;
  return_number: string;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  vendor_id: string | null;
  vendor_name: string;
  return_date: string;
  reason: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  vendor_credit_id: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export function useSalesReturns() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["sales-returns", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("sales_returns" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SalesReturn[];
    },
    enabled: !!orgId,
  });
}

export function useCreateSalesReturn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: { customer_name: string; customer_id?: string; sales_order_id?: string; delivery_note_id?: string; return_date: string; reason?: string; notes?: string; items: { description: string; quantity: number; unit_price: number; tax_rate: number; item_id?: string; reason?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!r.customer_name?.trim()) throw new Error("Customer name is required.");
      if (!r.return_date) throw new Error("Return date is required.");
      if (r.items.length === 0) throw new Error("At least one return item is required.");
      if (r.items.some(i => i.quantity <= 0)) throw new Error("All return quantities must be greater than zero.");
      if (r.items.some(i => !i.description?.trim())) throw new Error("All return items must have a description.");
      if (r.items.some(i => i.tax_rate < 0 || i.tax_rate > 100)) throw new Error("Tax rates must be between 0% and 100%.");

      // If linked to a sales order, validate return quantities don't exceed shipped quantities
      if (r.sales_order_id) {
        const { data: soItems, error: soErr } = await supabase
          .from("sales_order_items" as any)
          .select("item_id, quantity, shipped_quantity")
          .eq("sales_order_id", r.sales_order_id);
        if (!soErr && soItems) {
          for (const returnItem of r.items) {
            if (returnItem.item_id) {
              const soItem = (soItems as any[]).find((s: any) => s.item_id === returnItem.item_id);
              if (soItem && returnItem.quantity > Number(soItem.shipped_quantity || soItem.quantity)) {
                throw new Error(`Return quantity for "${returnItem.description}" exceeds shipped quantity.`);
              }
            }
          }
        }
      }

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) throw new Error("No organization found");
      const subtotal = r.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const tax = r.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);
      const num = `SR-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase.from("sales_returns" as any).insert({
        return_number: num,
        customer_name: r.customer_name.trim(),
        customer_id: r.customer_id || null,
        sales_order_id: r.sales_order_id || null,
        delivery_note_id: r.delivery_note_id || null,
        return_date: r.return_date,
        reason: r.reason || null,
        subtotal,
        tax_amount: Math.round(tax * 100) / 100,
        total_amount: Math.round((subtotal + tax) * 100) / 100,
        notes: r.notes || null,
        created_by: user.id,
        organization_id: profile.organization_id,
      } as any).select().single();
      if (error) throw error;

      const items = r.items.map((i) => ({
        sales_return_id: (data as any).id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate,
        amount: Math.round(i.quantity * i.unit_price * (1 + i.tax_rate / 100) * 100) / 100,
        item_id: i.item_id || null,
        reason: i.reason || null,
      }));

      if (items.length > 0) {
        const { error: ie } = await supabase.from("sales_return_items" as any).insert(items as any);
        if (ie) {
          await supabase.from("sales_returns" as any).delete().eq("id", (data as any).id);
          throw ie;
        }
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-returns"] }); toast.success("Sales return created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

const VALID_RETURN_STATUSES = ["draft", "submitted", "approved", "processed", "cancelled", "closed"] as const;

export function useUpdateSalesReturnStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!VALID_RETURN_STATUSES.includes(status as any)) throw new Error(`Invalid return status: ${status}`);

      // ── Lifecycle state-machine ───────────────────────────────
      const RETURN_TRANSITIONS: Record<string, string[]> = {
        draft: ["submitted", "cancelled"],
        submitted: ["approved", "cancelled"],
        approved: ["processed", "cancelled"],
        processed: ["closed"],
        cancelled: [],  // terminal
        closed: [],     // terminal
      };

      const { data: current, error: fetchErr } = await supabase
        .from("sales_returns" as any).select("status").eq("id", id).single();
      if (fetchErr) throw fetchErr;
      const currentStatus = (current as any)?.status;
      const allowed = RETURN_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot change sales return from "${currentStatus}" to "${status}".`);
      }

      const { error } = await supabase.from("sales_returns" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-returns"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function usePurchaseReturns() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["purchase-returns", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("purchase_returns" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PurchaseReturn[];
    },
    enabled: !!orgId,
  });
}

export function useCreatePurchaseReturn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: { vendor_name: string; vendor_id?: string; purchase_order_id?: string; goods_receipt_id?: string; return_date: string; reason?: string; notes?: string; items: { description: string; quantity: number; unit_price: number; tax_rate: number; item_id?: string; reason?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!r.vendor_name?.trim()) throw new Error("Vendor name is required.");
      if (!r.return_date) throw new Error("Return date is required.");
      if (r.items.length === 0) throw new Error("At least one return item is required.");
      if (r.items.some(i => i.quantity <= 0)) throw new Error("All return quantities must be greater than zero.");
      if (r.items.some(i => !i.description?.trim())) throw new Error("All return items must have a description.");
      if (r.items.some(i => i.tax_rate < 0 || i.tax_rate > 100)) throw new Error("Tax rates must be between 0% and 100%.");

      // If linked to a PO, validate return quantities don't exceed received quantities
      if (r.purchase_order_id) {
        const { data: poItems, error: poErr } = await supabase
          .from("purchase_order_items" as any)
          .select("item_id, quantity, received_quantity")
          .eq("purchase_order_id", r.purchase_order_id);
        if (!poErr && poItems) {
          for (const returnItem of r.items) {
            if (returnItem.item_id) {
              const poItem = (poItems as any[]).find((p: any) => p.item_id === returnItem.item_id);
              if (poItem && returnItem.quantity > Number(poItem.received_quantity || poItem.quantity)) {
                throw new Error(`Return quantity for "${returnItem.description}" exceeds received quantity.`);
              }
            }
          }
        }
      }

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) throw new Error("No organization found");
      const subtotal = r.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const tax = r.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);
      const num = `PR-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase.from("purchase_returns" as any).insert({
        return_number: num,
        vendor_name: r.vendor_name.trim(),
        vendor_id: r.vendor_id || null,
        purchase_order_id: r.purchase_order_id || null,
        goods_receipt_id: r.goods_receipt_id || null,
        return_date: r.return_date,
        reason: r.reason || null,
        subtotal,
        tax_amount: Math.round(tax * 100) / 100,
        total_amount: Math.round((subtotal + tax) * 100) / 100,
        notes: r.notes || null,
        created_by: user.id,
        organization_id: profile.organization_id,
      } as any).select().single();
      if (error) throw error;

      const items = r.items.map((i) => ({
        purchase_return_id: (data as any).id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate,
        amount: Math.round(i.quantity * i.unit_price * (1 + i.tax_rate / 100) * 100) / 100,
        item_id: i.item_id || null,
        reason: i.reason || null,
      }));

      if (items.length > 0) {
        const { error: ie } = await supabase.from("purchase_return_items" as any).insert(items as any);
        if (ie) {
          await supabase.from("purchase_returns" as any).delete().eq("id", (data as any).id);
          throw ie;
        }
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-returns"] }); toast.success("Purchase return created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdatePurchaseReturnStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!VALID_RETURN_STATUSES.includes(status as any)) throw new Error(`Invalid return status: ${status}`);

      // ── Lifecycle state-machine ───────────────────────────────
      const RETURN_TRANSITIONS: Record<string, string[]> = {
        draft: ["submitted", "cancelled"],
        submitted: ["approved", "cancelled"],
        approved: ["processed", "cancelled"],
        processed: ["closed"],
        cancelled: [],
        closed: [],
      };

      const { data: current, error: fetchErr } = await supabase
        .from("purchase_returns" as any).select("status").eq("id", id).single();
      if (fetchErr) throw fetchErr;
      const currentStatus = (current as any)?.status;
      const allowed = RETURN_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot change purchase return from "${currentStatus}" to "${status}".`);
      }

      const { error } = await supabase.from("purchase_returns" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-returns"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateCreditNoteFromReturn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (salesReturnId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data: ret, error: rErr } = await supabase.from("sales_returns" as any).select("*").eq("id", salesReturnId).single();
      if (rErr) throw rErr;
      if ((ret as any).status !== "approved") throw new Error("Sales return must be approved before creating a credit note.");
      if ((ret as any).credit_note_id) throw new Error("A credit note already exists for this return.");

      const cnNumber = `CN-${Date.now().toString(36).toUpperCase()}`;
      const { data: cn, error: cnErr } = await supabase.from("credit_notes" as any).insert({
        credit_note_number: cnNumber,
        client_name: (ret as any).customer_name,
        customer_id: (ret as any).customer_id || null,
        amount: (ret as any).total_amount,
        reason: `Credit for sales return ${(ret as any).return_number}`,
        status: "issued",
        issue_date: new Date().toISOString().split("T")[0],
        user_id: user.id,
      } as any).select().single();
      if (cnErr) throw cnErr;

      await supabase.from("sales_returns" as any).update({ credit_note_id: (cn as any).id } as any).eq("id", salesReturnId);
      return cn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-returns"] });
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success("Credit note issued");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateVendorCreditFromReturn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (purchaseReturnId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data: ret, error: rErr } = await supabase.from("purchase_returns" as any).select("*").eq("id", purchaseReturnId).single();
      if (rErr) throw rErr;
      if ((ret as any).status !== "approved") throw new Error("Purchase return must be approved before creating a vendor credit.");
      if ((ret as any).vendor_credit_id) throw new Error("A vendor credit already exists for this return.");

      const vcNumber = `VC-${Date.now().toString(36).toUpperCase()}`;
      const { data: vc, error: vcErr } = await supabase.from("vendor_credits" as any).insert({
        vendor_credit_number: vcNumber,
        vendor_name: (ret as any).vendor_name,
        vendor_id: (ret as any).vendor_id || null,
        amount: (ret as any).total_amount,
        reason: `Vendor credit for purchase return ${(ret as any).return_number}`,
        status: "issued",
        issue_date: new Date().toISOString().split("T")[0],
        user_id: user.id,
      } as any).select().single();
      if (vcErr) throw vcErr;

      await supabase.from("purchase_returns" as any).update({ vendor_credit_id: (vc as any).id } as any).eq("id", purchaseReturnId);
      return vc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      qc.invalidateQueries({ queryKey: ["vendor-credits"] });
      toast.success("Vendor credit issued");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
