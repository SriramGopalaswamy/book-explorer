/**
 * Inventory Tools
 *
 * Covers: item master, stock levels, stock ledger, warehouses,
 * bin locations, stock adjustments, low-stock alerts.
 *
 * Maps to Supabase tables:
 *   inventory_items, stock_ledger, warehouses, bin_locations, stock_transfers
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const inventoryTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "get_inventory_levels",
    description:
      "Return current stock levels for all items or a specific item/warehouse. " +
      "Answers 'Which products are low on stock?'",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        item_id: { type: "string", description: "Filter by specific item UUID" },
        warehouse_id: { type: "string" },
        limit: { type: "number", default: 100 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("inventory_items")
          .select("id, sku, name, quantity_on_hand, reorder_level, unit, warehouse_id, category")
          .order("quantity_on_hand", { ascending: true })
          .limit((args.limit as number) ?? 100);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.item_id) q = q.eq("id", args.item_id as string);
        if (args.warehouse_id) q = q.eq("warehouse_id", args.warehouse_id as string);

        const data = await query(() => q) as Array<{
          quantity_on_hand: number;
          reorder_level: number;
        }>;

        const lowStock = data.filter(
          (i) => i.quantity_on_hand <= (i.reorder_level ?? 0)
        );

        return ok({
          items: data,
          total_items: data.length,
          low_stock_count: lowStock.length,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_low_stock_items",
    description:
      "Return items that are at or below their reorder level. " +
      "Critical for procurement planning.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        warehouse_id: { type: "string" },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("inventory_items")
          .select("id, sku, name, quantity_on_hand, reorder_level, reorder_quantity, unit, category")
          .filter("quantity_on_hand", "lte", "reorder_level") // column comparison
          .order("quantity_on_hand", { ascending: true });

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.warehouse_id) q = q.eq("warehouse_id", args.warehouse_id as string);

        const data = await query(() => q);
        return ok({ low_stock_items: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_stock_ledger",
    description:
      "Get stock movement history for an item — receipts, issues, adjustments, transfers.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        item_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 100 },
      },
      required: ["item_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("stock_ledger")
          .select("*")
          .eq("item_id", args.item_id as string)
          .order("date", { ascending: false })
          .limit((args.limit as number) ?? 100);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.start_date) q = q.gte("date", args.start_date as string);
        if (args.end_date) q = q.lte("date", args.end_date as string);

        const data = await query(() => q);
        return ok({ stock_movements: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "create_stock_adjustment",
    description:
      "Record a stock adjustment (increase or decrease) with a reason. " +
      "Used for physical count reconciliation, damage write-offs, etc.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        item_id: { type: "string" },
        warehouse_id: { type: "string" },
        adjustment_type: {
          type: "string",
          enum: ["increase", "decrease"],
        },
        quantity: { type: "number", description: "Positive quantity to add or subtract" },
        reason: {
          type: "string",
          enum: ["physical_count", "damage", "theft", "expiry", "correction", "other"],
        },
        notes: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["item_id", "adjustment_type", "quantity", "reason"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const qty =
          args.adjustment_type === "decrease"
            ? -(args.quantity as number)
            : (args.quantity as number);

        const adjustment = await query(() =>
          db()
            .from("stock_adjustments")
            .insert({
              organization_id: orgId,
              item_id: args.item_id,
              warehouse_id: args.warehouse_id,
              quantity: qty,
              adjustment_type: args.adjustment_type,
              reason: args.reason,
              notes: args.notes,
              date: args.date ?? new Date().toISOString().split("T")[0],
              created_at: new Date().toISOString(),
            })
            .select()
            .single()
        );

        return ok({ adjustment });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 5
  {
    name: "get_warehouse_summary",
    description:
      "Summarise stock across all warehouses: item count, total value, utilisation.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let wq = db().from("warehouses").select("id, name, location, capacity");
        if (orgId) wq = wq.eq("organization_id", orgId);
        const warehouses = await query(() => wq) as Array<{ id: string; name: string; capacity?: number }>;

        let iq = db()
          .from("inventory_items")
          .select("warehouse_id, quantity_on_hand, unit_cost");
        if (orgId) iq = iq.eq("organization_id", orgId);
        const items = await query(() => iq) as Array<{
          warehouse_id: string;
          quantity_on_hand: number;
          unit_cost?: number;
        }>;

        const summary = warehouses.map((w) => {
          const warehouseItems = items.filter((i) => i.warehouse_id === w.id);
          const totalItems = warehouseItems.length;
          const totalQty = warehouseItems.reduce((s, i) => s + (i.quantity_on_hand ?? 0), 0);
          const totalValue = warehouseItems.reduce(
            (s, i) => s + (i.quantity_on_hand ?? 0) * (i.unit_cost ?? 0),
            0
          );
          return {
            warehouse_id: w.id,
            warehouse_name: w.name,
            total_items: totalItems,
            total_quantity: totalQty,
            total_value: totalValue,
            capacity: w.capacity,
          };
        });

        return ok({ warehouses: summary });
      } catch (e) {
        return fail(e);
      }
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Procurement Tools
// ═══════════════════════════════════════════════════════════════════════════

export const procurementTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "list_purchase_orders",
    description:
      "List purchase orders with filters for status, vendor, and date range.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "sent", "received", "cancelled"],
        },
        vendor_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("purchase_orders")
          .select("*")
          .order("order_date", { ascending: false })
          .limit((args.limit as number) ?? 50);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.vendor_id) q = q.eq("vendor_id", args.vendor_id as string);
        if (args.start_date) q = q.gte("order_date", args.start_date as string);
        if (args.end_date) q = q.lte("order_date", args.end_date as string);

        const data = await query(() => q);
        return ok({ purchase_orders: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "create_purchase_order",
    description:
      "Create a new purchase order for a vendor with line items.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        vendor_id: { type: "string" },
        order_date: { type: "string", description: "YYYY-MM-DD" },
        expected_delivery_date: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              gst_rate: { type: "number" },
            },
          },
        },
        notes: { type: "string" },
      },
      required: ["vendor_id", "order_date", "items"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const items = args.items as Array<{
          quantity: number;
          unit_price: number;
          gst_rate?: number;
        }>;

        const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const totalGst = items.reduce(
          (s, i) => s + (i.quantity * i.unit_price * (i.gst_rate ?? 18)) / 100,
          0
        );
        const totalAmount = subtotal + totalGst;

        const po = await query(() =>
          db()
            .from("purchase_orders")
            .insert({
              organization_id: orgId,
              vendor_id: args.vendor_id,
              order_date: args.order_date,
              expected_delivery_date: args.expected_delivery_date,
              items: items,
              subtotal,
              total_gst: totalGst,
              total_amount: totalAmount,
              status: "draft",
              notes: args.notes,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()
        );

        return ok({ purchase_order: po, subtotal, total_gst: totalGst, total_amount: totalAmount });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_vendor_outstanding",
    description:
      "Get total outstanding payable amount to a vendor (unpaid purchase invoices).",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string" },
        organization_id: { type: "string" },
      },
      required: ["vendor_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("purchase_orders")
          .select("id, po_number, order_date, total_amount, status, vendor_id")
          .eq("vendor_id", args.vendor_id as string)
          .in("status", ["sent", "received"]);

        if (orgId) q = q.eq("organization_id", orgId);

        const orders = await query(() => q) as Array<{ total_amount: number }>;
        const outstanding = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);

        return ok({
          vendor_id: args.vendor_id,
          outstanding_amount: outstanding,
          pending_orders: orders,
          order_count: orders.length,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
