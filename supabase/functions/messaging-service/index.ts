// deno-lint-ignore-file
// @ts-nocheck
/**
 * messaging-service: Channel-agnostic single entry point for ALL outbound messages.
 *
 * This service is the ONLY place that knows how to route a message to the
 * correct channel provider. It does NOT implement any transport directly —
 * it delegates to existing edge functions:
 *   - email  → send-notification-email (type="raw_email")
 *   - whatsapp → stub (TODO: WhatsApp Business API)
 *
 * POST body:
 * {
 *   channel:         "email" | "whatsapp"   // required
 *   to:              string                  // recipient address — required
 *   subject?:        string                  // email subject
 *   html_body?:      string                  // pre-rendered HTML (email only)
 *   content?:        string                  // plain-text content
 *   template?:       string                  // template identifier (for logging)
 *   variables?:      object                  // template variable metadata (logged only)
 *   entity_type:     string                  // required — e.g. "invoice"
 *   entity_id:       string                  // required UUID
 *   organization_id: string                  // required
 *   thread_id?:      string                  // for threading replies
 *   sender_name?:    string                  // display name for recipient field
 * }
 *
 * Returns:
 * {
 *   success: boolean,
 *   message_id: string,  // messages.id UUID
 *   channel: string,
 *   status: string
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── WhatsApp stub ────────────────────────────────────────────────────────────

async function sendWhatsAppStub(to: string, content: string): Promise<{ sent: boolean }> {
  // TODO: Integrate WhatsApp Business API (Meta Cloud API or Twilio)
  console.log(`[messaging-service] [WhatsApp STUB] Would send to ${to}: ${content.slice(0, 80)}`);
  return { sent: false };
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
    channel,
    to,
    subject,
    html_body,
    content,
    template,
    variables,
    entity_type,
    entity_id,
    organization_id,
    thread_id,
    sender_name,
  } = body;

  // ── Input validation (M2 fix: entity_id and entity_type are required) ────────
  if (!channel || !organization_id) {
    return new Response(
      JSON.stringify({ error: "channel and organization_id are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!to) {
    return new Response(
      JSON.stringify({ error: "to (recipient) is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!entity_id) {
    return new Response(
      JSON.stringify({ error: "entity_id is required (messages table has NOT NULL constraint)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!entity_type) {
    return new Response(
      JSON.stringify({ error: "entity_type is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let status: "sent" | "failed" | "pending" = "pending";

  // ── Route by channel ──────────────────────────────────────────────────────────

  if (channel === "email") {
    // Delegate to send-notification-email (type="raw_email") — no MS Graph code here.
    // send-notification-email owns all OAuth, token caching, and MS Graph transport.
    const emailSubject = subject || "Message from GRX10";
    const emailHtmlBody = html_body || `<p>${content || ""}</p>`;

    try {
      const { data: sendResult, error: sendErr } = await supabase.functions.invoke(
        "send-notification-email",
        {
          body: {
            type: "raw_email",
            organization_id,
            payload: {
              to_email: to,
              to_name: sender_name || to,
              subject: emailSubject,
              html_body: emailHtmlBody,
            },
          },
        }
      );

      if (sendErr) {
        console.warn("[messaging-service] send-notification-email error:", sendErr);
        status = "failed";
      } else {
        status = sendResult?.email_sent ? "sent" : "failed";
      }
    } catch (err) {
      console.warn("[messaging-service] Failed to invoke send-notification-email:", err);
      status = "failed";
    }

  } else if (channel === "whatsapp") {
    // TODO: WhatsApp Business API integration
    const { sent } = await sendWhatsAppStub(to, content || "");
    status = sent ? "sent" : "pending";

  } else {
    return new Response(
      JSON.stringify({ error: `Unsupported channel: ${channel}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Insert into messages table (always, even on failure — for audit trail) ───

  const { data: messageRow, error: insertErr } = await supabase
    .from("messages")
    .insert({
      entity_type,
      entity_id,
      channel,
      direction: "outbound",
      recipient: to,
      subject: subject || null,
      content: content || null,
      template: template || null,
      status,
      thread_id: thread_id || null,
      organization_id,
      metadata: variables ? { variables } : null,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.warn("[messaging-service] Failed to insert message row:", insertErr);
  }

  return new Response(
    JSON.stringify({
      success: status === "sent" || status === "pending",
      message_id: messageRow?.id ?? null,
      channel,
      status,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
