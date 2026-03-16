/**
 * Stock Ledger Auto-Sync — creates stock_ledger entries when
 * operational documents reach terminal states:
 *   - GR accepted  → stock IN at PO warehouse
 *   - DN delivered  → stock OUT from SO warehouse
 *   - Transfer received → stock OUT from source, stock IN to destination
 */
import { supabase } from "@/integrations/supabase/client";

interface StockEntry {
  item_id: string;
  warehouse_id: string;
  quantity: number;
  entry_type: "in" | "out" | "adjustment";
  reference_type: string;
  reference_id: string;
  notes?: string;
  organization_id?: string;
}

function deriveTransactionType(e: StockEntry): string {
  if (e.entry_type === "adjustment") return "adjustment";
  if (e.reference_type === "goods_receipt") return "purchase";
  if (e.reference_type === "delivery_note") return "sale";
  if (e.reference_type === "stock_transfer") return e.entry_type === "in" ? "transfer_in" : "transfer_out";
  if (e.reference_type === "work_order") return e.entry_type === "out" ? "production_out" : "production_in";
  return e.entry_type === "in" ? "purchase" : "sale";
}

async function postStockEntries(entries: StockEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const rows = entries.map((e) => ({
    item_id: e.item_id,
    warehouse_id: e.warehouse_id,
    quantity: e.entry_type === "out" ? -Math.abs(e.quantity) : Math.abs(e.quantity),
    transaction_type: deriveTransactionType(e),
    reference_type: e.reference_type,
    reference_id: e.reference_id,
    notes: e.notes || null,
    posted_at: new Date().toISOString(),
    ...(e.organization_id ? { organization_id: e.organization_id } : {}),
  }));

  const { error } = await supabase.from("stock_ledger" as any).insert(rows as any);
  if (error) throw error;
}

/**
 * Post stock-in entries when a Goods Receipt is accepted.
 */
export async function postGoodsReceiptStock(goodsReceiptId: string): Promise<void> {
  // Fetch GR items
  const { data: grItems, error: grErr } = await supabase
    .from("goods_receipt_items" as any)
    .select("item_id, quantity_received")
    .eq("goods_receipt_id", goodsReceiptId);
  if (grErr) throw grErr;
  if (!grItems || grItems.length === 0) return;

  // Fetch GR → PO → warehouse + organization_id
  const { data: gr } = await supabase
    .from("goods_receipts" as any)
    .select("purchase_order_id, organization_id")
    .eq("id", goodsReceiptId)
    .single();
  if (!gr) return;
  const grOrgId = (gr as any).organization_id;

  const { data: po } = await supabase
    .from("purchase_orders" as any)
    .select("warehouse_id")
    .eq("id", (gr as any).purchase_order_id)
    .maybeSingle();

  // Find a default warehouse if PO doesn't specify one — org-scoped
  let warehouseId = (po as any)?.warehouse_id;
  if (!warehouseId && grOrgId) {
    const { data: defaultWh } = await supabase
      .from("warehouses" as any)
      .select("id")
      .eq("organization_id", grOrgId)
      .limit(1);
    warehouseId = (defaultWh as any)?.[0]?.id;
  }
  if (!warehouseId) return; // No warehouse, skip

  const entries: StockEntry[] = (grItems as any[])
    .filter((i: any) => i.item_id)
    .map((i: any) => ({
      item_id: i.item_id,
      warehouse_id: warehouseId,
      quantity: Number(i.quantity_received),
      entry_type: "in" as const,
      reference_type: "goods_receipt",
      reference_id: goodsReceiptId,
      notes: `Auto stock-in from GR ${goodsReceiptId.slice(0, 8)}`,
      organization_id: grOrgId,
    }));

  await postStockEntries(entries);
}

/**
 * Post stock-out entries when a Delivery Note is delivered.
 */
export async function postDeliveryNoteStock(deliveryNoteId: string): Promise<void> {
  const { data: dnItems, error: dnErr } = await supabase
    .from("delivery_note_items" as any)
    .select("item_id, shipped_quantity")
    .eq("delivery_note_id", deliveryNoteId);
  if (dnErr) throw dnErr;
  if (!dnItems || dnItems.length === 0) return;

  // Fetch DN's organization for org-scoped warehouse lookup
  const { data: dn } = await supabase
    .from("delivery_notes" as any)
    .select("organization_id")
    .eq("id", deliveryNoteId)
    .maybeSingle();
  const dnOrgId = (dn as any)?.organization_id;

  // Find a default warehouse — org-scoped
  let warehouseId: string | undefined;
  if (dnOrgId) {
    const { data: defaultWh } = await supabase
      .from("warehouses" as any)
      .select("id")
      .eq("organization_id", dnOrgId)
      .limit(1);
    warehouseId = (defaultWh as any)?.[0]?.id;
  }
  if (!warehouseId) return;

  const entries: StockEntry[] = (dnItems as any[])
    .filter((i: any) => i.item_id)
    .map((i: any) => ({
      item_id: i.item_id,
      warehouse_id: warehouseId,
      quantity: Number(i.shipped_quantity || i.quantity),
      entry_type: "out" as const,
      reference_type: "delivery_note",
      reference_id: deliveryNoteId,
      notes: `Auto stock-out from DN ${deliveryNoteId.slice(0, 8)}`,
      organization_id: dnOrgId,
    }));

  await postStockEntries(entries);
}

/**
 * Post stock transfer entries when a transfer is received.
 */
