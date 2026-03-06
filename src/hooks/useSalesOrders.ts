import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  return useQuery({
    queryKey: ["sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SalesOrder[];
    },
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
      const subtotal = so.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const tax = so.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0);
      const soNum = `SO-${Date.now().toString(36).toUpperCase()}`;

      const { data: soData, error: soErr } = await supabase
        .from("sales_orders" as any)
        .insert({
          so_number: soNum,
          customer_name: so.customer_name,
          customer_id: so.customer_id || null,
          order_date: so.order_date,
          expected_delivery: so.expected_delivery || null,
          notes: so.notes || null,
          subtotal,
          tax_amount: Math.round(tax * 100) / 100,
          total_amount: Math.round((subtotal + tax) * 100) / 100,
          created_by: user?.id,
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
        if (itemErr) throw itemErr;
      }
      return soData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); toast.success("Sales order created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateSOStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("sales_orders" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
