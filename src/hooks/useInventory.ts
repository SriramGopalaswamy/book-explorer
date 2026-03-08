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
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("items" as any).select("*").order("name");
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (item: Record<string, any>) => {
      if (!user) throw new Error("Not authenticated");
      if (!item.name?.trim()) throw new Error("Item name is required");
      if (item.selling_price !== undefined && item.selling_price < 0) throw new Error("Selling price cannot be negative");
      if (item.purchase_price !== undefined && item.purchase_price < 0) throw new Error("Purchase price cannot be negative");
      const { data, error } = await supabase.from("items" as any).insert(item).select().single();
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
      const { error } = await supabase.from("items" as any).update(updates).eq("id", id);
      if (error) throw error;
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
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Warehouses ───

export function useWarehouses() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["warehouses", orgId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("warehouses" as any).select("*").order("name");
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wh: Record<string, any>) => {
      const { data, error } = await supabase.from("warehouses" as any).insert(wh).select().single();
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
      const { error } = await supabase.from("warehouses" as any).update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Warehouse updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouses" as any).delete().eq("id", id);
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

export function useStockLedger(itemId?: string, warehouseId?: string) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["stock-ledger", itemId, warehouseId, orgId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("stock_ledger" as any).select("*").order("posted_at", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      if (itemId) q = q.eq("item_id", itemId);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data as any[];
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
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("stock_adjustments" as any).select("*").order("created_at", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adj: Record<string, any>) => {
      const { data, error } = await supabase.from("stock_adjustments" as any).insert(adj).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
      toast.success("Stock adjustment created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── UOM ───

export function useUOM() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["uom"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units_of_measure" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateUOM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uom: Record<string, any>) => {
      const { data, error } = await supabase.from("units_of_measure" as any).insert(uom).select().single();
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
