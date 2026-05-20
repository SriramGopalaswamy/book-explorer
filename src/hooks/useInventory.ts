import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

// ─── Items ───

export function useItems() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["items", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("items").select("*").eq("organization_id", orgId).order("name").limit(500);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async (item: Record<string, any>) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      if (!item.name?.trim()) throw new Error("Item name is required");
      if (item.selling_price !== undefined && item.selling_price < 0) throw new Error("Selling price cannot be negative");
      if (item.purchase_price !== undefined && item.purchase_price < 0) throw new Error("Purchase price cannot be negative");
      const { data, error } = await (supabase.from("items") as any).insert({ ...item, organization_id: orgId, created_by: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any>) => {
      if (!user) throw new Error("Not authenticated");
      if (updates.selling_price !== undefined && updates.selling_price < 0) throw new Error("Selling price cannot be negative");
      if (updates.purchase_price !== undefined && updates.purchase_price < 0) throw new Error("Purchase price cannot be negative");
      // GBC-147: current_stock is managed by stock_ledger triggers; never overwrite via edit form
      delete updates.current_stock;
      const orgId = (await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()).data?.organization_id;
      if (!orgId) throw new Error("No organization found");
      const { data, error } = await supabase.from("items").update(updates).eq("id", id).eq("organization_id", orgId).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Item update failed — no rows were modified");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");

      // Resolve caller org for tenant isolation
      const orgId = (await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()).data?.organization_id;
      if (!orgId) throw new Error("No organization found");

      // Prevent deleting items with stock ledger entries (org-scoped)
      const { data: ledgerEntries, error: ledgerErr } = await supabase
        .from("stock_ledger")
        .select("id")
        .eq("item_id", id)
        .eq("organization_id", orgId)
        .limit(1);
      if (ledgerErr) throw ledgerErr;
      if (ledgerEntries && ledgerEntries.length > 0) {
        throw new Error("Cannot delete an item with existing stock movements. Deactivate it instead.");
      }
      const { error } = await supabase.from("items").delete().eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item deleted");
    },
  });
}

// ─── Warehouses ───

export function useWarehouses() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["warehouses", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("warehouses").select("*").eq("organization_id", orgId).order("name");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async (wh: Record<string, any>) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      if (!wh.name?.trim()) throw new Error("Warehouse name is required");
      const { data, error } = await (supabase.from("warehouses") as any).insert({ ...wh, organization_id: orgId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Warehouse created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const orgId = (await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()).data?.organization_id;
      if (!orgId) throw new Error("No organization found");
      const { error } = await supabase.from("warehouses").update(updates).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Warehouse updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSetDefaultWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const orgId = (await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()).data?.organization_id;
      if (!orgId) throw new Error("No organization found");

      // NOT FULLY ATOMIC client-side. Supabase REST cannot run a CASE WHEN
      // SET expression nor a multi-statement transaction. We sequence:
      //   1. promote the target row to default (idempotent if it already was);
      //   2. demote every other row in the org.
      // Order matters — step 1 first means the org never has zero defaults
      // mid-operation; the worst-case race is "two rows are default for ms"
      // which is preferable to "zero rows are default for ms" because reads
      // that key off `is_default` still return a sensible row.
      // Proper fix is a server-side SQL function (set_default_warehouse RPC);
      // tracked under GBC-56 needs-input + the _LOVABLE_PROMPT.md migration.
      const { error: setErr } = await supabase
        .from("warehouses")
        .update({ is_default: true })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (setErr) throw setErr;
      const { error: clearErr } = await supabase
        .from("warehouses")
        .update({ is_default: false })
        .eq("organization_id", orgId)
        .neq("id", id);
      if (clearErr) throw clearErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Default warehouse updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Resolve caller org for tenant isolation
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const orgId = (await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()).data?.organization_id;
      if (!orgId) throw new Error("No organization found");

      // Prevent deleting warehouses with stock (org-scoped)
      const { data: stock, error: stockErr } = await supabase
        .from("stock_ledger")
        .select("id")
        .eq("warehouse_id", id)
        .eq("organization_id", orgId)
        .limit(1);
      if (stockErr) throw stockErr;
      if (stock && stock.length > 0) {
        throw new Error("Cannot delete a warehouse with existing stock entries. Transfer stock out first.");
      }

      const { error } = await supabase.from("warehouses").delete().eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Warehouse deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Stock Ledger ───

// ─── Inventory Item KPIs (server-side — GBC-148) ────────────────────────────
export interface InventoryKpis {
  totalSkus: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;
}

export function useInventoryKpis() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["inventory-kpis", orgId],
    enabled: !!user && !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<InventoryKpis> => {
      if (!orgId) return { totalSkus: 0, lowStock: 0, outOfStock: 0, stockValue: 0 };
      const { data, error } = await supabase.rpc("get_inventory_kpi_stats", { p_org_id: orgId });
      if (error) throw error;
      const d = (data ?? {}) as Record<string, number>;
      return {
        totalSkus: Number(d.total_skus ?? 0),
        lowStock: Number(d.low_stock ?? 0),
        outOfStock: Number(d.out_of_stock ?? 0),
        stockValue: Number(d.stock_value ?? 0),
      };
    },
  });
}