export async function postStockTransferEntries(
  transferId: string,
  fromWarehouseId: string,
  toWarehouseId: string
): Promise<void> {
  const { data: items, error } = await supabase
    .from("stock_transfer_items" as any)
    .select("item_id, item_name, quantity")
    .eq("transfer_id", transferId);
  if (error) throw error;
  if (!items || items.length === 0) return;

  const entries: StockEntry[] = [];
  for (const item of items as any[]) {
    if (!item.item_id) continue;
    entries.push({
      item_id: item.item_id,
      warehouse_id: fromWarehouseId,
      quantity: Number(item.quantity),
      entry_type: "out",
      reference_type: "stock_transfer",
      reference_id: transferId,
      notes: `Transfer out: ${item.item_name}`,
    });
    entries.push({
      item_id: item.item_id,
      warehouse_id: toWarehouseId,
      quantity: Number(item.quantity),
      entry_type: "in",
      reference_type: "stock_transfer",
      reference_id: transferId,
      notes: `Transfer in: ${item.item_name}`,
    });
  }

  await postStockEntries(entries);
}

/**
 * Auto-consume BOM materials when a Work Order is completed.
 * Deducts (quantity_per_unit × completed_quantity × (1 + wastage_pct/100))
 * from the WO warehouse (or default warehouse).
 */
export async function consumeBOMForWorkOrder(workOrderId: string): Promise<void> {
  // Fetch work order details
  const { data: wo, error: woErr } = await supabase
    .from("work_orders" as any)
    .select("id, bom_id, completed_quantity, warehouse_id")
    .eq("id", workOrderId)
    .single();
  if (woErr || !wo) return;
  const woData = wo as any;
  if (!woData.bom_id || Number(woData.completed_quantity) <= 0) return;

  // Fetch BOM lines
  const { data: lines, error: lErr } = await supabase
    .from("bom_lines" as any)
    .select("item_id, material_name, quantity, wastage_pct")
    .eq("bom_id", woData.bom_id);
  if (lErr || !lines || lines.length === 0) return;

  // Resolve warehouse — org-scoped
  let warehouseId = woData.warehouse_id;
  const { data: woFull } = await supabase.from("work_orders" as any).select("organization_id").eq("id", workOrderId).maybeSingle();
  const woOrgId = (woFull as any)?.organization_id;
  if (!warehouseId && woOrgId) {
    const { data: defaultWh } = await supabase.from("warehouses" as any).select("id").eq("organization_id", woOrgId).limit(1);
    warehouseId = (defaultWh as any)?.[0]?.id;
  }
  if (!warehouseId) return;

  const entries: StockEntry[] = (lines as any[])
    .filter((l: any) => l.item_id)
    .map((l: any) => {
      const effectiveQty = l.quantity * Number(woData.completed_quantity) * (1 + (l.wastage_pct || 0) / 100);
      return {
        item_id: l.item_id,
        warehouse_id: warehouseId,
        quantity: Math.round(effectiveQty * 100) / 100,
        entry_type: "out" as const,
        reference_type: "work_order",
        reference_id: workOrderId,
        notes: `BOM consumption: ${l.material_name}`,
        organization_id: woOrgId,
      };
    });

  await postStockEntries(entries);

  // Also insert into material_consumption table for tracking
  const consumptionRecords = (lines as any[]).map((l: any) => {
    const plannedQty = l.quantity * Number(woData.completed_quantity);
    const wastageQty = plannedQty * (l.wastage_pct || 0) / 100;
    const actualQty = plannedQty + wastageQty;
    return {
      work_order_id: workOrderId,
      material_name: l.material_name,
      planned_quantity: Math.round(plannedQty * 100) / 100,
      actual_quantity: Math.round(actualQty * 100) / 100,
      wastage_quantity: Math.round(wastageQty * 100) / 100,
      consumed_at: new Date().toISOString(),
    };
  });

  if (consumptionRecords.length > 0) {
    await supabase.from("material_consumption" as any).insert(consumptionRecords as any);
  }
}

/**
 * Check items below reorder level and return alerts.
 */
export async function checkReorderAlerts(organizationId: string): Promise<
  { itemId: string; itemName: string; currentStock: number; reorderLevel: number }[]
> {
  // Get items with reorder_level set
  const { data: items, error: iErr } = await supabase
    .from("items" as any)
    .select("id, name, reorder_level")
    .eq("organization_id", organizationId)
    .gt("reorder_level", 0);
  if (iErr || !items || items.length === 0) return [];

  // Batch: fetch ALL stock ledger entries for the org in one query (eliminates N+1)
  const itemIds = (items as any[]).map((i: any) => i.id);
  const { data: allLedger } = await supabase
    .from("stock_ledger" as any)
    .select("item_id, quantity")
    .eq("organization_id", organizationId)
    .in("item_id", itemIds);

  // Aggregate stock by item_id
  const stockMap = new Map<string, number>();
  for (const entry of (allLedger || []) as any[]) {
    stockMap.set(entry.item_id, (stockMap.get(entry.item_id) || 0) + Number(entry.quantity));
  }

  const alerts: { itemId: string; itemName: string; currentStock: number; reorderLevel: number }[] = [];
  for (const item of items as any[]) {
    const currentStock = stockMap.get(item.id) || 0;
    if (currentStock <= Number(item.reorder_level)) {
      alerts.push({
        itemId: item.id,
        itemName: item.name,
        currentStock,
        reorderLevel: Number(item.reorder_level),
      });
    }
  }
  return alerts;
}
