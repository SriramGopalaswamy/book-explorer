// deno-lint-ignore-file
// @ts-nocheck
/**
 * email-webhook: Receives inbound email notifications from an email provider
 * (e.g. Microsoft Graph subscription, forwarding service, or direct POST).
 *
 * Supported POST body (JSON):
 * {
 *   from: string,            // sender email
 *   subject: string,         // email subject (used to extract invoice number)
 *   text?: string,           // plain-text body
 *   html?: string,           // HTML body (fallback if text is empty)
 *   thread_id?: string,      // message thread/conversation ID
 *   organization_id?: string // if known; otherwise resolved from invoice
 * }
 *
 * Also supports Microsoft Graph change-notification format (value[] array).
 *
 * Processing steps:
 *  1. Parse & normalize email fields
 *  2. Extract invoice number from subject via regex
 *  3. Find matching invoice in DB
 *  4. Log to email_logs (direction='inbound')          ← unchanged for backward compat
 *  5. Log to messages table (channel='email', direction='inbound')  ← NEW
 *  6. Classify body via messageProcessor function
 *  7. Update email_logs with classification            ← unchanged
 *  8. Update messages row with classification          ← NEW
 *  9. If acknowledged → update invoice.status = 'acknowledged'
 * 10. Fire workflow-event: message_received (NEW — channel-agnostic)
 * 11. Fire workflow-event: email_received (preserved for backward compat)
 * 12. If acknowledged → fire workflow-event: invoice_acknowledged
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Invoice number extractor ─────────────────────────────────────────────────

function extractInvoiceNumber(subject: string): string | null {
  // Match patterns like: INV-001, INV2026001, Invoice #001, inv_001, INV-2026-001
  const patterns = [
    /\b(INV[-_#]?\s*\d{4}[-_]\d+)\b/i,   // INV-2026-001
    /\b(INV[-_#]?\s*\d+)\b/i,             // INV-001 or INV001
    /invoice\s*#?\s*(\d+)/i,              // Invoice #123
    /\b(GRX[-_]?\d+)\b/i,                 // GRX-001 prefix (org-specific)
  ];

  for (const p of patterns) {
    const m = subject.match(p);
    if (m) return m[1].replace(/\s+/g, "").toUpperCase();
  }
  return null;
}

// ─── Normalize body to plain text ─────────────────────────────────────────────

function extractPlainText(text?: string, html?: string): string {
  if (text?.trim()) return text.trim();
  if (html) {
    // Strip HTML tags naively
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

// ─── Fire workflow-event ──────────────────────────────────────────────────────

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
    console.warn(`[email-webhook] Failed to fire ${eventType}:`, err);
  }
}

// ─── Fire message_received event (channel-agnostic replacement for email_received)

async function fireMessageReceivedEvent(
  supabase: any,
  entityType: string,
  entityId: string,
  organizationId: string,
  channel: string,
  content: string,
  messageId: string | null,
  extra: Record<string, any>
): Promise<void> {
  await fireWorkflowEvent(supabase, "message_received", entityType, entityId, organizationId, {
    channel,
    entity_id: entityId,
    content: content.slice(0, 500),
    message_id: messageId,
    ...extra,
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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

  // Support Microsoft Graph notification format (array in `value`)
  let emailData = rawBody;
  if (Array.isArray(rawBody.value) && rawBody.value.length > 0) {
    const notification = rawBody.value[0];
    const rd = notification.resourceData ?? {};
    emailData = {
      from: rd.from?.emailAddress?.address ?? rd.sender?.emailAddress?.address ?? "",
      subject: rd.subject ?? "",
      text: rd.body?.content ?? "",
      html: rd.body?.contentType === "html" ? rd.body?.content : undefined,
      thread_id: rd.conversationId ?? notification.subscriptionId,
      organization_id: rawBody.organization_id,
    };
  }

  const {
    from: fromEmail = "",
    subject = "",
    text,
    html,
    thread_id,
    organization_id: providedOrgId,
  } = emailData;

  if (!subject && !fromEmail) {
    return new Response(
      JSON.stringify({ error: "subject or from is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const bodyText = extractPlainText(text, html);

  // 1. Extract invoice number
  const invoiceNumber = extractInvoiceNumber(subject);
  if (!invoiceNumber) {
    // Log the unmatched email and return success (don't fail)
    console.warn("[email-webhook] Could not extract invoice number from subject:", subject);
    return new Response(
      JSON.stringify({ success: true, matched: false, reason: "No invoice number found in subject" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Find matching invoice
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, organization_id, client_name, client_email, status")
    .ilike("invoice_number", `%${invoiceNumber}%`)
    .maybeSingle();

  if (invErr) {
    console.error("[email-webhook] Invoice lookup error:", invErr);
    return new Response(
      JSON.stringify({ error: "DB error looking up invoice" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!invoice) {
    return new Response(
      JSON.stringify({ success: true, matched: false, reason: `No invoice found for number: ${invoiceNumber}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const organizationId = providedOrgId ?? invoice.organization_id;

  // 3. Log inbound email to legacy email_logs (UNCHANGED — backward compatibility)
  const { data: emailLog, error: logErr } = await supabase
    .from("email_logs")
    .insert({
      organization_id: organizationId,
      invoice_id: invoice.id,
      direction: "inbound",
      subject,
      from_email: fromEmail,
      to_email: invoice.client_email,
      body_text: bodyText.slice(0, 10000),
      thread_id: thread_id ?? null,
      raw_payload: rawBody,
    })
    .select("id")
    .single();

  if (logErr) {
    console.warn("[email-webhook] Failed to log email:", logErr);
  }

  // 4. Log inbound email to new messages table (NEW — channel-agnostic record)
  const { data: messageRow } = await supabase
    .from("messages")
    .insert({
      entity_type: "invoice",
      entity_id: invoice.id,
      channel: "email",
      direction: "inbound",
      sender: fromEmail,
      recipient: invoice.client_email,
      subject,
      content: bodyText.slice(0, 10000),
      status: "delivered",
      thread_id: thread_id ?? null,
      organization_id: organizationId,
      metadata: { email_log_id: emailLog?.id ?? null, raw_subject: subject },
    })
    .select("id")
    .single();

  // 5. Delegate classification to messageProcessor edge function
  //    (or call inline if messageProcessor isn't deployed yet — fallback below)
  let classification: "acknowledged" | "dispute" | "other" = "other";
  let reason = "";

  try {
    const classifyRes = await supabase.functions.invoke("message-processor", {
      body: {
        subject,
        content: bodyText,
        channel: "email",
        entity_type: "invoice",
        entity_id: invoice.id,
        message_id: messageRow?.id ?? null,
        organization_id: organizationId,
      },
    });
    if (classifyRes.data?.classification) {
      classification = classifyRes.data.classification;
      reason = classifyRes.data.reason ?? "";
    }
  } catch (classifyErr) {
    // Fallback: classify inline using Anthropic directly (preserves existing behavior)
    console.warn("[email-webhook] messageProcessor unavailable, falling back to inline classification:", classifyErr);
    const inlineResult = await classifyEmailInline(subject, bodyText);
    classification = inlineResult.classification;
    reason = inlineResult.reason;
  }

  // 6. Update legacy email_logs with classification (UNCHANGED)
  if (emailLog?.id) {
    await supabase
      .from("email_logs")
      .update({ classification })
      .eq("id", emailLog.id);
  }

  // 7. Update messages row with classification (NEW)
  if (messageRow?.id) {
    await supabase
      .from("messages")
      .update({ classification })
      .eq("id", messageRow.id);
  }

  // 8. If acknowledged → update invoice status (UNCHANGED)
  if (classification === "acknowledged" && invoice.status === "sent") {
    await supabase
      .from("invoices")
      .update({ status: "acknowledged", updated_at: new Date().toISOString() })
      .eq("id", invoice.id);
  }

  // 9. Fire channel-agnostic message_received event (NEW)
  await fireMessageReceivedEvent(
    supabase,
    "invoice",
    invoice.id,
    organizationId,
    "email",
    bodyText,
    messageRow?.id ?? null,
    {
      from: fromEmail,
      subject,
      classification,
      reason,
      invoice_number: invoice.invoice_number,
      email_log_id: emailLog?.id,
    }
  );

  // 10. Fire legacy email_received workflow event (PRESERVED — backward compat)
  await fireWorkflowEvent(
    supabase,
    "email_received",
    "invoice",
    invoice.id,
    organizationId,
    {
      from: fromEmail,
      subject,
      classification,
      reason,
      invoice_number: invoice.invoice_number,
      email_log_id: emailLog?.id,
    }
  );

  // 11. If acknowledged → fire invoice_acknowledged event (UNCHANGED)
  if (classification === "acknowledged") {
    await fireWorkflowEvent(
      supabase,
      "invoice_acknowledged",
      "invoice",
      invoice.id,
      organizationId,
      {
        from: fromEmail,
        classification,
        reason,
        invoice_number: invoice.invoice_number,
        email_log_id: emailLog?.id,
      }
    );
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

// ─── Inline classification fallback (preserves original behavior if messageProcessor is unavailable)

async function classifyEmailInline(
  subject: string,
  bodyText: string
): Promise<{ classification: "acknowledged" | "dispute" | "other"; reason: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("[email-webhook] ANTHROPIC_API_KEY not set — skipping AI classification");
    return { classification: "other", reason: "API key not configured" };
  }

  const prompt = `You are an invoice email classifier. A client has replied to an invoice email.

Classify their reply as exactly one of:
- "acknowledged": Client confirms receipt, acceptance, or acknowledgement of the invoice (e.g. "received", "noted", "we acknowledge", "thank you", "will process", "approved")
- "dispute": Client disputes the amount, items, dates, or raises concerns (e.g. "incorrect", "wrong amount", "we disagree", "dispute", "not what we ordered")
- "other": Payment confirmation, general question, out-of-office, or anything else

Subject: ${subject}
Body: ${bodyText.slice(0, 2000)}

Respond with ONLY valid JSON (no markdown): {"classification": "acknowledged"|"dispute"|"other", "reason": "one sentence reason"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 128,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn("[email-webhook] Anthropic API error:", res.status);
      return { classification: "other", reason: "Classification API error" };
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text.trim());

    const allowed = ["acknowledged", "dispute", "other"] as const;
    const classification = allowed.includes(parsed.classification)
      ? parsed.classification
      : "other";

    return { classification, reason: parsed.reason ?? "" };
  } catch (err) {
    console.warn("[email-webhook] Classification error:", err);
    return { classification: "other", reason: "Classification failed" };
  }
}
