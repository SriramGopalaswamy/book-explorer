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
 *  1.  Parse & normalize email fields
 *  2.  Extract invoice number from subject via regex
 *  3.  Find matching invoice in DB
 *  4.  Log to email_logs (direction='inbound')                    ← unchanged, backward compat
 *  5.  Log to messages table (channel='email', direction='inbound') ← NEW
 *  6.  Delegate to message-processor (classify + update invoice.status)  ← NEW
 *      └─ message-processor owns: AI classification, messages.classification update,
 *         invoice.status update (single responsibility, no duplicate writes)
 *  6b. Fallback: if message-processor unavailable, classify inline AND update
 *      invoice.status here (ensures the path still works end-to-end)
 *  7.  Update email_logs with classification                      ← unchanged
 *  8.  Fire workflow-event: message_received (channel-agnostic)   ← NEW
 *  9.  Fire workflow-event: email_received (preserved, backward compat) ← unchanged
 *  10. If acknowledged → fire workflow-event: invoice_acknowledged ← unchanged
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Invoice number extractor ─────────────────────────────────────────────────

function extractInvoiceNumber(subject: string): string | null {
  const patterns = [
    /\b(INV[-_#]?\s*\d{4}[-_]\d+)\b/i,
    /\b(INV[-_#]?\s*\d+)\b/i,
    /invoice\s*#?\s*(\d+)/i,
    /\b(GRX[-_]?\d+)\b/i,
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
  if (html) return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
      body: { event_type: eventType, entity_type: entityType, entity_id: entityId, organization_id: organizationId, payload },
    });
  } catch (err) {
    console.warn(`[email-webhook] Failed to fire ${eventType}:`, err);
  }
}

// ─── Inline fallback classifier (used ONLY when message-processor is unavailable) ──
// Mirrors the original classifyEmail() from before the refactor.
// Also updates invoice.status here since message-processor didn't run.

async function classifyAndUpdateInline(
  supabase: any,
  subject: string,
  bodyText: string,
  invoiceId: string,
  invoiceCurrentStatus: string
): Promise<{ classification: "acknowledged" | "dispute" | "other"; reason: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
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

  let classification: "acknowledged" | "dispute" | "other" = "other";
  let reason = "Classification failed";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 128, messages: [{ role: "user", content: prompt }] }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data?.content?.[0]?.text ?? "";
      const parsed = JSON.parse(text.trim());
      const allowed = ["acknowledged", "dispute", "other"] as const;
      if (allowed.includes(parsed.classification)) {
        classification = parsed.classification;
        reason = parsed.reason ?? "";
      }
    }
  } catch {
    // classification remains "other"
  }

  // In the fallback path message-processor didn't run, so we own the status update
  if (classification === "acknowledged" && invoiceCurrentStatus === "sent") {
    await supabase
      .from("invoices")
      .update({ status: "acknowledged", updated_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .catch(() => {/* non-critical */});
  }

  return { classification, reason };
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

  const { from: fromEmail = "", subject = "", text, html, thread_id, organization_id: providedOrgId } = emailData;

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
  const { data: emailLog } = await supabase
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

  // 4. Log inbound email to new messages table (channel-agnostic record)
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
      metadata: { email_log_id: emailLog?.id ?? null },
    })
    .select("id")
    .single();

  // 5. Delegate classification + invoice.status update to message-processor.
  //    message-processor is the SINGLE owner of:
  //      - AI classification
  //      - messages.classification update
  //      - invoice.status → "acknowledged" (if applicable)
  //    This eliminates the previous double-update issue.
  let classification: "acknowledged" | "dispute" | "other" = "other";
  let reason = "";
  let usedFallback = false;

  try {
    const { data: procResult, error: procErr } = await supabase.functions.invoke(
      "message-processor",
      {
        body: {
          subject,
          content: bodyText,
          channel: "email",
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
    // message-processor already updated messages.classification and invoice.status — nothing more needed here.

  } catch (procCallErr) {
    // Fallback: classify inline AND update invoice.status (message-processor didn't run)
    console.warn("[email-webhook] message-processor unavailable, using inline fallback:", procCallErr);
    const fallback = await classifyAndUpdateInline(
      supabase, subject, bodyText, invoice.id, invoice.status
    );
    classification = fallback.classification;
    reason = fallback.reason;
    usedFallback = true;
  }

  // 6. Update legacy email_logs.classification (UNCHANGED)
  if (emailLog?.id) {
    await supabase.from("email_logs").update({ classification }).eq("id", emailLog.id);
  }

  // Note: messages.classification is updated by message-processor (main path)
  // or is left without classification update in fallback (message row exists, classification null).
  // In fallback, update messages.classification manually since message-processor didn't.
  if (usedFallback && messageRow?.id) {
    await supabase
      .from("messages")
      .update({ classification })
      .eq("id", messageRow.id)
      .catch(() => {/* non-critical */});
  }

  // 7. Fire channel-agnostic message_received event (NEW)
  await fireWorkflowEvent(supabase, "message_received", "invoice", invoice.id, organizationId, {
    channel: "email",
    entity_id: invoice.id,
    content: bodyText.slice(0, 500),
    message_id: messageRow?.id ?? null,
    from: fromEmail,
    subject,
    classification,
    reason,
    invoice_number: invoice.invoice_number,
    email_log_id: emailLog?.id,
  });

  // 8. Fire legacy email_received workflow event (PRESERVED — backward compat)
  await fireWorkflowEvent(supabase, "email_received", "invoice", invoice.id, organizationId, {
    from: fromEmail,
    subject,
    classification,
    reason,
    invoice_number: invoice.invoice_number,
    email_log_id: emailLog?.id,
  });

  // 9. If acknowledged → fire invoice_acknowledged event (UNCHANGED)
  if (classification === "acknowledged") {
    await fireWorkflowEvent(supabase, "invoice_acknowledged", "invoice", invoice.id, organizationId, {
      from: fromEmail,
      classification,
      reason,
      invoice_number: invoice.invoice_number,
      email_log_id: emailLog?.id,
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
      used_fallback: usedFallback,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
