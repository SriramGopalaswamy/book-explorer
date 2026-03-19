// deno-lint-ignore-file
// @ts-nocheck
/**
 * workflow-engine: Background worker that processes workflow_runs.
 *
 * Designed to be called:
 *   - On a cron schedule (every 15 min via Supabase cron or external scheduler)
 *   - Manually via POST (no body required)
 *
 * Execution logic per run:
 *   1. Get current step from workflow_steps
 *   2. Execute based on step_type: delay | condition | action
 *   3. Advance to next step or complete/fail the run
 *
 * Action types supported:
 *   - send_email    → backward-compatible; internally maps to send_message(channel="email")
 *   - send_message  → new channel-agnostic action (channel: "email" | "whatsapp")
 *   - update_invoice_status
 *   - notify_internal
 *
 * Condition fields supported:
 *   - invoice.<column>         (e.g. invoice.status)
 *   - last_message.channel     (channel of the last message for this entity)
 *   - last_message.status      (delivery status of the last message)
 *   - last_message.created_at  (ISO timestamp of the last message)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Email helpers (same MS Graph pattern as send-notification-email) ─────────

const defaultSenderEmail = "admin@grx10.com";
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getMsGraphToken(creds: { tenantId: string; clientId: string; clientSecret: string }, cacheKey: string): Promise<string | null> {
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60000) return cached.token;

  try {
    const res = await fetch(`https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
    return data.access_token;
  } catch {
    return null;
  }
}

async function sendEmail(
  supabase: any,
  organizationId: string,
  to: { email: string; name?: string }[],
  subject: string,
  htmlBody: string
): Promise<boolean> {
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
      { tenantId: orgConfig.tenant_id, clientId: orgConfig.client_id, clientSecret: orgConfig.client_secret },
      organizationId
    );
  } else {
    // Fallback to env vars
    const tenantId = Deno.env.get("AZURE_TENANT_ID");
    const clientId = Deno.env.get("AZURE_CLIENT_ID");
    const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
    if (tenantId && clientId && clientSecret) {
      token = await getMsGraphToken({ tenantId, clientId, clientSecret }, "__global__");
    }
  }

  if (!token) {
    console.warn("[workflow-engine] No email token available");
    return false;
  }

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: htmlBody },
          toRecipients: to.map((r) => ({ emailAddress: { address: r.email, name: r.name || r.email } })),
          from: { emailAddress: { address: senderEmail, name: "GRX10 Finance" } },
        },
        saveToSentItems: false,
      }),
    });
    return res.ok || res.status === 202;
  } catch {
    return false;
  }
}

function emailHtml(heading: string, body: string): string {
  return `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px 12px 0 0; color: #fff;">
        <h1 style="margin: 0; font-size: 20px; color: #60a5fa;">📄 ${heading}</h1>
        <p style="margin: 8px 0 0; font-size: 13px; color: #aaa;">GRX10 Finance Automation</p>
      </div>
      <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px;">
        ${body}
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
        <p style="font-size: 12px; color: #999;">This is an automated message from GRX10 workflow engine.</p>
      </div>
    </div>
  `;
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

async function evaluateCondition(supabase: any, config: any, entityType: string, entityId: string): Promise<boolean> {
  const { field, operator, value } = config;
  if (!field || !operator) return true;

  // Resolve field value
  let actualValue: any = null;

  if (field.startsWith("invoice.")) {
    // ── invoice.<column> ──────────────────────────────────────────────────────
    const col = field.replace("invoice.", "");
    const { data: invoice } = await supabase
      .from("invoices")
      .select(col)
      .eq("id", entityId)
      .maybeSingle();
    actualValue = invoice?.[col];

  } else if (field.startsWith("last_message.")) {
    // ── last_message.<field> ──────────────────────────────────────────────────
    // Fetches the most recent messages row for this entity.
    const subField = field.replace("last_message.", "");
    const { data: lastMsg } = await supabase
      .from("messages")
      .select("channel, status, created_at, classification")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastMsg) {
      actualValue = lastMsg[subField] ?? null;
    }
  }

  // Evaluate operator
  switch (operator) {
    case "=":
    case "==":
      return String(actualValue) === String(value);
    case "!=":
      return String(actualValue) !== String(value);
    case ">":
      // Support ISO date comparison as well as numeric
      if (field === "last_message.created_at") {
        return new Date(actualValue).getTime() > new Date(value).getTime();
      }
      return Number(actualValue) > Number(value);
    case "<":
      if (field === "last_message.created_at") {
        return new Date(actualValue).getTime() < new Date(value).getTime();
      }
      return Number(actualValue) < Number(value);
    default:
      return true;
  }
}

// ─── Messaging helper: resolves invoice details for templates ─────────────────

async function buildInvoiceEmailContent(
  supabase: any,
  entityId: string,
  template: string
): Promise<{ heading: string; htmlBody: string; toEmail: string | null; clientName: string } | null> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number, client_name, client_email, amount, total_amount, due_date")
    .eq("id", entityId)
    .maybeSingle();

  if (!invoice) return null;

  const isReminder2 = template === "reminder_2";
  const amountStr = `₹${Number(invoice.total_amount || invoice.amount || 0).toLocaleString("en-IN")}`;
  const dueDateStr = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "N/A";

  const heading = isReminder2
    ? `Final Reminder: Invoice ${invoice.invoice_number}`
    : `Reminder: Invoice ${invoice.invoice_number}`;

  const bodyHtml = `
    <p style="color:#333; font-size:15px;">Dear <strong>${invoice.client_name}</strong>,</p>
    <p style="color:#555;">We wanted to ${isReminder2 ? "send a final reminder" : "follow up"} regarding Invoice <strong>${invoice.invoice_number}</strong> which remains unpaid.</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px; margin:16px 0;">
      <tr><td style="padding:8px 0; color:#666; width:160px;">Invoice Number</td><td style="color:#333; font-weight:600;">${invoice.invoice_number}</td></tr>
      <tr><td style="padding:8px 0; color:#666;">Amount Due</td><td style="color:#333; font-weight:600;">${amountStr}</td></tr>
      <tr><td style="padding:8px 0; color:#666;">Due Date</td><td style="color:#e74c3c; font-weight:600;">${dueDateStr}</td></tr>
    </table>
    <p style="color:#555;">Please arrange payment at your earliest convenience. If you have any questions, please don't hesitate to contact us.</p>
    ${isReminder2 ? '<p style="color:#e74c3c; font-weight:600;">⚠️ This is a final reminder before escalation.</p>' : ""}
  `;

  return {
    heading,
    htmlBody: emailHtml(heading, bodyHtml),
    toEmail: invoice.client_email,
    clientName: invoice.client_name,
  };
}

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  supabase: any,
  config: any,
  run: any,
  organizationId: string
): Promise<void> {
  const { action_type } = config;

  // ── send_message: channel-agnostic new action ─────────────────────────────
  // ── send_email: backward-compatible; internally maps to send_message(channel="email")
  if (action_type === "send_message" || action_type === "send_email") {
    const channel = action_type === "send_email" ? "email" : (config.channel || "email");
    const template = config.template || "reminder_1";

    if (channel === "email") {
      // Build email content from invoice + template (same logic as before)
      const built = await buildInvoiceEmailContent(supabase, run.entity_id, template);

      if (!built) {
        console.warn("[workflow-engine] Invoice not found for email action:", run.entity_id);
        return;
      }

      const toEmail = config.to === "client_email" || !config.to
        ? built.toEmail
        : config.to;

      if (toEmail) {
        const sent = await sendEmail(
          supabase,
          organizationId,
          [{ email: toEmail, name: built.clientName }],
          built.heading,
          built.htmlBody
        );

        const msgStatus = sent ? "sent" : "failed";

        // Log to legacy email_logs (unchanged — backward compatibility)
        await supabase.from("email_logs").insert({
          organization_id: organizationId,
          invoice_id: run.entity_id,
          direction: "outbound",
          subject: built.heading,
          from_email: defaultSenderEmail,
          to_email: toEmail,
          body_text: `Reminder email sent for Invoice. Template: ${template}.`,
          raw_payload: { template, sent, workflow_run_id: run.id },
        }).catch(() => {/* non-critical */});

        // Log to new messages table (channel-agnostic record)
        await supabase.from("messages").insert({
          entity_type: run.entity_type,
          entity_id: run.entity_id,
          channel: "email",
          direction: "outbound",
          recipient: toEmail,
          subject: built.heading,
          content: `Reminder email. Template: ${template}.`,
          template,
          status: msgStatus,
          organization_id: organizationId,
          metadata: { workflow_run_id: run.id, action_type },
        }).catch(() => {/* non-critical */});
      }

    } else if (channel === "whatsapp") {
      // TODO: WhatsApp integration — for now log stub row to messages table
      console.log(`[workflow-engine] [WhatsApp STUB] Would send whatsapp for entity ${run.entity_id}`);
      await supabase.from("messages").insert({
        entity_type: run.entity_type,
        entity_id: run.entity_id,
        channel: "whatsapp",
        direction: "outbound",
        recipient: config.to || null,
        content: config.content || `Reminder. Template: ${template}.`,
        template,
        status: "pending",
        organization_id: organizationId,
        metadata: { workflow_run_id: run.id, action_type, todo: "WhatsApp API not yet integrated" },
      }).catch(() => {/* non-critical */});
    }

  } else if (action_type === "update_invoice_status") {
    const { status } = config;
    if (status) {
      await supabase
        .from("invoices")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", run.entity_id);
    }

  } else if (action_type === "notify_internal") {
    const { message = "Invoice pending acknowledgement" } = config;

    // Insert in-app notifications for all finance/admin users in org
    const { data: finUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["finance", "admin"]);

    // Get invoice number for context
    const { data: invoice } = await supabase
      .from("invoices")
      .select("invoice_number, client_name")
      .eq("id", run.entity_id)
      .maybeSingle();

    const title = invoice
      ? `Invoice ${invoice.invoice_number} — ${message}`
      : message;

    for (const fu of finUsers || []) {
      await supabase.from("notifications").insert({
        user_id: fu.user_id,
        title,
        message: invoice
          ? `Client: ${invoice.client_name} | ${message}`
          : message,
        type: "finance",
        link: "/financial/invoicing",
      }).catch(() => {/* non-critical */});
    }
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

  const now = new Date().toISOString();
  let processed = 0;
  let errors = 0;
  const errorList: string[] = [];

  try {
    // Fetch all due workflow runs
    const { data: runs, error: fetchErr } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("status", "running")
      .lte("next_run_at", now)
      .order("next_run_at", { ascending: true })
      .limit(50); // Process up to 50 at a time

    if (fetchErr) throw fetchErr;

    if (!runs || runs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No workflow runs due", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const run of runs) {
      try {
        // Get workflow steps ordered
        const { data: steps, error: stepsErr } = await supabase
          .from("workflow_steps")
          .select("*")
          .eq("workflow_id", run.workflow_id)
          .order("step_order", { ascending: true });

        if (stepsErr) throw stepsErr;

        if (!steps || steps.length === 0) {
          // No steps — mark complete
          await supabase
            .from("workflow_runs")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", run.id);
          continue;
        }

        // current_step is 0-indexed into steps array
        const stepIndex = run.current_step ?? 0;

        if (stepIndex >= steps.length) {
          // All steps done
          await supabase
            .from("workflow_runs")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", run.id);
          await supabase.from("workflow_events").insert({
            organization_id: run.organization_id,
            workflow_run_id: run.id,
            event_type: "run_completed",
            entity_type: run.entity_type,
            entity_id: run.entity_id,
            payload: { total_steps: steps.length },
          });
          continue;
        }

        const step = steps[stepIndex];
        const config = step.config || {};
        const nextStepIndex = stepIndex + 1;
        const hasMoreSteps = nextStepIndex < steps.length;

        // Log step execution
        await supabase.from("workflow_events").insert({
          organization_id: run.organization_id,
          workflow_run_id: run.id,
          event_type: `step_${step.step_type}_executed`,
          entity_type: run.entity_type,
          entity_id: run.entity_id,
          payload: { step_order: step.step_order, step_type: step.step_type, config },
        });

        if (step.step_type === "delay") {
          const durationHours = Number(config.duration_hours ?? 24);
          const nextRunAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

          await supabase
            .from("workflow_runs")
            .update({
              current_step: nextStepIndex,
              next_run_at: nextRunAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", run.id);

        } else if (step.step_type === "condition") {
          const conditionMet = await evaluateCondition(supabase, config, run.entity_type, run.entity_id);

          if (!conditionMet) {
            // Condition false → workflow complete (stop)
            await supabase
              .from("workflow_runs")
              .update({ status: "completed", updated_at: new Date().toISOString() })
              .eq("id", run.id);
            await supabase.from("workflow_events").insert({
              organization_id: run.organization_id,
              workflow_run_id: run.id,
              event_type: "condition_false_stopped",
              entity_type: run.entity_type,
              entity_id: run.entity_id,
              payload: { step_order: step.step_order, reason: "Condition evaluated to false" },
            });
          } else {
            // Condition true → advance to next step immediately
            await supabase
              .from("workflow_runs")
              .update({
                current_step: nextStepIndex,
                next_run_at: hasMoreSteps ? new Date().toISOString() : null,
                status: hasMoreSteps ? "running" : "completed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", run.id);
          }

        } else if (step.step_type === "action") {
          await executeAction(supabase, config, run, run.organization_id);

          // Advance to next step
          await supabase
            .from("workflow_runs")
            .update({
              current_step: nextStepIndex,
              next_run_at: hasMoreSteps ? new Date().toISOString() : null,
              status: hasMoreSteps ? "running" : "completed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", run.id);

          if (!hasMoreSteps) {
            await supabase.from("workflow_events").insert({
              organization_id: run.organization_id,
              workflow_run_id: run.id,
              event_type: "run_completed",
              entity_type: run.entity_type,
              entity_id: run.entity_id,
              payload: { total_steps: steps.length },
            });
          }
        }

        processed++;
      } catch (runErr: any) {
        errors++;
        errorList.push(`run ${run.id}: ${runErr.message}`);
        // Mark run as failed
        await supabase
          .from("workflow_runs")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", run.id)
          .catch(() => {});
        await supabase.from("workflow_events").insert({
          organization_id: run.organization_id,
          workflow_run_id: run.id,
          event_type: "run_failed",
          entity_type: run.entity_type,
          entity_id: run.entity_id,
          payload: { error: runErr.message },
        }).catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${processed} workflow run(s)`,
        processed,
        total_due: runs.length,
        errors: errorList.length > 0 ? errorList : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[workflow-engine] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
