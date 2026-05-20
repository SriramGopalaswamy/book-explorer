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
      let q = supabase.from("bin_locations").select("*").eq("organization_id", orgId).order("bin_code");
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
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async (bin: { warehouse_id: string; bin_code: string; zone?: string; aisle?: string; rack?: string; level?: string; capacity_units?: number; notes?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      if (!bin.bin_code?.trim()) throw new Error("Bin code is required");
      if (!bin.warehouse_id) throw new Error("Warehouse is required");
      const { data, error } = await supabase.from("bin_locations").insert({ ...bin, organization_id: orgId } as any).select().single();
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
      const { data, error } = await supabase.from("stock_transfers").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500);
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
    mutationFn: async (t: { from_warehouse_id: string; to_warehouse_id: string; transfer_date: string; notes?: string; items: { item_name: string; quantity: number; item_id?: string; from_bin_id?: string; to_bin_id?: string }[] }) => {
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

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");

      const num = `TRF-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase.from("stock_transfers")
        .insert({ transfer_number: num, from_warehouse_id: t.from_warehouse_id, to_warehouse_id: t.to_warehouse_id, transfer_date: t.transfer_date, notes: t.notes || null, created_by: user.id, organization_id: profile.organization_id } as any)
        .select().single();
      if (error) throw error;

      if (t.items.length > 0) {
        const items = t.items.map((i) => ({ transfer_id: (data as any).id, item_name: i.item_name, quantity: i.quantity, item_id: i.item_id || null, from_bin_id: i.from_bin_id || null, to_bin_id: i.to_bin_id || null }));
        const { error: ie } = await supabase.from("stock_transfer_items").insert(items as any);
        if (ie) {
          // Rollback: delete the transfer header if items fail
          await supabase.from("stock_transfers").delete().eq("id", (data as any).id);
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

      // GBC-113: status flip + stock movement now atomic in a single RPC.
      const { error } = await (supabase as any).rpc("update_stock_transfer_status", {
        p_transfer_id: id,
        p_new_status: status,
      });
      if (error) throw new Error(error.message);
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
      const { data, error } = await supabase.from("picking_lists").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as unknown as PickingList[];
    },
    enabled: !!orgId,
  });
}

export function useInventoryCounts(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return useQuery({
    queryKey: ["inventory-counts", orgId, page, pageSize, params?.search, params?.status],
    queryFn: async (): Promise<{ data: InventoryCount[]; total: number }> => {
      if (!orgId) return { data: [], total: 0 };
      let query = supabase
        .from("inventory_counts")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (params?.search) query = query.ilike("count_number", `%${params.search}%`);
      if (params?.status && params.status !== "all") query = query.eq("status", params.status);
      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data || []) as unknown as InventoryCount[], total: count ?? 0 };
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
      const { data, error } = await supabase.from("inventory_count_lines").select("*").eq("count_id", countId!).order("item_name");
      if (error) throw error;
      return (data || []) as unknown as CountLine[];
    },
  });
}

export function useCreateInventoryCount() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: { warehouse_id: string; count_date: string; notes?: string; items: { item_id?: string; item_name: string; expected_qty: number; bin_id?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.warehouse_id) throw new Error("Warehouse is required");
      if (!params.count_date) throw new Error("Count date is required");
      if (!params.items || params.items.length === 0) throw new Error("At least one item is required");

      // Resolve org for tenant isolation
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");

      const countNumber = `CNT-${Date.now().toString(36).toUpperCase()}`;
      const { data: countData, error: countErr } = await supabase
        .from("inventory_counts")
        .insert({ count_number: countNumber, warehouse_id: params.warehouse_id, count_date: params.count_date, status: "draft", notes: params.notes || null, created_by: user.id, organization_id: profile.organization_id } as any)
        .select().single();
      if (countErr) throw countErr;

      const lines = params.items.map((item) => ({
        count_id: (countData as any).id,
        item_id: item.item_id || null,
        item_name: item.item_name,
        expected_qty: item.expected_qty,
        actual_qty: null,
        variance: null,
        bin_id: item.bin_id || null,
      }));
      const { error: linesErr } = await supabase.from("inventory_count_lines").insert(lines as any);
      if (linesErr) {
        await supabase.from("inventory_counts").delete().eq("id", (countData as any).id);
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
      const { data: line, error: fetchErr } = await supabase.from("inventory_count_lines").select("expected_qty").eq("id", id).single();
      if (fetchErr) throw fetchErr;
      const variance = actual_qty - Number((line as any).expected_qty);
      const { error } = await supabase.from("inventory_count_lines").update({ actual_qty, variance, notes: notes || null } as any).eq("id", id);
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

      const { data: orgProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      const callerOrgId = orgProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization not found");

      const { data: count, error: cErr } = await supabase.from("inventory_counts").select("status, created_by").eq("id", countId).eq("organization_id", callerOrgId).single();
      if (cErr) throw cErr;
      if ((count as any).status !== "draft") throw new Error("Only draft counts can be approved");

      // Maker-checker: prevent self-approval
      if ((count as any).created_by === user.id) {
        throw new Error("You cannot approve an inventory count you created. Another user must approve it.");
      }

      // Verify all lines have actual quantities
      const { data: lines, error: lErr } = await supabase.from("inventory_count_lines").select("*").eq("count_id", countId);
      if (lErr) throw lErr;
      const unrecorded = (lines as any[]).filter((l) => l.actual_qty === null || l.actual_qty === undefined);
      if (unrecorded.length > 0) throw new Error(`${unrecorded.length} line(s) still have no actual count. Record all quantities before approving.`);

      // Mark count as approved (no stock posting yet)
      const { error: updErr } = await supabase.from("inventory_counts").update({ status: "approved" } as any).eq("id", countId).eq("organization_id", callerOrgId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["count-lines"] });
      toast.success("Inventory count approved. You can now post variances.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function usePostInventoryCount() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (countId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data: orgProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!orgProfile?.organization_id) throw new Error("Organization not found");
      const { error } = await supabase.rpc("post_inventory_variances" as never, {
        p_count_id: countId,
        p_org_id: orgProfile.organization_id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["count-lines"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Variances posted to stock ledger");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateBinLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; bin_code?: string; zone?: string; aisle?: string; rack?: string; level?: string; capacity_units?: number; is_active?: boolean; notes?: string }) => {
      if (updates.bin_code !== undefined && !updates.bin_code?.trim()) throw new Error("Bin code cannot be empty");
      const { data: orgData } = await supabase.from("profiles").select("organization_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      if (!orgData?.organization_id) throw new Error("Organization not found");
      const { error } = await supabase.from("bin_locations").update(updates as any).eq("id", id).eq("organization_id", orgData.organization_id);
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
      const { data: orgData } = await supabase.from("profiles").select("organization_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      if (!orgData?.organization_id) throw new Error("Organization not found");
      const { error } = await supabase.from("bin_locations").delete().eq("id", id).eq("organization_id", orgData.organization_id);
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
    mutationFn: async (params: { warehouse_id: string; sales_order_id?: string; notes?: string; items: { item_id?: string; item_name: string; quantity: number; bin_id?: string; bin_location?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!params.warehouse_id) throw new Error("Warehouse is required");
      if (!params.items || params.items.length === 0) throw new Error("At least one item is required");

      // Resolve org for tenant isolation
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");

      const pickNumber = `PICK-${Date.now().toString(36).toUpperCase()}`;
      const { data: pickData, error: pickErr } = await supabase
        .from("picking_lists")
        .insert({ pick_number: pickNumber, warehouse_id: params.warehouse_id, sales_order_id: params.sales_order_id || null, status: "pending", notes: params.notes || null, created_by: user.id, organization_id: profile.organization_id } as any)
        .select().single();
      if (pickErr) throw pickErr;

      const lines = params.items.map((item) => ({
        picking_list_id: (pickData as any).id,
        item_id: item.item_id || null,
        item_name: item.item_name,
        required_quantity: item.quantity,
        picked_quantity: 0,
        bin_id: item.bin_id || null,
        status: "pending",
      }));
      const { error: linesErr } = await supabase.from("picking_list_items").insert(lines as any);
      if (linesErr) {
        console.error("Picking list items insert error:", linesErr);
        await supabase.from("picking_lists").delete().eq("id", (pickData as any).id);
        throw new Error(`Failed to create picking list items: ${linesErr.message}. Please check that the warehouse module is fully set up.`);
      }
      return pickData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["picking-lists"] }); toast.success("Picking list created"); },
    onError: (e: any) => { qc.invalidateQueries({ queryKey: ["picking-lists"] }); toast.error(e.message); },
  });
}

export function useAcceptGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { error } = await (supabase.rpc as unknown as (
        fn: "accept_goods_receipt",
        args: { p_receipt_id: string }
      ) => Promise<{ data: null; error: unknown }>)("accept_goods_receipt", {
        p_receipt_id: receiptId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["bin-locations"] });
      toast.success("Goods receipt accepted. Bin counts updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePickingListStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const VALID = ["pending", "in_progress", "completed", "cancelled"] as const;
      if (!VALID.includes(status as any)) throw new Error(`Invalid picking list status: ${status}`);
      const TRANSITIONS: Record<string, string[]> = {
        pending: ["in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      // Resolve caller org for tenant isolation
      const { data: orgProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      const callerOrgId = orgProfile?.organization_id;
      if (!callerOrgId) throw new Error("Organization not found");

      const { data: current, error: cErr } = await supabase.from("picking_lists").select("status").eq("id", id).eq("organization_id", callerOrgId).single();
      if (cErr) throw cErr;
      const allowed = TRANSITIONS[(current as any).status] ?? [];
      if (!allowed.includes(status)) throw new Error(`Cannot transition picking list from "${(current as any).status}" to "${status}"`);
      const { error } = await supabase.from("picking_lists").update({ status } as any).eq("id", id).eq("organization_id", callerOrgId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["picking-lists"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
