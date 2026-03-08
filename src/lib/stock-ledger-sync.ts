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
}

async function postStockEntries(entries: StockEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const rows = entries.map((e) => ({
    item_id: e.item_id,
    warehouse_id: e.warehouse_id,
    quantity: e.entry_type === "out" ? -Math.abs(e.quantity) : Math.abs(e.quantity),
    entry_type: e.entry_type,
    reference_type: e.reference_type,
    reference_id: e.reference_id,
    notes: e.notes || null,
    posted_at: new Date().toISOString(),
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

  // Fetch GR → PO → warehouse
  const { data: gr } = await supabase
    .from("goods_receipts" as any)
    .select("purchase_order_id")
    .eq("id", goodsReceiptId)
    .single();
  if (!gr) return;

  const { data: po } = await supabase
    .from("purchase_orders" as any)
    .select("warehouse_id")
    .eq("id", (gr as any).purchase_order_id)
    .maybeSingle();

  // Find a default warehouse if PO doesn't specify one
  let warehouseId = (po as any)?.warehouse_id;
  if (!warehouseId) {
    const { data: defaultWh } = await supabase
      .from("warehouses" as any)
      .select("id")
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

  // Find a default warehouse (SO doesn't always have one)
  const { data: defaultWh } = await supabase
    .from("warehouses" as any)
    .select("id")
    .limit(1);
  const warehouseId = (defaultWh as any)?.[0]?.id;
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

  // Resolve warehouse
  let warehouseId = woData.warehouse_id;
  if (!warehouseId) {
    const { data: defaultWh } = await supabase.from("warehouses" as any).select("id").limit(1);
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
      };
    });

  await postStockEntries(entries);
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

  // For each item, calculate current stock from stock_ledger
  const alerts: { itemId: string; itemName: string; currentStock: number; reorderLevel: number }[] = [];
  for (const item of items as any[]) {
    const { data: ledger } = await supabase
      .from("stock_ledger" as any)
      .select("quantity")
      .eq("item_id", item.id)
      .eq("organization_id", organizationId);
    const currentStock = (ledger || []).reduce((sum: number, e: any) => sum + Number(e.quantity), 0);
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
