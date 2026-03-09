import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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

export interface BOMCostRollup {
  bomId: string;
  totalMaterialCost: number;
  totalWithWastage: number;
  lineDetails: { material_name: string; quantity: number; unitCost: number; wastage_pct: number; effectiveCost: number }[];
}

export function useBOMs() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["boms", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from("bill_of_materials" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
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

/**
 * BOM Cost Rollup — calculates total material cost including wastage.
 * Uses item master pricing when available, otherwise returns 0 unit cost.
 */
export function useBOMCostRollup(bomId?: string) {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["bom-cost-rollup", bomId, orgId],
    enabled: !!bomId,
    queryFn: async (): Promise<BOMCostRollup | null> => {
      if (!bomId) return null;

      // Fetch BOM lines
      const { data: lines, error: lErr } = await supabase
        .from("bom_lines" as any).select("*").eq("bom_id", bomId).order("sort_order");
      if (lErr) throw lErr;
      if (!lines || lines.length === 0) return { bomId, totalMaterialCost: 0, totalWithWastage: 0, lineDetails: [] };

      // Fetch item prices for lines that reference items
      const itemIds = (lines as any[]).map((l: any) => l.item_id).filter(Boolean);
      let itemPrices: Record<string, number> = {};
      if (itemIds.length > 0) {
        const { data: items } = await supabase
          .from("items" as any).select("id, purchase_price, selling_price").in("id", itemIds);
        for (const item of (items || []) as any[]) {
          itemPrices[item.id] = Number(item.purchase_price || item.selling_price || 0);
        }
      }

      let totalMaterialCost = 0;
      let totalWithWastage = 0;
      const lineDetails = (lines as any[]).map((l: any) => {
        const unitCost = l.item_id ? (itemPrices[l.item_id] || 0) : 0;
        const baseCost = l.quantity * unitCost;
        const effectiveCost = baseCost * (1 + (l.wastage_pct || 0) / 100);
        totalMaterialCost += baseCost;
        totalWithWastage += effectiveCost;
        return {
          material_name: l.material_name,
          quantity: l.quantity,
          unitCost,
          wastage_pct: l.wastage_pct || 0,
          effectiveCost: Math.round(effectiveCost * 100) / 100,
        };
      });

      return { bomId, totalMaterialCost: Math.round(totalMaterialCost * 100) / 100, totalWithWastage: Math.round(totalWithWastage * 100) / 100, lineDetails };
    },
  });
}

export function useCreateBOM() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (bom: { product_name: string; product_item_id?: string; notes?: string; lines: { material_name: string; quantity: number; uom: string; wastage_pct: number; item_id?: string }[] }) => {
      if (!user) throw new Error("Not authenticated");
      if (!bom.product_name?.trim()) throw new Error("Product name is required.");
      if (!bom.lines || bom.lines.length === 0) throw new Error("At least one material line is required.");

      // Validate: no duplicate materials
      const names = bom.lines.map(l => l.material_name.toLowerCase().trim());
      const uniqueNames = new Set(names);
      if (uniqueNames.size !== names.length) {
        throw new Error("Duplicate materials in BOM lines. Each material should appear only once.");
      }

      // Validate: quantities must be positive
      if (bom.lines.some(l => l.quantity <= 0)) {
        throw new Error("All material quantities must be greater than zero.");
      }

      // Validate: wastage percentage bounds
      if (bom.lines.some(l => l.wastage_pct < 0 || l.wastage_pct > 100)) {
        throw new Error("Wastage percentage must be between 0% and 100%.");
      }

      // Validate: material names required
      if (bom.lines.some(l => !l.material_name?.trim())) {
        throw new Error("All BOM lines must have a material name.");
      }

      const bomCode = `BOM-${Date.now().toString(36).toUpperCase()}`;
      const { data: bomData, error: bomErr } = await supabase
        .from("bill_of_materials" as any)
        .insert({ bom_code: bomCode, product_name: bom.product_name.trim(), product_item_id: bom.product_item_id || null, notes: bom.notes || null, created_by: user.id } as any)
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
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["work-orders", orgId],
    queryFn: async () => {
      let q = supabase.from("work_orders" as any).select("*").order("created_at", { ascending: false });
      if (orgId) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
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
      if (!user) throw new Error("Not authenticated");
      if (!wo.product_name?.trim()) throw new Error("Product name is required");
      if (wo.planned_quantity <= 0) throw new Error("Planned quantity must be greater than zero.");
      if (wo.planned_start && wo.planned_end && wo.planned_start > wo.planned_end) {
        throw new Error("Planned start date cannot be after planned end date");
      }
      const validPriorities = ["low", "medium", "high", "urgent"];
      if (!validPriorities.includes(wo.priority)) throw new Error("Invalid priority level");

      const woNum = `WO-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from("work_orders" as any)
        .insert({ wo_number: woNum, product_name: wo.product_name, bom_id: wo.bom_id || null, product_item_id: wo.product_item_id || null, planned_quantity: wo.planned_quantity, priority: wo.priority, planned_start: wo.planned_start || null, planned_end: wo.planned_end || null, warehouse_id: wo.warehouse_id || null, notes: wo.notes || null, created_by: user.id } as any)
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-orders"] }); toast.success("Work order created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

const VALID_WO_STATUSES = ["draft", "planned", "in_progress", "completed", "cancelled", "on_hold"] as const;
const WO_TRANSITIONS: Record<string, string[]> = {
  draft: ["planned", "cancelled"],
  planned: ["in_progress", "cancelled", "on_hold"],
  in_progress: ["completed", "on_hold", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
};

export function useUpdateWOStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      if (!VALID_WO_STATUSES.includes(status as any)) throw new Error(`Invalid work order status: ${status}`);

      // Verify transition is allowed
      const { data: current } = await supabase.from("work_orders" as any).select("status").eq("id", id).maybeSingle();
      const currentStatus = (current as any)?.status;
      if (currentStatus && WO_TRANSITIONS[currentStatus] && !WO_TRANSITIONS[currentStatus].includes(status)) {
        throw new Error(`Cannot transition work order from '${currentStatus}' to '${status}'`);
      }

      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === "in_progress" && !(current as any)?.actual_start) updates.actual_start = new Date().toISOString();
      if (status === "completed") {
        updates.actual_end = new Date().toISOString();
        // Validate: completed_quantity should be > 0 for completion
        const wo = current as any;
        if (wo && Number(wo.completed_quantity || 0) === 0) {
          throw new Error("Cannot mark work order as completed with zero completed quantity. Record production first.");
        }
      }
      const { error } = await supabase.from("work_orders" as any).update(updates).eq("id", id);
      if (error) throw error;

      // ── Auto-consume BOM materials on completion ──
      if (status === "completed") {
        const { consumeBOMForWorkOrder } = await import("@/lib/stock-ledger-sync");
        try {
          await consumeBOMForWorkOrder(id);
        } catch (consumeErr: any) {
          console.warn("BOM auto-consumption warning:", consumeErr.message);
          // Don't fail the status change, but notify
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
