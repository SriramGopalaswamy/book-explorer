import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface BOM {
  id: string;
  organization_id: string;
  bom_code: string;
  product_item_id: string | null;
  product_name: string;
  version: number;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BOMLine {
  id: string;
  bom_id: string;
  item_id: string | null;
  material_name: string;
  quantity: number;
  uom: string;
  wastage_pct: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface WorkOrder {
  id: string;
  organization_id: string;
  wo_number: string;
  bom_id: string | null;
  product_item_id: string | null;
  product_name: string;
  planned_quantity: number;
  completed_quantity: number;
  rejected_quantity: number;
  status: string;
  priority: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  warehouse_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useBOMs() {
  return useQuery({
    queryKey: ["boms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bill_of_materials" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BOM[];
    },
  });
}

export function useBOMLines(bomId?: string) {
  return useQuery({
    queryKey: ["bom-lines", bomId],
    enabled: !!bomId,
    queryFn: async () => {
      const { data, error } = await supabase.from("bom_lines" as any).select("*").eq("bom_id", bomId!).order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as BOMLine[];
    },
  });
}

export function useCreateBOM() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (bom: { product_name: string; product_item_id?: string; notes?: string; lines: { material_name: string; quantity: number; uom: string; wastage_pct: number; item_id?: string }[] }) => {
      const bomCode = `BOM-${Date.now().toString(36).toUpperCase()}`;
      const { data: bomData, error: bomErr } = await supabase
        .from("bill_of_materials" as any)
        .insert({ bom_code: bomCode, product_name: bom.product_name, product_item_id: bom.product_item_id || null, notes: bom.notes || null, created_by: user?.id } as any)
        .select().single();
      if (bomErr) throw bomErr;

      if (bom.lines.length > 0) {
        const lines = bom.lines.map((l, i) => ({ bom_id: (bomData as any).id, material_name: l.material_name, quantity: l.quantity, uom: l.uom, wastage_pct: l.wastage_pct, item_id: l.item_id || null, sort_order: i }));
        const { error } = await supabase.from("bom_lines" as any).insert(lines as any);
        if (error) throw error;
      }
      return bomData;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["boms"] }); toast.success("BOM created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ["work-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_orders" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkOrder[];
    },
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (wo: { product_name: string; bom_id?: string; product_item_id?: string; planned_quantity: number; priority: string; planned_start?: string; planned_end?: string; warehouse_id?: string; notes?: string }) => {
      const woNum = `WO-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from("work_orders" as any)
        .insert({ wo_number: woNum, product_name: wo.product_name, bom_id: wo.bom_id || null, product_item_id: wo.product_item_id || null, planned_quantity: wo.planned_quantity, priority: wo.priority, planned_start: wo.planned_start || null, planned_end: wo.planned_end || null, warehouse_id: wo.warehouse_id || null, notes: wo.notes || null, created_by: user?.id } as any)
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-orders"] }); toast.success("Work order created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateWOStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === "in_progress" && !updates.actual_start) updates.actual_start = new Date().toISOString();
      if (status === "completed") updates.actual_end = new Date().toISOString();
      const { error } = await supabase.from("work_orders" as any).update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-orders"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}
