// deno-lint-ignore-file
// @ts-nocheck
/**
 * whatsapp-status-webhook: Receives delivery status updates from WhatsApp
 * provider (Meta Cloud API / Twilio / Gupshup).
 *
 * Updates the messages table status based on provider callbacks:
 *   sent → delivered → read → failed
 *
 * Meta Cloud API status webhook format:
 * {
 *   object: "whatsapp_business_account",
 *   entry: [{
 *     changes: [{
 *       value: {
 *         statuses: [{
 *           id: string,          // provider message ID (matches messages.external_id)
 *           status: "sent" | "delivered" | "read" | "failed",
 *           timestamp: string,
 *           errors?: [{ code, title }]
 *         }]
 *       }
 *     }]
 *   }]
 * }
 *
 * Simplified format:
 * {
 *   external_id: string,
 *   status: "sent" | "delivered" | "read" | "failed",
 *   error_code?: string,
 *   error_message?: string
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Status progression: only move forward, never backward
const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99, // failed always takes priority
};

// ─── Parse Meta Cloud API status format ──────────────────────────────────────

function parseMetaStatuses(body: any): Array<{
  externalId: string;
  status: string;
  timestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  const results: Array<any> = [];
  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        for (const s of change.value?.statuses || []) {
          results.push({
            externalId: s.id,
            status: s.status,
            timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
            errorCode: s.errors?.[0]?.code?.toString() || null,
            errorMessage: s.errors?.[0]?.title || null,
          });
        }
      }
    }
  } catch {
    // Return empty if parsing fails
  }
  return results;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Meta webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "grx10_whatsapp_verify";

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Parse status updates ─────────────────────────────────────────────────
  let statusUpdates: Array<{
    externalId: string;
    status: string;
    timestamp: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }> = [];

  if (rawBody.object === "whatsapp_business_account") {
    statusUpdates = parseMetaStatuses(rawBody);
  } else if (rawBody.external_id && rawBody.status) {
    // Simplified format
    statusUpdates = [{
      externalId: rawBody.external_id,
      status: rawBody.status,
      timestamp: null,
      errorCode: rawBody.error_code || null,
      errorMessage: rawBody.error_message || null,
    }];
  }

  if (statusUpdates.length === 0) {
    return new Response(
      JSON.stringify({ success: true, updated: 0, reason: "No status updates in payload" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Process each status update ───────────────────────────────────────────
  let updated = 0;
  const errors: string[] = [];

  for (const su of statusUpdates) {
    try {
      // Find the message by external_id
      const { data: message } = await supabase
        .from("messages")
        .select("id, status, entity_type, entity_id, organization_id")
        .eq("external_id", su.externalId)
        .eq("channel", "whatsapp")
        .maybeSingle();

      if (!message) {
        console.warn(`[whatsapp-status] No message found for external_id: ${su.externalId}`);
        continue;
      }

      // Only update if new status is "forward" from current status
      const currentOrder = STATUS_ORDER[message.status] ?? 0;
      const newOrder = STATUS_ORDER[su.status] ?? 0;

      if (newOrder <= currentOrder && su.status !== "failed") {
        continue; // Skip backward status transitions (except failed)
      }

      const allowedStatuses = ["sent", "delivered", "read", "failed"];
      if (!allowedStatuses.includes(su.status)) {
        continue;
      }

      // Update message status
      const updateData: Record<string, any> = {
        status: su.status,
      };

      if (su.status === "failed") {
        updateData.metadata = {
          ...(message as any).metadata,
          error_code: su.errorCode,
          error_message: su.errorMessage,
        };
      }

      await supabase
        .from("messages")
        .update(updateData)
        .eq("id", message.id);

      updated++;

      // Fire workflow event for failed deliveries (so workflows can react)
      if (su.status === "failed" && message.organization_id) {
        try {
          await supabase.functions.invoke("workflow-event", {
            body: {
              event_type: "message_delivery_failed",
              entity_type: message.entity_type,
              entity_id: message.entity_id,
              organization_id: message.organization_id,
              payload: {
                channel: "whatsapp",
                message_id: message.id,
                error_code: su.errorCode,
                error_message: su.errorMessage,
              },
            },
          });
        } catch (err) {
          console.warn("[whatsapp-status] Failed to fire delivery_failed event:", err);
        }
      }
    } catch (err: any) {
      errors.push(`${su.externalId}: ${err.message}`);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      updated,
      total: statusUpdates.length,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
