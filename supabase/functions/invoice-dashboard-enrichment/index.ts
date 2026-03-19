// deno-lint-ignore-file
// @ts-nocheck
/**
 * invoice-dashboard-enrichment: Returns dashboard-ready invoice data enriched
 * with messaging metadata from the messages table.
 *
 * This endpoint does NOT modify the existing invoice endpoints — it provides
 * additional fields that the dashboard UI can optionally fetch without any
 * breaking changes to existing API consumers.
 *
 * POST body:
 * {
 *   organization_id: string,
 *   invoice_ids?: string[]    // optional subset; omit to fetch all org invoices
 * }
 *
 * Returns for each invoice:
 * {
 *   invoice_id:           string,
 *   last_message_channel: string | null,   // "email" | "whatsapp" | null
 *   last_message_status:  string | null,   // "sent" | "delivered" | "failed" | null
 *   last_message_at:      string | null,   // ISO timestamp | null
 *   last_contacted_at:    string | null,   // ISO timestamp of last outbound message | null
 *   total_messages_sent:  number,
 *   total_replies:        number
 * }
 *
 * This is additive-only — it does NOT change any existing invoice schema or
 * endpoint behavior.
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
    // Allow empty body — will use organization_id from query param if present
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

  const invoice_ids: string[] | null = body.invoice_ids ?? null;

  try {
    // ── Fetch last message per invoice entity ──────────────────────────────────
    // Single query: get the most recent message per (entity_type, entity_id)
    // for the given organization, using DISTINCT ON for efficiency.

    let lastMsgQuery = supabase
      .from("messages")
      .select("entity_id, channel, status, direction, created_at")
      .eq("organization_id", organization_id)
      .eq("entity_type", "invoice")
      .order("entity_id", { ascending: true })
      .order("created_at", { ascending: false });

    if (invoice_ids && invoice_ids.length > 0) {
      lastMsgQuery = lastMsgQuery.in("entity_id", invoice_ids);
    }

    const { data: allMessages, error: msgErr } = await lastMsgQuery;

    if (msgErr) throw msgErr;

    // ── Aggregate per invoice_id ───────────────────────────────────────────────
    // Build a map: invoice_id → { last_message_*, total_sent, total_replies }

    const enrichmentMap: Record<string, {
      last_message_channel: string | null;
      last_message_status: string | null;
      last_message_at: string | null;
      last_contacted_at: string | null;
      total_messages_sent: number;
      total_replies: number;
    }> = {};

    for (const msg of allMessages ?? []) {
      const eid = msg.entity_id;
      if (!enrichmentMap[eid]) {
        enrichmentMap[eid] = {
          last_message_channel: null,
          last_message_status: null,
          last_message_at: null,
          last_contacted_at: null,
          total_messages_sent: 0,
          total_replies: 0,
        };
      }

      const entry = enrichmentMap[eid];

      // Track last message (any direction) — messages are ordered by created_at DESC
      // so first encounter per entity_id is the most recent
      if (!entry.last_message_at) {
        entry.last_message_channel = msg.channel;
        entry.last_message_status = msg.status;
        entry.last_message_at = msg.created_at;
      }

      if (msg.direction === "outbound") {
        entry.total_messages_sent += 1;
        // last outbound message (also first encountered since ordered DESC)
        if (!entry.last_contacted_at) {
          entry.last_contacted_at = msg.created_at;
        }
      } else if (msg.direction === "inbound") {
        entry.total_replies += 1;
      }
    }

    // ── Format response ────────────────────────────────────────────────────────

    const result = Object.entries(enrichmentMap).map(([invoice_id, data]) => ({
      invoice_id,
      ...data,
    }));

    return new Response(
      JSON.stringify({ enrichment: result, count: result.length }),
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
