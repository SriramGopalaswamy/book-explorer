// deno-lint-ignore-file
// @ts-nocheck
/**
 * messaging-service: Channel-agnostic single entry point for ALL outbound messages.
 *
 * This service is the ONLY place that knows how to route a message to the
 * correct channel provider. It does NOT implement any transport directly —
 * it delegates to channel-specific providers:
 *   - email    → send-notification-email (type="raw_email")
 *   - whatsapp → WhatsApp Business API (Meta Cloud API / Twilio / Gupshup)
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

// ─── WhatsApp Provider ───────────────────────────────────────────────────────
// Decoupled provider abstraction. Supports:
//   1. Meta Cloud API (WhatsApp Business API direct)
//   2. Twilio WhatsApp
//   3. Gupshup
// Provider is selected via WHATSAPP_PROVIDER env var (default: "meta").

interface WhatsAppSendResult {
  sent: boolean;
  externalId: string | null;
  error: string | null;
}

async function resolveWhatsAppTemplate(
  supabase: any,
  organizationId: string,
  templateName: string
): Promise<{ template_name: string; variables: Record<string, string>; language: string } | null> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("template_name, variables, language")
    .eq("organization_id", organizationId)
    .eq("name", templateName)
    .eq("is_active", true)
    .maybeSingle();

  return data || null;
}

function normalizePhoneE164(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

async function sendWhatsAppMessage(
  to: string,
  content: string,
  templateConfig: { template_name: string; variables: Record<string, string>; language: string } | null,
  variableValues: Record<string, any> | null
): Promise<WhatsAppSendResult> {
  const provider = Deno.env.get("WHATSAPP_PROVIDER") || "meta";
  const phone = normalizePhoneE164(to);

  if (provider === "meta") {
    return sendViaMeta(phone, content, templateConfig, variableValues);
  } else if (provider === "twilio") {
    return sendViaTwilio(phone, content, templateConfig, variableValues);
  } else if (provider === "gupshup") {
    return sendViaGupshup(phone, content, templateConfig, variableValues);
  }

  console.warn(`[messaging-service] Unknown WHATSAPP_PROVIDER: ${provider}`);
  return { sent: false, externalId: null, error: `Unknown provider: ${provider}` };
}

// ── Meta Cloud API (WhatsApp Business API) ──────────────────────────────────

async function sendViaMeta(
  phone: string,
  content: string,
  templateConfig: { template_name: string; variables: Record<string, string>; language: string } | null,
  variableValues: Record<string, any> | null
): Promise<WhatsAppSendResult> {
  const token = Deno.env.get("WHATSAPP_META_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_META_PHONE_NUMBER_ID");

  if (!token || !phoneNumberId) {
    console.warn("[messaging-service] WHATSAPP_META_ACCESS_TOKEN or WHATSAPP_META_PHONE_NUMBER_ID not set");
    return { sent: false, externalId: null, error: "WhatsApp Meta credentials not configured" };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const recipient = phone.replace("+", "");

  let body: any;

  if (templateConfig) {
    // Send template message (HSM) — required for business-initiated conversations
    const components: any[] = [];
    if (variableValues && Object.keys(templateConfig.variables).length > 0) {
      const parameters = Object.entries(templateConfig.variables)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([_idx, fieldName]) => ({
          type: "text",
          text: String(variableValues[fieldName] || ""),
        }));

      if (parameters.length > 0) {
        components.push({ type: "body", parameters });
      }
    }

    body = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: templateConfig.template_name,
        language: { code: templateConfig.language },
        ...(components.length > 0 ? { components } : {}),
      },
    };
  } else {
    // Send free-form text message (only works within 24h customer-service window)
    body = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "text",
      text: { body: content || "Message from GRX10" },
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[messaging-service] Meta WhatsApp API error ${res.status}:`, errText);
      return { sent: false, externalId: null, error: `Meta API ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const messageId = data?.messages?.[0]?.id || null;
    return { sent: true, externalId: messageId, error: null };
  } catch (err: any) {
    console.warn("[messaging-service] Meta WhatsApp API exception:", err);
    return { sent: false, externalId: null, error: err.message };
  }
}

// ── Twilio WhatsApp ─────────────────────────────────────────────────────────

async function sendViaTwilio(
  phone: string,
  content: string,
  templateConfig: { template_name: string; variables: Record<string, string>; language: string } | null,
  variableValues: Record<string, any> | null
): Promise<WhatsAppSendResult> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[messaging-service] Twilio credentials not configured");
    return { sent: false, externalId: null, error: "Twilio credentials not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  // Build message body — for templates, Twilio uses content SID or content variables
  let messageBody = content || "Message from GRX10";
  const params = new URLSearchParams();
  params.append("From", `whatsapp:${fromNumber}`);
  params.append("To", `whatsapp:${phone}`);

  if (templateConfig) {
    // Twilio Content API template
    const contentSid = Deno.env.get(`TWILIO_CONTENT_SID_${templateConfig.template_name.toUpperCase()}`);
    if (contentSid) {
      params.append("ContentSid", contentSid);
      if (variableValues) {
        const contentVars: Record<string, string> = {};
        Object.entries(templateConfig.variables).forEach(([idx, field]) => {
          contentVars[idx] = String(variableValues[field] || "");
        });
        params.append("ContentVariables", JSON.stringify(contentVars));
      }
    } else {
      params.append("Body", messageBody);
    }
  } else {
    params.append("Body", messageBody);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn(`[messaging-service] Twilio API error ${res.status}:`, data);
      return { sent: false, externalId: null, error: `Twilio ${res.status}: ${data.message || ""}` };
    }

    return { sent: true, externalId: data.sid || null, error: null };
  } catch (err: any) {
    console.warn("[messaging-service] Twilio API exception:", err);
    return { sent: false, externalId: null, error: err.message };
  }
}

// ── Gupshup WhatsApp ────────────────────────────────────────────────────────

async function sendViaGupshup(
  phone: string,
  content: string,
  templateConfig: { template_name: string; variables: Record<string, string>; language: string } | null,
  variableValues: Record<string, any> | null
): Promise<WhatsAppSendResult> {
  const apiKey = Deno.env.get("GUPSHUP_API_KEY");
  const appName = Deno.env.get("GUPSHUP_APP_NAME");
  const sourcePhone = Deno.env.get("GUPSHUP_SOURCE_PHONE");

  if (!apiKey || !appName || !sourcePhone) {
    console.warn("[messaging-service] Gupshup credentials not configured");
    return { sent: false, externalId: null, error: "Gupshup credentials not configured" };
  }

  const url = "https://api.gupshup.io/wa/api/v1/msg";
  const destination = phone.replace("+", "");

  let messagePayload: any;

  if (templateConfig) {
    const params = variableValues
      ? Object.entries(templateConfig.variables)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([_idx, field]) => String(variableValues[field] || ""))
      : [];

    messagePayload = {
      type: "template",
      template: {
        id: templateConfig.template_name,
        params,
      },
    };
  } else {
    messagePayload = {
      type: "text",
      text: content || "Message from GRX10",
    };
  }

  const params = new URLSearchParams();
  params.append("channel", "whatsapp");
  params.append("source", sourcePhone);
  params.append("destination", destination);
  params.append("src.name", appName);
  params.append("message", JSON.stringify(messagePayload));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok || data.status === "error") {
      console.warn(`[messaging-service] Gupshup API error:`, data);
      return { sent: false, externalId: null, error: `Gupshup: ${data.message || "unknown error"}` };
    }

    return { sent: true, externalId: data.messageId || null, error: null };
  } catch (err: any) {
    console.warn("[messaging-service] Gupshup API exception:", err);
    return { sent: false, externalId: null, error: err.message };
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
  let externalId: string | null = null;

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
    // Resolve template from whatsapp_templates table if template name provided
    let templateConfig: { template_name: string; variables: Record<string, string>; language: string } | null = null;
    if (template) {
      templateConfig = await resolveWhatsAppTemplate(supabase, organization_id, template);
      if (!templateConfig) {
        console.warn(`[messaging-service] WhatsApp template "${template}" not found for org ${organization_id}`);
      }
    }

    const result = await sendWhatsAppMessage(to, content || "", templateConfig, variables || null);
    status = result.sent ? "sent" : "failed";
    externalId = result.externalId;

    if (!result.sent) {
      console.warn("[messaging-service] WhatsApp send failed:", result.error);
    }

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
      external_id: externalId || null,
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
