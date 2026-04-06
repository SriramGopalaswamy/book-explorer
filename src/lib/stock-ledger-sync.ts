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
  rate?: number;
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

  // Fetch item rates for all unique items to populate rate/value fields
  const uniqueItemIds = [...new Set(entries.map((e) => e.item_id).filter(Boolean))];
  let itemRateMap: Map<string, number> = new Map();
  if (uniqueItemIds.length > 0) {
    const { data: itemData } = await supabase
      .from("items" as any)
      .select("id, purchase_price, selling_price")
      .in("id", uniqueItemIds);
    if (itemData) {
      for (const item of itemData as any[]) {
        const rate = Number(item.purchase_price || item.selling_price || 0);
        if (rate > 0) itemRateMap.set(item.id, rate);
      }
    }
  }

  // Fetch current balance_qty per item+warehouse to compute running balance
  const balanceMap: Map<string, number> = new Map();
  const uniquePairs = [...new Set(entries.map((e) => `${e.item_id}__${e.warehouse_id}`))];
  // Derive org from the first entry that carries one (all entries in a batch share the same org)
  const orgId = entries.find((e) => e.organization_id)?.organization_id;

  for (const pair of uniquePairs) {
    const [itemId, warehouseId] = pair.split("__");
    let q = supabase
      .from("stock_ledger" as any)
      .select("balance_qty")
      .eq("item_id", itemId)
      .eq("warehouse_id", warehouseId);
    if (orgId) q = (q as any).eq("organization_id", orgId);
    const { data: lastEntry } = await (q as any)
      .order("posted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    balanceMap.set(pair, Number((lastEntry as any)?.balance_qty ?? 0));
  }

  const rows = entries.map((e) => {
    const signedQty = e.entry_type === "out" ? -Math.abs(e.quantity) : Math.abs(e.quantity);
    const rate = e.rate ?? itemRateMap.get(e.item_id) ?? null;
    const value = rate != null ? Math.abs(signedQty) * rate : null;
    const pair = `${e.item_id}__${e.warehouse_id}`;
    const prevBalance = balanceMap.get(pair) ?? 0;
    const newBalance = prevBalance + signedQty;
    balanceMap.set(pair, newBalance);
    return {
      item_id: e.item_id,
      warehouse_id: e.warehouse_id,
      quantity: signedQty,
      transaction_type: deriveTransactionType(e),
      reference_type: e.reference_type,
      reference_id: e.reference_id,
      notes: e.notes || null,
      posted_at: new Date().toISOString(),
      balance_qty: newBalance,
      rate: rate ?? 0,
      value: value ?? 0,
      ...(e.organization_id ? { organization_id: e.organization_id } : {}),
    };
  });

  const { error } = await supabase.from("stock_ledger" as any).insert(rows as any);
  if (error) throw error;

  // Update items.current_stock to reflect actual ledger balance (per item across all warehouses)
  const itemStockDeltas: Map<string, number> = new Map();
  for (const e of entries) {
    const signedQty = e.entry_type === "out" ? -Math.abs(e.quantity) : Math.abs(e.quantity);
    itemStockDeltas.set(e.item_id, (itemStockDeltas.get(e.item_id) ?? 0) + signedQty);
  }
  for (const [itemId, delta] of itemStockDeltas) {
    if (delta === 0) continue;
    // Fetch current stock and add delta
    const { data: itemRow } = await supabase
      .from("items" as any)
      .select("current_stock")
      .eq("id", itemId)
      .maybeSingle();
    const currentStock = Number((itemRow as any)?.current_stock ?? 0);
    const { error: stockUpdateErr } = await supabase
      .from("items" as any)
      .update({ current_stock: currentStock + delta } as any)
      .eq("id", itemId);
    if (stockUpdateErr) throw new Error(`Failed to update stock count for item ${itemId}: ${stockUpdateErr.message}`);
  }
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

  // Fetch organization_id from the transfer record so ledger rows are org-scoped
  const { data: transfer } = await supabase
    .from("stock_transfers" as any)
    .select("organization_id")
    .eq("id", transferId)
    .maybeSingle();
  const transferOrgId = (transfer as any)?.organization_id as string | undefined;

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
      organization_id: transferOrgId,
    });
    entries.push({
      item_id: item.item_id,
      warehouse_id: toWarehouseId,
      quantity: Number(item.quantity),
      entry_type: "in",
      reference_type: "stock_transfer",
      reference_id: transferId,
      notes: `Transfer in: ${item.item_name}`,
      organization_id: transferOrgId,
    });
  }

  await postStockEntries(entries);
}

/**
 * Auto-consume BOM materials when a Work Order is completed.
 * Deducts (quantity_per_unit × completed_quantity × (1 + wastage_pct/100))
 * from the WO warehouse (or default warehouse).
 *
 * Returns "no_bom" when no BOM is linked (caller should warn the user),
 * "ok" when consumption records were written successfully.
 */
export async function consumeBOMForWorkOrder(workOrderId: string): Promise<"ok" | "no_bom"> {
  // Fetch work order details
  const { data: wo, error: woErr } = await supabase
    .from("work_orders" as any)
    .select("id, bom_id, completed_quantity, warehouse_id")
    .eq("id", workOrderId)
    .single();
  if (woErr || !wo) return "no_bom";
  const woData = wo as any;
  if (!woData.bom_id || Number(woData.completed_quantity) <= 0) return "no_bom";

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
      organization_id: woOrgId,
      material_name: l.material_name,
      planned_quantity: Math.round(plannedQty * 100) / 100,
      actual_quantity: Math.round(actualQty * 100) / 100,
      wastage_quantity: Math.round(wastageQty * 100) / 100,
      consumed_at: new Date().toISOString(),
    };
  });

  if (consumptionRecords.length > 0) {
    // Delete any existing consumption records for this WO first (prevents duplicates
    // when both useRecordProduction and consumeBOMForWorkOrder are called)
    const { error: delErr } = await supabase
      .from("material_consumption" as any)
      .delete()
      .eq("work_order_id", workOrderId)
      .eq("organization_id", woOrgId);
    if (delErr) throw new Error(`Failed to clear existing consumption records: ${delErr.message}`);
    const { error: mcErr } = await supabase
      .from("material_consumption" as any)
      .insert(consumptionRecords as any);
    if (mcErr) throw new Error(`Failed to write consumption records: ${mcErr.message}`);
  }
  return "ok";
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
