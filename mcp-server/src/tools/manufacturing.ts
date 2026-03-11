/**
 * Manufacturing Tools
 *
 * Covers: Bill of Materials, work orders, material consumption,
 * finished goods, production analytics.
 *
 * Maps to Supabase tables:
 *   bom_headers, bom_items, work_orders, production_entries
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const manufacturingTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "list_work_orders",
    description:
      "List manufacturing work orders with status and production progress.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "in_progress", "completed", "cancelled"],
        },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("work_orders")
          .select("*")
          .order("planned_start_date", { ascending: false })
          .limit((args.limit as number) ?? 50);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.start_date) q = q.gte("planned_start_date", args.start_date as string);
        if (args.end_date) q = q.lte("planned_start_date", args.end_date as string);

        const data = await query(() => q);
        return ok({ work_orders: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_bom",
    description:
      "Get the Bill of Materials for a finished product — all components " +
      "and quantities required to manufacture one unit.",
    inputSchema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "Finished product item UUID" },
        organization_id: { type: "string" },
      },
      required: ["product_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let hq = db()
          .from("bom_headers")
          .select("*, bom_items(*)")
          .eq("product_id", args.product_id as string);

        if (orgId) hq = hq.eq("organization_id", orgId);

        const data = await query(() => hq);
        return ok({ bom: data });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_material_requirements",
    description:
      "Calculate raw material requirements for a production plan: " +
      "given a list of products and quantities, compute total component needs.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        production_plan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              quantity: { type: "number" },
            },
          },
        },
      },
      required: ["production_plan"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const plan = args.production_plan as Array<{ product_id: string; quantity: number }>;

        const requirements: Record<
          string,
          { item_id: string; required_quantity: number; unit: string }
        > = {};

        for (const { product_id, quantity } of plan) {
          let bq = db()
            .from("bom_items")
            .select("component_id, quantity_per_unit, unit")
            .eq("product_id", product_id);

          if (orgId) bq = bq.eq("organization_id", orgId);

          const items = await query(() => bq) as Array<{
            component_id: string;
            quantity_per_unit: number;
            unit: string;
          }>;

          for (const item of items) {
            if (!requirements[item.component_id]) {
              requirements[item.component_id] = {
                item_id: item.component_id,
                required_quantity: 0,
                unit: item.unit,
              };
            }
            requirements[item.component_id].required_quantity +=
              item.quantity_per_unit * quantity;
          }
        }

        return ok({
          production_plan: plan,
          material_requirements: Object.values(requirements),
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
