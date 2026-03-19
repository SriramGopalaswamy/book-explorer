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
 *   - send_email    → backward-compatible; maps to send_message(channel="email")
 *   - send_message  → new channel-agnostic action; delegates to messaging-service
 *   - update_invoice_status
 *   - notify_internal
 *
 * Email transport chain for send_email / send_message(channel="email"):
 *   workflow-engine (template render)
 *     → messaging-service (channel routing + messages table)
 *       → send-notification-email (MS Graph transport)
 *   email_logs also written here for backward compatibility.
 *
 * Condition fields supported:
 *   - invoice.<column>              e.g. invoice.status
 *   - last_message.channel          channel of last message for this entity
 *   - last_message.status           delivery status of last message
 *   - last_message.created_at       ISO timestamp of last message
 *   - last_message.classification   AI classification of last inbound message
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const defaultSenderEmail = "admin@grx10.com";

// ─── Email HTML renderer (template rendering stays here — business logic) ─────

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

// ─── Invoice email content builder (fetches data + renders template HTML) ──────

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

// ─── Condition evaluator ──────────────────────────────────────────────────────

async function evaluateCondition(
  supabase: any,
  config: any,
  entityType: string,
  entityId: string
): Promise<boolean> {
  const { field, operator, value } = config;
  if (!field || !operator) return true;

  let actualValue: any = null;

  if (field.startsWith("invoice.")) {
    // invoice.<column> — original behaviour, unchanged
    const col = field.replace("invoice.", "");
    const { data: invoice } = await supabase
      .from("invoices")
      .select(col)
      .eq("id", entityId)
      .maybeSingle();
    actualValue = invoice?.[col];

  } else if (field.startsWith("last_message.")) {
    // last_message.<field> — query messages table for most recent entry
    // Supported: channel, status, created_at, classification
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

  switch (operator) {
    case "=":
    case "==":
      return String(actualValue) === String(value);
    case "!=":
      return String(actualValue) !== String(value);
    case ">":
      if (field === "last_message.created_at") {
        if (!actualValue || !value) return false;
        const aTime = new Date(actualValue).getTime();
        const vTime = new Date(value).getTime();
        if (isNaN(aTime) || isNaN(vTime)) return false;
        return aTime > vTime;
      }
      return Number(actualValue) > Number(value);
    case "<":
      if (field === "last_message.created_at") {
        if (!actualValue || !value) return false;
        const aTime2 = new Date(actualValue).getTime();
        const vTime2 = new Date(value).getTime();
        if (isNaN(aTime2) || isNaN(vTime2)) return false;
        return aTime2 < vTime2;
      }
      return Number(actualValue) < Number(value);
    default:
      return true;
  }
}

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  supabase: any,
  config: any,
  run: any,
  organizationId: string
): Promise<void> {
  const { action_type } = config;

  // ── send_email / send_message ─────────────────────────────────────────────
  // send_email is fully backward-compatible: mapped to channel="email".
  // send_message is the new action; channel defaults to "email" if omitted.
  // Both delegate transport to messaging-service, which in turn calls
  // send-notification-email for email. This engine never touches MS Graph.
  if (action_type === "send_message" || action_type === "send_email") {
    const channel = action_type === "send_email" ? "email" : (config.channel || "email");
    const template = config.template || "reminder_1";

    if (channel === "email") {
      // 1. Build content from invoice data + template (business logic stays here)
      const built = await buildInvoiceEmailContent(supabase, run.entity_id, template);
      if (!built) {
        console.warn("[workflow-engine] Invoice not found for email action:", run.entity_id);
        return;
      }

      const toEmail =
        config.to === "client_email" || !config.to ? built.toEmail : config.to;

      if (!toEmail) return;

      // 2. Delegate to messaging-service (which routes to send-notification-email
      //    and writes to the messages table). This is the single outbound path.
      let messagingStatus = "failed";
      let messageId: string | null = null;

      try {
        const { data: msgResult, error: msgErr } = await supabase.functions.invoke(
          "messaging-service",
          {
            body: {
              channel: "email",
              to: toEmail,
              sender_name: built.clientName,
              subject: built.heading,
              html_body: built.htmlBody,
              content: `Reminder email. Template: ${template}.`,
              template,
              entity_type: run.entity_type,
              entity_id: run.entity_id,
              organization_id: organizationId,
            },
          }
        );

        if (msgErr) {
          console.warn("[workflow-engine] messaging-service error:", msgErr);
        } else {
          messagingStatus = msgResult?.status ?? "failed";
          messageId = msgResult?.message_id ?? null;
        }
      } catch (err) {
        console.warn("[workflow-engine] Failed to invoke messaging-service:", err);
      }

      // 3. Write to legacy email_logs (backward compatibility — unchanged behaviour)
      await supabase.from("email_logs").insert({
        organization_id: organizationId,
        invoice_id: run.entity_id,
        direction: "outbound",
        subject: built.heading,
        from_email: defaultSenderEmail,
        to_email: toEmail,
        body_text: `Reminder email sent for Invoice. Template: ${template}.`,
        raw_payload: {
          template,
          sent: messagingStatus === "sent",
          workflow_run_id: run.id,
          message_id: messageId,
        },
      }).catch(() => {/* non-critical */});

    } else if (channel === "whatsapp") {
      // Resolve recipient phone number and invoice data for template variables
      const { data: invoiceForWA } = await supabase
        .from("invoices")
        .select("invoice_number, client_name, client_phone, amount, total_amount, due_date")
        .eq("id", run.entity_id)
        .maybeSingle();

      const toPhone = config.to || invoiceForWA?.client_phone || null;

      if (!toPhone) {
        console.warn("[workflow-engine] No phone number for WhatsApp action on entity:", run.entity_id);
        // Log a failed message row so the gap is visible in the dashboard
        await supabase.from("messages").insert({
          entity_type: run.entity_type,
          entity_id: run.entity_id,
          channel: "whatsapp",
          direction: "outbound",
          recipient: null,
          content: config.content || `Reminder. Template: ${template}.`,
          template,
          status: "failed",
          organization_id: organizationId,
          metadata: { workflow_run_id: run.id, action_type, error: "No client_phone on invoice" },
        }).catch(() => {});
        return;
      }

      // Build template variable values from invoice data
      const amountStr = invoiceForWA
        ? `₹${Number(invoiceForWA.total_amount || invoiceForWA.amount || 0).toLocaleString("en-IN")}`
        : "N/A";
      const dueDateStr = invoiceForWA?.due_date
        ? new Date(invoiceForWA.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "N/A";

      const templateVariables = {
        client_name: invoiceForWA?.client_name || "Customer",
        invoice_number: invoiceForWA?.invoice_number || "",
        amount: amountStr,
        due_date: dueDateStr,
      };

      // Delegate to messaging-service (which resolves template + sends via provider)
      let waMessagingStatus = "failed";
      let waMessageId: string | null = null;

      try {
        const { data: msgResult, error: msgErr } = await supabase.functions.invoke("messaging-service", {
          body: {
            channel: "whatsapp",
            to: toPhone,
            content: config.content || `Invoice ${invoiceForWA?.invoice_number || ""} reminder. Amount: ${amountStr}. Due: ${dueDateStr}.`,
            template,
            variables: templateVariables,
            entity_type: run.entity_type,
            entity_id: run.entity_id,
            organization_id: organizationId,
          },
        });

        if (msgErr) {
          console.warn("[workflow-engine] messaging-service (whatsapp) error:", msgErr);
        } else {
          waMessagingStatus = msgResult?.status ?? "failed";
          waMessageId = msgResult?.message_id ?? null;
        }
      } catch (err) {
        console.warn("[workflow-engine] Failed to invoke messaging-service (whatsapp):", err);
      }

      // Log WhatsApp action result to workflow_events (parity with email logging)
      await supabase.from("workflow_events").insert({
        organization_id: organizationId,
        workflow_run_id: run.id,
        event_type: "whatsapp_message_sent",
        entity_type: run.entity_type,
        entity_id: run.entity_id,
        payload: {
          template,
          to_phone: toPhone,
          sent: waMessagingStatus === "sent",
          status: waMessagingStatus,
          message_id: waMessageId,
        },
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

    // Insert in-app notifications for all finance/admin users in this org only
    const { data: finUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", organizationId)
      .in("role", ["finance", "admin"]);

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
  const errorList: string[] = [];

  try {
    // Use an atomic claim pattern to prevent duplicate processing by concurrent
    // cron invocations: update next_run_at to a future time before processing,
    // then set the real next_run_at after step execution.
    const claimUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min claim window

    const { data: runs, error: fetchErr } = await supabase
      .rpc("claim_workflow_runs", { p_now: now, p_claim_until: claimUntil, p_limit: 50 })
      .then((result: any) => {
        // Fallback to direct query if RPC doesn't exist yet
        if (result.error?.code === "42883") {
          return supabase
            .from("workflow_runs")
            .select("*")
            .eq("status", "running")
            .lte("next_run_at", now)
            .order("next_run_at", { ascending: true })
            .limit(50);
        }
        return result;
      });

    if (fetchErr) throw fetchErr;

    if (!runs || runs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No workflow runs due", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const run of runs) {
      try {
        const { data: steps, error: stepsErr } = await supabase
          .from("workflow_steps")
          .select("*")
          .eq("workflow_id", run.workflow_id)
          .order("step_order", { ascending: true });

        if (stepsErr) throw stepsErr;

        if (!steps || steps.length === 0) {
          await supabase
            .from("workflow_runs")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", run.id);
          continue;
        }

        const stepIndex = run.current_step ?? 0;

        if (stepIndex >= steps.length) {
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
          const conditionMet = await evaluateCondition(
            supabase, config, run.entity_type, run.entity_id
          );

          if (!conditionMet) {
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
        errorList.push(`run ${run.id}: ${runErr.message}`);
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
