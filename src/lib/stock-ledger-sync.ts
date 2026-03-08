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
    // Stock OUT from source warehouse
    entries.push({
      item_id: item.item_id,
      warehouse_id: fromWarehouseId,
      quantity: Number(item.quantity),
      entry_type: "out",
      reference_type: "stock_transfer",
      reference_id: transferId,
      notes: `Transfer out: ${item.item_name}`,
    });
    // Stock IN to destination warehouse
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
