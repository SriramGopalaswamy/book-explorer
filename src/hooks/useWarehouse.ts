import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { postStockTransferEntries } from "@/lib/stock-ledger-sync";
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["bin-locations", warehouseId, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      let q = supabase.from("bin_locations" as any).select("*").eq("organization_id", orgId).order("bin_code");
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as BinLocation[];
    },
  });
}

export function useCreateBinLocation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (bin: { warehouse_id: string; bin_code: string; zone?: string; aisle?: string; rack?: string; level?: string; capacity_units?: number; notes?: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!bin.bin_code?.trim()) throw new Error("Bin code is required");
      if (!bin.warehouse_id) throw new Error("Warehouse is required");
      const { data, error } = await supabase.from("bin_locations" as any).insert(bin as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bin-locations"] }); toast.success("Bin location created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useStockTransfers() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["stock-transfers", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("stock_transfers" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
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
      if (!user) throw new Error("Not authenticated");

      // ── Validation: prevent self-transfers ──
      if (t.from_warehouse_id === t.to_warehouse_id) {
        throw new Error("Source and destination warehouse cannot be the same.");
      }

      // ── Validation: items must have positive quantities ──
      if (t.items.length === 0) {
        throw new Error("At least one item is required for a stock transfer.");
      }
      if (t.items.some(i => i.quantity <= 0)) {
        throw new Error("All transfer quantities must be greater than zero.");
      }
      if (t.items.some(i => !i.item_name?.trim())) {
        throw new Error("All transfer items must have a name.");
      }

      // Prevent future-dated transfers
      const today = new Date().toISOString().split("T")[0];
      if (t.transfer_date > today) {
        throw new Error("Transfer date cannot be in the future.");
      }

      const num = `TRF-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase.from("stock_transfers" as any)
        .insert({ transfer_number: num, from_warehouse_id: t.from_warehouse_id, to_warehouse_id: t.to_warehouse_id, transfer_date: t.transfer_date, notes: t.notes || null, created_by: user.id } as any)
        .select().single();
      if (error) throw error;

      if (t.items.length > 0) {
        const items = t.items.map((i) => ({ transfer_id: (data as any).id, item_name: i.item_name, quantity: i.quantity, item_id: i.item_id || null }));
        const { error: ie } = await supabase.from("stock_transfer_items" as any).insert(items as any);
        if (ie) {
          // Rollback: delete the transfer header if items fail
          await supabase.from("stock_transfers" as any).delete().eq("id", (data as any).id);
          throw ie;
        }
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-transfers"] }); toast.success("Transfer created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

const VALID_TRANSFER_STATUSES = ["draft", "in_transit", "received", "cancelled"] as const;

export function useUpdateTransferStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!VALID_TRANSFER_STATUSES.includes(status as any)) throw new Error(`Invalid transfer status: ${status}`);

      // ── Lifecycle state-machine ───────────────────────────────
      const TRANSFER_TRANSITIONS: Record<string, string[]> = {
        draft: ["in_transit", "cancelled"],
        in_transit: ["received", "cancelled"],
        received: [],    // terminal
        cancelled: [],   // terminal
      };

      const { data: current, error: fetchErr } = await supabase
        .from("stock_transfers" as any).select("status, from_warehouse_id, to_warehouse_id").eq("id", id).single();
      if (fetchErr) throw fetchErr;
      const currentStatus = (current as any)?.status;
      const allowed = TRANSFER_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(status)) {
        throw new Error(`Cannot change transfer from "${currentStatus}" to "${status}".`);
      }

      const { error } = await supabase.from("stock_transfers" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;

      // ── Auto stock ledger entries when transfer is received ──
      if (status === "received") {
        try {
          await postStockTransferEntries(
            id,
            (current as any).from_warehouse_id,
            (current as any).to_warehouse_id
          );
        } catch (stockErr) {
          console.warn("Stock ledger sync failed for transfer:", stockErr);
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-transfers"] }); qc.invalidateQueries({ queryKey: ["stock-ledger"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function usePickingLists() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["picking-lists", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("picking_lists" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PickingList[];
    },
  });
}

export function useInventoryCounts() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["inventory-counts", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("inventory_counts" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as InventoryCount[];
    },
  });
}
