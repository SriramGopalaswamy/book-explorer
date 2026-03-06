import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface BinLocation {
  id: string;
  organization_id: string;
  warehouse_id: string;
  bin_code: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  level: string | null;
  is_active: boolean;
  capacity_units: number | null;
  current_units: number;
  notes: string | null;
  created_at: string;
}

export interface StockTransfer {
  id: string;
  organization_id: string;
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
  transfer_date: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface PickingList {
  id: string;
  organization_id: string;
  pick_number: string;
  warehouse_id: string;
  sales_order_id: string | null;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface InventoryCount {
  id: string;
  organization_id: string;
  count_number: string;
  warehouse_id: string;
  count_date: string;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export function useBinLocations(warehouseId?: string) {
  return useQuery({
    queryKey: ["bin-locations", warehouseId],
    queryFn: async () => {
      let q = supabase.from("bin_locations" as any).select("*").order("bin_code");
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as BinLocation[];
    },
  });
}

export function useCreateBinLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bin: { warehouse_id: string; bin_code: string; zone?: string; aisle?: string; rack?: string; level?: string; capacity_units?: number; notes?: string }) => {
      const { data, error } = await supabase.from("bin_locations" as any).insert(bin as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bin-locations"] }); toast.success("Bin location created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useStockTransfers() {
  return useQuery({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_transfers" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as StockTransfer[];
    },
  });
}

export function useCreateStockTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (t: { from_warehouse_id: string; to_warehouse_id: string; transfer_date: string; notes?: string; items: { item_name: string; quantity: number; item_id?: string }[] }) => {
      const num = `TRF-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase.from("stock_transfers" as any)
        .insert({ transfer_number: num, from_warehouse_id: t.from_warehouse_id, to_warehouse_id: t.to_warehouse_id, transfer_date: t.transfer_date, notes: t.notes || null, created_by: user?.id } as any)
        .select().single();
      if (error) throw error;
      if (t.items.length > 0) {
        const items = t.items.map((i) => ({ transfer_id: (data as any).id, item_name: i.item_name, quantity: i.quantity, item_id: i.item_id || null }));
        const { error: ie } = await supabase.from("stock_transfer_items" as any).insert(items as any);
        if (ie) throw ie;
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-transfers"] }); toast.success("Transfer created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTransferStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("stock_transfers" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-transfers"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function usePickingLists() {
  return useQuery({
    queryKey: ["picking-lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("picking_lists" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PickingList[];
    },
  });
}

export function useInventoryCounts() {
  return useQuery({
    queryKey: ["inventory-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_counts" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as InventoryCount[];
    },
  });
}
