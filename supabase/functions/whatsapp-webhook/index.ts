// deno-lint-ignore-file
// @ts-nocheck
/**
 * whatsapp-webhook: Receives inbound WhatsApp messages from the provider
 * (Meta Cloud API / Twilio / Gupshup).
 *
 * Mirrors the email-webhook pattern:
 *  1. Parse & normalize incoming message
 *  2. Identify sender phone number
 *  3. Map to invoice via phone number or metadata
 *  4. Store in messages table (channel='whatsapp', direction='inbound')
 *  5. Delegate classification to message-processor
 *  6. Fire workflow events (message_received, invoice_acknowledged, etc.)
 *
 * POST body (Meta Cloud API webhook format):
 * {
 *   object: "whatsapp_business_account",
 *   entry: [{
 *     changes: [{
 *       value: {
 *         messages: [{ from, type, text: { body }, context?: { id } }],
 *         metadata: { phone_number_id }
 *       }
 *     }]
 *   }]
 * }
 *
 * Also supports simplified JSON format:
 * {
 *   from: string,          // sender phone (E.164)
 *   content: string,       // message body
 *   message_id?: string,   // provider message ID
 *   context_id?: string,   // original message ID being replied to
 *   organization_id?: string
 * }
 *
 * GET request (Meta webhook verification):
 *   ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Normalize phone to E.164 ────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  // Assume Indian number if 10 digits
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

// ─── Extract invoice reference from message text ─────────────────────────────

function extractInvoiceRef(text: string): string | null {
  const patterns = [
    /\b(INV[-_#]?\s*\d{4}[-_]\d+)\b/i,
    /\b(INV[-_#]?\s*\d+)\b/i,
    /invoice\s*#?\s*(\d+)/i,
    /\b(GRX[-_]?\d+)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s+/g, "").toUpperCase();
  }
  return null;
}

// ─── Fire workflow-event ─────────────────────────────────────────────────────

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

// ─── Parse Meta Cloud API format ─────────────────────────────────────────────

function parseMetaFormat(body: any): { from: string; content: string; messageId: string | null; contextId: string | null } | null {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];

    if (!msg) return null;

    return {
      from: msg.from || "",
      content: msg.text?.body || msg.button?.text || msg.interactive?.body?.text || "",
      messageId: msg.id || null,
      contextId: msg.context?.id || null,
    };
  } catch {
    return null;
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // ── Meta webhook verification (GET) ──────────────────────────────────────
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

  // ── Parse message from either Meta format or simplified JSON ─────────────
  let fromPhone: string;
  let messageContent: string;
  let externalMessageId: string | null = null;
  let contextId: string | null = null;
  let providedOrgId: string | null = rawBody.organization_id || null;

  if (rawBody.object === "whatsapp_business_account") {
    // Meta Cloud API format
    const parsed = parseMetaFormat(rawBody);
    if (!parsed || !parsed.from) {
      // Meta sends status updates here too — acknowledge but skip
      return new Response(
        JSON.stringify({ success: true, matched: false, reason: "No message in payload (likely status update)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    fromPhone = parsed.from;
    messageContent = parsed.content;
    externalMessageId = parsed.messageId;
    contextId = parsed.contextId;
  } else {
    // Simplified JSON format
    fromPhone = rawBody.from || "";
    messageContent = rawBody.content || rawBody.text || "";
    externalMessageId = rawBody.message_id || null;
    contextId = rawBody.context_id || null;
  }

  if (!fromPhone) {
    return new Response(
      JSON.stringify({ error: "from (sender phone) is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const normalizedPhone = normalizePhone(fromPhone);

  // ── 1. Try to map sender to an invoice ───────────────────────────────────
  // Strategy: check for invoice reference in message text, then fall back to
  // matching client_phone on invoices.

  let invoice: any = null;
  let matchMethod = "none";

  // 1a. Try to extract invoice number from message content
  const invoiceRef = extractInvoiceRef(messageContent);
  if (invoiceRef) {
    const { data: invByRef } = await supabase
      .from("invoices")
      .select("id, invoice_number, organization_id, client_name, client_email, client_phone, status")
      .ilike("invoice_number", `%${invoiceRef}%`)
      .maybeSingle();

    if (invByRef) {
      invoice = invByRef;
      matchMethod = "invoice_number";
    }
  }

  // 1b. Fall back to matching by phone number (most recent unpaid invoice)
  if (!invoice) {
    const phoneVariants = [normalizedPhone, fromPhone, normalizedPhone.replace("+", "")];
    for (const variant of phoneVariants) {
      const { data: invByPhone } = await supabase
        .from("invoices")
        .select("id, invoice_number, organization_id, client_name, client_email, client_phone, status")
        .eq("client_phone", variant)
        .in("status", ["sent", "overdue"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invByPhone) {
        invoice = invByPhone;
        matchMethod = "client_phone";
        break;
      }
    }
  }

  if (!invoice) {
    // Store as unmatched message for manual review
    await supabase.from("messages").insert({
      entity_type: "unknown",
      entity_id: "00000000-0000-0000-0000-000000000000",
      channel: "whatsapp",
      direction: "inbound",
      sender: normalizedPhone,
      content: messageContent.slice(0, 10000),
      status: "delivered",
      external_id: externalMessageId,
      organization_id: providedOrgId,
      metadata: { match_method: "none", raw_from: fromPhone },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, matched: false, reason: "No invoice found for sender phone" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const organizationId = providedOrgId ?? invoice.organization_id;

  // ── 2. Store inbound message in messages table ───────────────────────────
  const { data: messageRow } = await supabase
    .from("messages")
    .insert({
      entity_type: "invoice",
      entity_id: invoice.id,
      channel: "whatsapp",
      direction: "inbound",
      sender: normalizedPhone,
      recipient: invoice.client_phone || null,
      subject: null, // WhatsApp has no subject
      content: messageContent.slice(0, 10000),
      status: "delivered",
      external_id: externalMessageId,
      thread_id: contextId,
      organization_id: organizationId,
      metadata: {
        match_method: matchMethod,
        raw_from: fromPhone,
        invoice_number: invoice.invoice_number,
      },
    })
    .select("id")
    .single();

  // ── 3. Delegate classification to message-processor ──────────────────────
  let classification: "acknowledged" | "dispute" | "other" = "other";
  let reason = "";

  try {
    const { data: procResult, error: procErr } = await supabase.functions.invoke(
      "message-processor",
      {
        body: {
          content: messageContent,
          channel: "whatsapp",
          entity_type: "invoice",
          entity_id: invoice.id,
          message_id: messageRow?.id ?? null,
          organization_id: organizationId,
        },
      }
    );

    if (procErr || !procResult?.classification) {
      throw new Error(procErr?.message ?? "message-processor returned no classification");
    }

    classification = procResult.classification;
    reason = procResult.reason ?? "";
  } catch (err) {
    console.warn("[whatsapp-webhook] message-processor unavailable:", err);
    // Classification stays "other" — no inline fallback to keep this function simple
  }

  // ── 4. Fire channel-agnostic message_received event ──────────────────────
  await fireWorkflowEvent(supabase, "message_received", "invoice", invoice.id, organizationId, {
    channel: "whatsapp",
    entity_id: invoice.id,
    content: messageContent.slice(0, 500),
    message_id: messageRow?.id ?? null,
    from: normalizedPhone,
    classification,
    reason,
    invoice_number: invoice.invoice_number,
  });

  // ── 5. Fire specific events based on classification ──────────────────────
  if (classification === "acknowledged") {
    await fireWorkflowEvent(supabase, "invoice_acknowledged", "invoice", invoice.id, organizationId, {
      from: normalizedPhone,
      channel: "whatsapp",
      classification,
      reason,
      invoice_number: invoice.invoice_number,
      message_id: messageRow?.id ?? null,
    });
  }

  if (classification === "dispute") {
    await fireWorkflowEvent(supabase, "invoice_disputed", "invoice", invoice.id, organizationId, {
      from: normalizedPhone,
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
      match_method: matchMethod,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
