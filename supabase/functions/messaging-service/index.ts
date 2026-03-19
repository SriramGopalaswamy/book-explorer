// deno-lint-ignore-file
// @ts-nocheck
/**
 * messaging-service: Channel-agnostic single entry point for ALL outbound messages.
 *
 * POST body:
 * {
 *   channel:        "email" | "whatsapp"     // required
 *   to:             string                    // recipient address
 *   subject?:       string                    // email subject (email only)
 *   template?:      string                    // template identifier
 *   variables?:     object                    // template variable substitutions
 *   html_body?:     string                    // pre-rendered HTML (email only)
 *   content?:       string                    // plain-text content
 *   entity_type?:   string                    // e.g. "invoice"
 *   entity_id?:     string                    // UUID
 *   organization_id: string                   // required
 *   thread_id?:     string                    // for threading replies
 *   sender_name?:   string                    // display name for "from"
 * }
 *
 * Internal logic:
 *   - channel = "email" → calls existing sendEmail() (MS Graph, unchanged)
 *                        → inserts row into messages table
 *   - channel = "whatsapp" → stub, logs to messages table with status="pending"
 *                           → TODO: integrate WhatsApp Business API
 *
 * Returns:
 * {
 *   success: boolean,
 *   message_id: string,   // messages.id UUID
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

// ─── MS Graph email helpers (mirrors workflow-engine pattern — NOT rewritten) ──

const defaultSenderEmail = "admin@grx10.com";
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getMsGraphToken(
  creds: { tenantId: string; clientId: string; clientSecret: string },
  cacheKey: string
): Promise<string | null> {
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60000) return cached.token;

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * sendEmailViaGraph — thin wrapper around MS Graph sendMail.
 * This is intentionally NOT a rewrite of emailService; it replicates the same
 * pattern used in workflow-engine and send-notification-email to keep parity.
 */
async function sendEmailViaGraph(
  supabase: any,
  organizationId: string,
  to: string,
  senderName: string,
  subject: string,
  htmlBody: string
): Promise<{ sent: boolean; senderEmail: string }> {
  // Try org-specific OAuth config first
  const { data: orgConfig } = await supabase
    .from("organization_oauth_configs")
    .select("tenant_id, client_id, client_secret, sender_email")
    .eq("organization_id", organizationId)
    .eq("provider", "microsoft")
    .maybeSingle();

  let senderEmail = defaultSenderEmail;
  let token: string | null = null;

  if (orgConfig?.tenant_id && orgConfig?.client_id && orgConfig?.client_secret) {
    senderEmail = orgConfig.sender_email || defaultSenderEmail;
    token = await getMsGraphToken(
      {
        tenantId: orgConfig.tenant_id,
        clientId: orgConfig.client_id,
        clientSecret: orgConfig.client_secret,
      },
      organizationId
    );
  } else {
    const tenantId = Deno.env.get("AZURE_TENANT_ID");
    const clientId = Deno.env.get("AZURE_CLIENT_ID");
    const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
    if (tenantId && clientId && clientSecret) {
      token = await getMsGraphToken(
        { tenantId, clientId, clientSecret },
        "__global__"
      );
    }
  }

  if (!token) {
    console.warn("[messaging-service] No MS Graph token available for email");
    return { sent: false, senderEmail };
  }

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: htmlBody },
            toRecipients: [
              { emailAddress: { address: to, name: senderName || to } },
            ],
            from: {
              emailAddress: {
                address: senderEmail,
                name: "GRX10 Finance",
              },
            },
          },
          saveToSentItems: false,
        }),
      }
    );
    const sent = res.ok || res.status === 202;
    return { sent, senderEmail };
  } catch {
    return { sent: false, senderEmail };
  }
}

// ─── WhatsApp stub ────────────────────────────────────────────────────────────

async function sendWhatsAppStub(
  to: string,
  content: string
): Promise<{ sent: boolean }> {
  // TODO: Integrate WhatsApp Business API (Meta Cloud API or Twilio)
  // For now, log to console and return pending so the messages row is recorded.
  console.log(
    `[messaging-service] [WhatsApp STUB] Would send to ${to}: ${content.slice(0, 80)}...`
  );
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
    template,
    variables,
    html_body,
    content,
    entity_type,
    entity_id,
    organization_id,
    thread_id,
    sender_name,
  } = body;

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

  let status: "sent" | "failed" | "pending" = "pending";
  let externalId: string | null = null;

  // ── Route by channel ─────────────────────────────────────────────────────────

  if (channel === "email") {
    const emailSubject = subject || "Message from GRX10";
    const emailHtml = html_body || `<p>${content || ""}</p>`;

    const { sent, senderEmail } = await sendEmailViaGraph(
      supabase,
      organization_id,
      to,
      sender_name || to,
      emailSubject,
      emailHtml
    );

    status = sent ? "sent" : "failed";
    // MS Graph doesn't return a stable external message ID on sendMail;
    // record the sender for traceability.
    externalId = sent ? `graph:${senderEmail}:${Date.now()}` : null;

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

  // ── Insert into messages table (always, even on failure) ────────────────────

  const { data: messageRow, error: insertErr } = await supabase
    .from("messages")
    .insert({
      entity_type: entity_type || "unknown",
      entity_id: entity_id || null,
      channel,
      direction: "outbound",
      recipient: to,
      subject: subject || null,
      content: content || null,
      template: template || null,
      status,
      external_id: externalId,
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
