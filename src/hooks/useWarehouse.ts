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
    enabled: !!orgId,
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
    enabled: !!orgId,
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

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) throw new Error("No organization found");

      const num = `TRF-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase.from("stock_transfers" as any)
        .insert({ transfer_number: num, from_warehouse_id: t.from_warehouse_id, to_warehouse_id: t.to_warehouse_id, transfer_date: t.transfer_date, notes: t.notes || null, created_by: user.id, organization_id: profile.organization_id } as any)
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
        } catch (stockErr: any) {
          toast.error(`Stock ledger sync failed: ${stockErr?.message ?? stockErr}`);
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
    enabled: !!orgId,
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
    enabled: !!orgId,
  });
}

export interface CountLine {
  id: string;
  count_id: string;
  item_id: string | null;
  item_name: string;
  expected_qty: number;
  actual_qty: number | null;
  variance: number | null;
  notes: string | null;
}

export function useCountLines(countId?: string) {
  return useQuery({
    queryKey: ["count-lines", countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_count_lines" as any).select("*").eq("count_id", countId!).order("item_name");
      if (error) throw error;
      return (data || []) as unknown as CountLine[];
    },
  });
}

export function useCreateInventoryCount() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: { warehouse_id: string; count_date: string; notes?: string; items: { item_id?: string; item_name: string; expected_qty: number }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.warehouse_id) throw new Error("Warehouse is required");
      if (!params.count_date) throw new Error("Count date is required");
      if (!params.items || params.items.length === 0) throw new Error("At least one item is required");

      const countNumber = `CNT-${Date.now().toString(36).toUpperCase()}`;
      const { data: countData, error: countErr } = await supabase
        .from("inventory_counts" as any)
        .insert({ count_number: countNumber, warehouse_id: params.warehouse_id, count_date: params.count_date, status: "draft", notes: params.notes || null, created_by: user.id } as any)
        .select().single();
      if (countErr) throw countErr;

      const lines = params.items.map((item) => ({
        count_id: (countData as any).id,
        item_id: item.item_id || null,
        item_name: item.item_name,
        expected_qty: item.expected_qty,
        actual_qty: null,
        variance: null,
      }));
      const { error: linesErr } = await supabase.from("inventory_count_lines" as any).insert(lines as any);
      if (linesErr) {
        await supabase.from("inventory_counts" as any).delete().eq("id", (countData as any).id);
        throw linesErr;
      }
      return countData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-counts"] }); toast.success("Inventory count created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCountLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actual_qty, notes }: { id: string; actual_qty: number; notes?: string }) => {
      if (actual_qty < 0) throw new Error("Actual quantity cannot be negative");
      const { data: line, error: fetchErr } = await supabase.from("inventory_count_lines" as any).select("expected_qty").eq("id", id).single();
      if (fetchErr) throw fetchErr;
      const variance = actual_qty - Number((line as any).expected_qty);
      const { error } = await supabase.from("inventory_count_lines" as any).update({ actual_qty, variance, notes: notes || null } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      // Invalidate the count lines for any count (we don't have count_id here easily)
      qc.invalidateQueries({ queryKey: ["count-lines"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useApproveInventoryCount() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (countId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Fetch count + lines
      const { data: count, error: cErr } = await supabase.from("inventory_counts" as any).select("status, warehouse_id").eq("id", countId).single();
      if (cErr) throw cErr;
      if ((count as any).status === "approved") throw new Error("Count already approved");

      const { data: lines, error: lErr } = await supabase.from("inventory_count_lines" as any).select("*").eq("count_id", countId);
      if (lErr) throw lErr;

      const unrecorded = (lines as any[]).filter((l) => l.actual_qty === null || l.actual_qty === undefined);
      if (unrecorded.length > 0) throw new Error(`${unrecorded.length} line(s) still have no actual count. Record all quantities before approving.`);

      // Post stock adjustment ledger entries for variances
      const variantLines = (lines as any[]).filter((l) => l.item_id && Number(l.variance || 0) !== 0);
      for (const line of variantLines) {
        const qty = Math.abs(Number(line.variance));
        const entryType = Number(line.variance) > 0 ? "in" : "out";
        await supabase.from("stock_ledger" as any).insert({
          item_id: line.item_id,
          warehouse_id: (count as any).warehouse_id,
          quantity: qty,
          entry_type: entryType,
          reference_type: "inventory_adjustment",
          reference_id: countId,
          notes: `Inventory count adjustment: ${line.item_name} (variance ${line.variance > 0 ? "+" : ""}${line.variance})`,
          posted_at: new Date().toISOString(),
        } as any);
      }

      // Mark count as approved
      const { error: updErr } = await supabase.from("inventory_counts" as any).update({ status: "approved" } as any).eq("id", countId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["count-lines"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Inventory count approved and variances posted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateBinLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; bin_code?: string; zone?: string; aisle?: string; rack?: string; level?: string; capacity_units?: number; is_active?: boolean; notes?: string }) => {
      if (updates.bin_code !== undefined && !updates.bin_code?.trim()) throw new Error("Bin code cannot be empty");
      const { error } = await supabase.from("bin_locations" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bin-locations"] }); toast.success("Bin location updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteBinLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bin_locations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bin-locations"] }); toast.success("Bin location deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useGeneratePickingList() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: { warehouse_id: string; sales_order_id?: string; notes?: string; items: { item_id?: string; item_name: string; quantity: number; bin_location?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.warehouse_id) throw new Error("Warehouse is required");
      if (!params.items || params.items.length === 0) throw new Error("At least one item is required");

      const pickNumber = `PICK-${Date.now().toString(36).toUpperCase()}`;
      const { data: pickData, error: pickErr } = await supabase
        .from("picking_lists" as any)
        .insert({ pick_number: pickNumber, warehouse_id: params.warehouse_id, sales_order_id: params.sales_order_id || null, status: "draft", notes: params.notes || null, created_by: user.id } as any)
        .select().single();
      if (pickErr) throw pickErr;

      const lines = params.items.map((item) => ({
        pick_list_id: (pickData as any).id,
        item_id: item.item_id || null,
        item_name: item.item_name,
        quantity_required: item.quantity,
        quantity_picked: 0,
        bin_location: item.bin_location || null,
        status: "pending",
      }));
      const { error: linesErr } = await supabase.from("pick_list_lines" as any).insert(lines as any);
      if (linesErr) {
        await supabase.from("picking_lists" as any).delete().eq("id", (pickData as any).id);
        throw linesErr;
      }
      return pickData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["picking-lists"] }); toast.success("Picking list created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdatePickingListStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const VALID = ["draft", "in_progress", "completed", "cancelled"] as const;
      if (!VALID.includes(status as any)) throw new Error(`Invalid picking list status: ${status}`);
      const TRANSITIONS: Record<string, string[]> = {
        draft: ["in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      const { data: current, error: cErr } = await supabase.from("picking_lists" as any).select("status").eq("id", id).single();
      if (cErr) throw cErr;
      const allowed = TRANSITIONS[(current as any).status] ?? [];
      if (!allowed.includes(status)) throw new Error(`Cannot transition picking list from "${(current as any).status}" to "${status}"`);
      const { error } = await supabase.from("picking_lists" as any).update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["picking-lists"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
