// deno-lint-ignore-file
// @ts-nocheck
/**
 * whatsapp-webhook: Receives inbound WhatsApp messages and delivery status callbacks.
 *
 * Supported POST body formats:
 *
 * 1. Inbound message (Meta Cloud API / Twilio format stub):
 * {
 *   type: "message",
 *   from: string,          // sender phone number (e.g. "+919876543210")
 *   body: string,          // message text
 *   message_id?: string,   // provider message ID
 *   organization_id?: string
 * }
 *
 * 2. Status callback:
 * {
 *   type: "status",
 *   message_id: string,    // external_id matching messages.external_id
 *   status: "delivered" | "read" | "failed",
 *   organization_id?: string
 * }
 *
 * Processing for inbound messages:
 *  1. Parse & normalize fields
 *  2. Find invoice by client_phone (matches sender)
 *  3. Store in messages table (channel='whatsapp', direction='inbound')
 *  4. Delegate to message-processor (classify + update invoice.status)
 *  5. Fire workflow-event: message_received
 *  6. If acknowledged → fire invoice_acknowledged
 *  7. If disputed → fire invoice_disputed
 *
 * Processing for status callbacks:
 *  1. Find message row by external_id
 *  2. Update messages.status
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fireWorkflowEvent(
  supabase: any,
  eventType: string,
  entityType: string,
  entityId: string,
  organizationId: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    await supabase.functions.invoke("workflow-event", {
      body: {
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        organization_id: organizationId,
        payload,
      },
    });
  } catch (err) {
    console.warn(`[whatsapp-webhook] Failed to fire ${eventType}:`, err);
  }
}

Deno.serve(async (req) => {
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

  const { type = "message" } = rawBody;

  // ── Status callback ──────────────────────────────────────────────────────────
  if (type === "status") {
    const { message_id, status } = rawBody;

    if (!message_id || !status) {
      return new Response(
        JSON.stringify({ error: "message_id and status are required for status callbacks" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowed = ["delivered", "read", "failed", "sent"];
    if (!allowed.includes(status)) {
      return new Response(
        JSON.stringify({ error: `Invalid status: ${status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateErr } = await supabase
      .from("messages")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("external_id", message_id)
      .eq("channel", "whatsapp");

    if (updateErr) {
      console.warn("[whatsapp-webhook] Failed to update message status:", updateErr);
    }

    return new Response(
      JSON.stringify({ success: true, updated: !updateErr }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Inbound message ──────────────────────────────────────────────────────────
  const {
    from: fromPhone = "",
    body: messageBody = "",
    message_id: externalMessageId,
    organization_id: providedOrgId,
  } = rawBody;

  if (!fromPhone) {
    return new Response(
      JSON.stringify({ error: "from (sender phone) is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Normalize phone: strip spaces and dashes for comparison
  const normalizePhone = (p: string) => p.replace(/[\s\-()]/g, "");
  const normalizedFrom = normalizePhone(fromPhone);

  // Find invoice by client_phone — try exact match first, then normalized
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, organization_id, client_name, client_email, client_phone, status")
    .or(`client_phone.eq.${fromPhone},client_phone.eq.${normalizedFrom}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invErr) {
    console.warn("[whatsapp-webhook] DB error finding invoice by phone:", invErr);
    return new Response(
      JSON.stringify({ error: "DB error looking up invoice" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!invoice) {
    console.warn("[whatsapp-webhook] No invoice found for phone:", fromPhone);
    return new Response(
      JSON.stringify({ success: true, matched: false, reason: `No invoice found for phone: ${fromPhone}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const organizationId = providedOrgId ?? invoice.organization_id;

  // Store inbound message in messages table
  const { data: messageRow } = await supabase
    .from("messages")
    .insert({
      entity_type: "invoice",
      entity_id: invoice.id,
      channel: "whatsapp",
      direction: "inbound",
      sender: fromPhone,
      recipient: invoice.client_phone,
      content: messageBody.slice(0, 10000),
      status: "delivered",
      external_id: externalMessageId ?? null,
      organization_id: organizationId,
      metadata: { raw: rawBody },
    })
    .select("id")
    .single();

  // Delegate classification to message-processor
  let classification: "acknowledged" | "dispute" | "other" = "other";
  let reason = "";

  try {
    const { data: procResult, error: procErr } = await supabase.functions.invoke(
      "message-processor",
      {
        body: {
          content: messageBody,
          channel: "whatsapp",
          entity_type: "invoice",
          entity_id: invoice.id,
          message_id: messageRow?.id ?? null,
          organization_id: organizationId,
        },
      }
    );

    if (!procErr && procResult?.classification) {
      classification = procResult.classification;
      reason = procResult.reason ?? "";
    }
  } catch (err) {
    console.warn("[whatsapp-webhook] message-processor error:", err);
  }

  // Fire message_received workflow event
  await fireWorkflowEvent(supabase, "message_received", "invoice", invoice.id, organizationId, {
    channel: "whatsapp",
    entity_id: invoice.id,
    content: messageBody.slice(0, 500),
    message_id: messageRow?.id ?? null,
    from: fromPhone,
    classification,
    reason,
    invoice_number: invoice.invoice_number,
  });

  // Fire invoice_acknowledged if applicable
  if (classification === "acknowledged") {
    await fireWorkflowEvent(supabase, "invoice_acknowledged", "invoice", invoice.id, organizationId, {
      from: fromPhone,
      channel: "whatsapp",
      classification,
      reason,
      invoice_number: invoice.invoice_number,
    });
  }

  // Fire invoice_disputed if applicable
  if (classification === "dispute") {
    await fireWorkflowEvent(supabase, "invoice_disputed", "invoice", invoice.id, organizationId, {
      from: fromPhone,
      channel: "whatsapp",
      classification,
      reason,
      invoice_number: invoice.invoice_number,
      message_id: messageRow?.id ?? null,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      matched: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      classification,
      reason,
      message_id: messageRow?.id ?? null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
