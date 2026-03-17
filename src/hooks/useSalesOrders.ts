import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface SalesOrder {
  id: string;
  organization_id: string;
  so_number: string;
  customer_id: string | null;
  customer_name: string;
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

export interface SOItem {
  id: string;
  sales_order_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  shipped_quantity: number;
  created_at: string;
}

export function useSalesOrders() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["sales-orders", orgId],
    queryFn: async () => {
      if (!orgId) return [] as SalesOrder[];
      const { data, error } = await supabase.from("sales_orders" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SalesOrder[];
    },
    enabled: !!orgId,
  });
}

export function useSalesOrderItems(soId?: string) {
  return useQuery({
    queryKey: ["so-items", soId],
    enabled: !!soId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_order_items" as any)
        .select("*")
        .eq("sales_order_id", soId!);
      if (error) throw error;
      return (data || []) as unknown as SOItem[];
    },
  });
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (so: { customer_name: string; customer_id?: string; order_date: string; expected_delivery?: string; notes?: string; items: { description: string; quantity: number; unit_price: number; tax_rate: number; item_id?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");

      // ── Validation ──
      if (!so.customer_name.trim()) throw new Error("Customer name is required.");
      if (!so.order_date) throw new Error("Order date is required.");
      if (so.items.length === 0) throw new Error("At least one line item is required.");
      if (so.items.some(i => i.quantity <= 0)) throw new Error("All quantities must be greater than zero.");
      if (so.items.some(i => i.unit_price < 0)) throw new Error("Unit prices cannot be negative.");
      if (so.items.some(i => i.tax_rate < 0 || i.tax_rate > 100)) throw new Error("Tax rates must be between 0% and 100%.");
      if (so.items.some(i => !i.description?.trim())) throw new Error("All line items must have a description.");

      // Expected delivery must be on or after order date
      if (so.expected_delivery && so.expected_delivery < so.order_date) {
        throw new Error("Expected delivery date cannot be before the order date.");
      }

      const subtotal = so.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const tax = so.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);
      const soNum = `SO-${Date.now().toString(36).toUpperCase()}`;

      // Resolve org_id explicitly for RLS compliance
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");

      const { data: soData, error: soErr } = await supabase
        .from("sales_orders" as any)
        .insert({
          so_number: soNum,
          customer_name: so.customer_name.trim(),
          customer_id: so.customer_id || null,
          order_date: so.order_date,
          expected_delivery: so.expected_delivery || null,
          notes: so.notes || null,
          subtotal,
          tax_amount: Math.round(tax * 100) / 100,
          total_amount: Math.round((subtotal + tax) * 100) / 100,
          created_by: user.id,
          organization_id: profile.organization_id,
        } as any)
        .select()
        .single();
      if (soErr) throw soErr;

      const items = so.items.map((i) => ({
        sales_order_id: (soData as any).id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate,
        amount: Math.round(i.quantity * i.unit_price * (1 + i.tax_rate / 100) * 100) / 100,
        item_id: i.item_id || null,
      }));

      if (items.length > 0) {
        const { error: itemErr } = await supabase.from("sales_order_items" as any).insert(items as any);
        if (itemErr) {
          await supabase.from("sales_orders" as any).delete().eq("id", (soData as any).id);
          throw itemErr;
        }
      }
      return soData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); toast.success("Sales order created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateSalesOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: { id: string; customer_name: string; order_date: string; expected_delivery?: string; notes?: string; items: { description: string; quantity: number; unit_price: number; tax_rate: number; item_id?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.customer_name.trim()) throw new Error("Customer name is required.");
      if (!params.order_date) throw new Error("Order date is required.");
      if (params.items.length === 0) throw new Error("At least one line item is required.");
      if (params.items.some(i => i.quantity <= 0)) throw new Error("All quantities must be greater than zero.");
      if (params.items.some(i => i.unit_price < 0)) throw new Error("Unit prices cannot be negative.");
      if (params.items.some(i => !i.description?.trim())) throw new Error("All line items must have a description.");
      if (params.expected_delivery && params.expected_delivery < params.order_date) {
        throw new Error("Expected delivery date cannot be before the order date.");
      }

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");

      // Verify it's still draft
      const { data: current } = await supabase.from("sales_orders" as any).select("status").eq("id", params.id).eq("organization_id", profile.organization_id).maybeSingle();
      if (!current) throw new Error("Sales order not found.");
      if ((current as any).status !== "draft") throw new Error("Only draft sales orders can be edited.");

      const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const tax = params.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);

      const { error: soErr } = await supabase.from("sales_orders" as any).update({
        customer_name: params.customer_name.trim(),
        order_date: params.order_date,
        expected_delivery: params.expected_delivery || null,
        notes: params.notes || null,
        subtotal,
        tax_amount: Math.round(tax * 100) / 100,
        total_amount: Math.round((subtotal + tax) * 100) / 100,
        updated_at: new Date().toISOString(),
      } as any).eq("id", params.id).eq("organization_id", profile.organization_id);
      if (soErr) throw soErr;

      // Replace items: delete old, insert new
      await supabase.from("sales_order_items" as any).delete().eq("sales_order_id", params.id);
      const newItems = params.items.map((i) => ({
        sales_order_id: params.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate,
        amount: Math.round(i.quantity * i.unit_price * (1 + i.tax_rate / 100) * 100) / 100,
        item_id: i.item_id || null,
      }));
      if (newItems.length > 0) {
        const { error: itemErr } = await supabase.from("sales_order_items" as any).insert(newItems as any);
        if (itemErr) throw itemErr;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); qc.invalidateQueries({ queryKey: ["so-items"] }); toast.success("Sales order updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

const VALID_SO_STATUSES = ["draft", "confirmed", "processing", "partially_shipped", "shipped", "delivered", "cancelled", "closed"] as const;
const SO_TRANSITIONS: Record<string, string[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["partially_shipped", "shipped", "cancelled"],
  partially_shipped: ["shipped", "delivered"],
  shipped: ["delivered", "invoiced"],
  delivered: ["invoiced"],
};

export function useDeleteSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Resolve caller's org — never trust record's own org_id
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", authUser.id).maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      const { data: so } = await supabase.from("sales_orders" as any).select("status").eq("id", id).eq("organization_id", callerOrgId).maybeSingle();
      if (!so) throw new Error("Sales order not found in your organization.");
      const status = (so as any)?.status;
      if (status && status !== "draft") {
        throw new Error(`Cannot delete a "${status}" sales order. Only drafts can be deleted.`);
      }
      await supabase.from("sales_order_items" as any).delete().eq("sales_order_id", id);
      const { error } = await supabase.from("sales_orders" as any).delete().eq("id", id).eq("organization_id", callerOrgId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); toast.success("Sales order deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateSOStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!VALID_SO_STATUSES.includes(status as any)) throw new Error(`Invalid SO status: ${status}`);

      // Resolve caller's org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      const callerOrgId = callerProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization context required");

      const { data: current } = await supabase.from("sales_orders" as any).select("status").eq("id", id).eq("organization_id", callerOrgId).maybeSingle();
      if (!current) throw new Error("Sales order not found in your organization.");
      const currentStatus = (current as any)?.status;
      if (currentStatus && SO_TRANSITIONS[currentStatus] && !SO_TRANSITIONS[currentStatus].includes(status)) {
        throw new Error(`Cannot transition SO from '${currentStatus}' to '${status}'`);
      }

      const { error } = await supabase.from("sales_orders" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id).eq("organization_id", callerOrgId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