// ─── Stock Ledger KPIs (server-side, not limited to the loaded window) ──────
export interface StockLedgerKpis {
  totalEntries: number;
  stockIn: number;
  stockOut: number;
}

export function useStockLedgerKpis(itemId?: string, warehouseId?: string) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["stock-ledger-kpis", itemId, warehouseId, orgId],
    enabled: !!user && !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<StockLedgerKpis> => {
      if (!orgId) return { totalEntries: 0, stockIn: 0, stockOut: 0 };
      const { data, error } = await (supabase.rpc as any)("get_stock_ledger_kpis", {
        p_org_id: orgId,
        p_item_id: itemId ?? null,
        p_warehouse_id: warehouseId ?? null,
      });
      if (error) throw error;
      const d = (data ?? {}) as Record<string, number>;
      return {
        totalEntries: Number(d.total_entries ?? 0),
        stockIn: Number(d.stock_in ?? 0),
        stockOut: Number(d.stock_out ?? 0),
      };
    },
  });
}

export function useStockLedger(itemId?: string, warehouseId?: string) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["stock-ledger", itemId, warehouseId, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      try {
        // GBC-27: explicit column list. stock_ledger can grow into millions of rows
        // for active warehouses; this trims ~30% of bytes per row vs select("*").
        let q = supabase
          .from("stock_ledger")
          .select(
            "id, organization_id, item_id, warehouse_id, transaction_type, " +
            "quantity, rate, value, balance_qty, balance_value, " +
            "reference_type, reference_id, notes, posted_by, posted_at",
          )
          .eq("organization_id", orgId)
          .order("posted_at", { ascending: false });
        if (itemId) q = q.eq("item_id", itemId);
        if (warehouseId) q = q.eq("warehouse_id", warehouseId);
        const { data, error } = await q.limit(500);
        if (error) {
          if (error.message?.includes("relation") && error.message?.includes("does not exist")) {
            console.warn("Stock ledger table not found - returning empty array");
            return [];
          }
          throw error;
        }
        return data as any[];
      } catch (err: any) {
        console.error("Stock ledger query error:", err);
        throw new Error(err.message || "Failed to load stock ledger. The table may not be set up yet.");
      }
    },
  });
}

// ─── Stock Adjustments ───

export function useStockAdjustments() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["stock-adjustments", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("stock_adjustments").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateStockAdjustment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async (adj: Record<string, any>) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      if (!adj.reason?.trim()) throw new Error("A reason is required for stock adjustments.");

      const { data, error } = await (supabase.from("stock_adjustments") as any).insert({ ...adj, organization_id: orgId, created_by: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      toast.success("Stock adjustment created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── UOM ───

export function useUOM() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  return useQuery({
    queryKey: ["uom", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("units_of_measure")
        .select("*")
        .eq("organization_id", orgId)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateUOM() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async (uom: Record<string, any>) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      const { data, error } = await (supabase.from("units_of_measure") as any).insert({ ...uom, organization_id: orgId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uom"] });
      toast.success("Unit of measure created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Reorder Alerts ───

export function useReorderAlerts() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["reorder-alerts", orgId],
    enabled: !!user && !!orgId,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
    queryFn: async () => {
      const { checkReorderAlerts } = await import("@/lib/stock-ledger-sync");
      return checkReorderAlerts(orgId!);
    },
  });
}
