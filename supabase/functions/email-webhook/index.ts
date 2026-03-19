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
 *  4. Log to email_logs (direction='inbound')
 *  5. Classify body with Claude AI (acknowledged / dispute / other)
 *  6. Update email_logs with classification
 *  7. If acknowledged → update invoice.status = 'acknowledged'
 *  8. Fire workflow-event: email_received (always)
 *  9. If acknowledged → fire workflow-event: invoice_acknowledged
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── AI Classification ────────────────────────────────────────────────────────

type Classification = "acknowledged" | "dispute" | "other";

async function classifyEmail(
  subject: string,
  bodyText: string
): Promise<{ classification: Classification; reason: string }> {
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

    const allowed: Classification[] = ["acknowledged", "dispute", "other"];
    const classification = allowed.includes(parsed.classification)
      ? (parsed.classification as Classification)
      : "other";

    return { classification, reason: parsed.reason ?? "" };
  } catch (err) {
    console.warn("[email-webhook] Classification error:", err);
    return { classification: "other", reason: "Classification failed" };
  }
}

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

  // 3. Log inbound email
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

  // 4. AI classification
  const { classification, reason } = await classifyEmail(subject, bodyText);

  // 5. Update email_log with classification
  if (emailLog?.id) {
    await supabase
      .from("email_logs")
      .update({ classification })
      .eq("id", emailLog.id);
  }

  // 6. If acknowledged → update invoice status
  if (classification === "acknowledged" && invoice.status === "sent") {
    await supabase
      .from("invoices")
      .update({ status: "acknowledged", updated_at: new Date().toISOString() })
      .eq("id", invoice.id);
  }

  // 7. Fire email_received workflow event (always)
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

  // 8. If acknowledged → fire invoice_acknowledged event
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
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
