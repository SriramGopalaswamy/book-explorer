// deno-lint-ignore-file
// @ts-nocheck
/**
 * message-processor: Classifies inbound messages and updates invoice status.
 *
 * This function extracts the classification logic that previously lived inline
 * inside email-webhook, making it channel-agnostic and reusable by any inbound
 * message handler (email, whatsapp, sms, etc.).
 *
 * POST body:
 * {
 *   subject?:         string          // message subject (email)
 *   content:          string          // plain-text message body
 *   channel:          string          // "email" | "whatsapp" | ...
 *   entity_type:      string          // "invoice"
 *   entity_id:        string          // invoice UUID
 *   message_id?:      string          // messages table row UUID (to update classification)
 *   organization_id:  string
 * }
 *
 * Returns:
 * {
 *   classification: "acknowledged" | "dispute" | "other",
 *   reason: string,
 *   invoice_updated: boolean
 * }
 *
 * Responsibilities:
 *   1. Classify message content using AI (Anthropic Claude)
 *   2. Update messages.classification if message_id provided
 *   3. Update invoice.status if classification == "acknowledged" and status == "sent"
 *   4. Emit workflow event if needed (via fireWorkflowEvent)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Classification = "acknowledged" | "dispute" | "other";

// ─── AI Classifier ────────────────────────────────────────────────────────────

async function classifyMessage(
  channel: string,
  subject: string,
  content: string
): Promise<{ classification: Classification; reason: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("[message-processor] ANTHROPIC_API_KEY not set — skipping classification");
    return { classification: "other", reason: "API key not configured" };
  }

  // Build a channel-aware classification prompt
  const channelContext = channel === "email"
    ? "An email reply to an invoice"
    : `A ${channel} message regarding an invoice`;

  const prompt = `You are an invoice message classifier. ${channelContext} has been received.

Classify the message as exactly one of:
- "acknowledged": The client confirms receipt, acceptance, or acknowledgement of the invoice
  (e.g. "received", "noted", "we acknowledge", "thank you", "will process", "approved")
- "dispute": The client disputes the amount, items, dates, or raises concerns
  (e.g. "incorrect", "wrong amount", "we disagree", "dispute", "not what we ordered")
- "other": Payment confirmation, general question, out-of-office, or anything else

${subject ? `Subject: ${subject}\n` : ""}Body: ${content.slice(0, 2000)}

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
      console.warn("[message-processor] Anthropic API error:", res.status);
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
    console.warn("[message-processor] Classification error:", err);
    return { classification: "other", reason: "Classification failed" };
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const {
    subject = "",
    content = "",
    channel = "email",
    entity_type,
    entity_id,
    message_id,
    organization_id,
  } = body;

  if (!entity_id || !organization_id) {
    return new Response(
      JSON.stringify({ error: "entity_id and organization_id are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 1. Classify the message content
  const { classification, reason } = await classifyMessage(channel, subject, content);

  // 2. Update messages.classification if a message_id was provided
  if (message_id) {
    await supabase
      .from("messages")
      .update({ classification })
      .eq("id", message_id)
      .catch((err: any) => console.warn("[message-processor] Failed to update messages.classification:", err));
  }

  let invoiceUpdated = false;

  // 3. Update invoice status if classification == "acknowledged" and entity is an invoice
  if (entity_type === "invoice" && classification === "acknowledged") {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", entity_id)
      .maybeSingle();

    if (invoice && invoice.status === "sent") {
      await supabase
        .from("invoices")
        .update({ status: "acknowledged", updated_at: new Date().toISOString() })
        .eq("id", entity_id);
      invoiceUpdated = true;
    }
  }

  // 4. Emit event if classification warrants it
  //    (invoice_acknowledged is fired by email-webhook after this call;
  //     message-processor itself does not fire events to avoid double-firing.
  //     If called standalone (e.g. from a whatsapp handler), the caller is
  //     responsible for firing events based on the returned classification.)

  return new Response(
    JSON.stringify({
      classification,
      reason,
      invoice_updated: invoiceUpdated,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
