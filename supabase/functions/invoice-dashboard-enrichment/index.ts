// deno-lint-ignore-file
// @ts-nocheck
/**
 * invoice-dashboard-enrichment: Returns messaging metadata for invoices,
 * enriching the dashboard without touching existing invoice APIs.
 *
 * Delegates aggregation to the get_invoice_message_enrichment SQL RPC,
 * which uses a single GROUP BY query and is significantly more efficient
 * than JavaScript-side aggregation over all message rows.
 *
 * POST body (or query params):
 * {
 *   organization_id: string,
 *   invoice_ids?: string[]    // optional subset; omit to get all org invoices
 * }
 *
 * Returns:
 * {
 *   enrichment: [
 *     {
 *       invoice_id:           string,
 *       last_message_channel: string | null,
 *       last_message_status:  string | null,
 *       last_message_at:      string | null,
 *       last_contacted_at:    string | null,
 *       total_messages_sent:  number,
 *       total_replies:        number
 *     }
 *   ],
 *   count: number
 * }
 *
 * Additive-only — does NOT modify any existing invoice schema or endpoint.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body — fall through to query-param fallback
  }

  const organization_id =
    body.organization_id ??
    new URL(req.url).searchParams.get("organization_id");

  if (!organization_id) {
    return new Response(
      JSON.stringify({ error: "organization_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // invoice_ids is optional; null means "all invoices for this org"
  const invoice_ids: string[] | null = body.invoice_ids?.length > 0
    ? body.invoice_ids
    : null;

  try {
    // Call the SQL RPC — single GROUP BY query, uses idx_messages_entity_created.
    // Far more efficient than fetching all message rows and aggregating in JS.
    const { data: enrichment, error: rpcErr } = await supabase.rpc(
      "get_invoice_message_enrichment",
      {
        p_organization_id: organization_id,
        p_invoice_ids: invoice_ids,
      }
    );

    if (rpcErr) throw rpcErr;

    return new Response(
      JSON.stringify({
        enrichment: enrichment ?? [],
        count: enrichment?.length ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[invoice-dashboard-enrichment] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
