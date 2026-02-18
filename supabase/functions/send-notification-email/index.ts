// deno-lint-ignore-file
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Get an app-only access token using client credentials flow
async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get Graph token: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// Send email via MS Graph API — returns false on failure instead of throwing
async function sendEmail(
  accessToken: string | null,
  senderEmail: string,
  toRecipients: { email: string; name?: string }[],
  subject: string,
  htmlBody: string
): Promise<boolean> {
  if (!accessToken) {
    console.warn("No Graph token available — skipping email to:", toRecipients.map(r => r.email));
    return false;
  }
  try {
    const message = {
      message: {
        subject,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: toRecipients.map((r) => ({
          emailAddress: { address: r.email, name: r.name || r.email },
        })),
      },
      saveToSentItems: false,
    };

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn(`Graph sendMail failed [${res.status}]: ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("sendEmail exception:", err);
    return false;
  }
}

// Helper to insert in-app notifications — always runs, never throws
async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  message: string,
  type: string,
  link?: string
) {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    });
    if (error) console.warn("Failed to insert notification:", error.message);
  } catch (err) {
    console.warn("insertNotification exception:", err);
  }
}

// Shared email template wrapper
function emailTemplate(headerColor: string, icon: string, heading: string, subheading: string, rows: string, footer?: string, extraBlock?: string) {
  return `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px 12px 0 0; color: #fff;">
        <h1 style="margin: 0 0 8px; font-size: 20px; color: ${headerColor};">${icon} ${heading}</h1>
        <p style="margin: 0; font-size: 13px; color: #aaa;">${subheading}</p>
      </div>
      <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${rows}
        </table>
        ${extraBlock || ""}
        ${footer ? `<p style="margin-top: 16px; font-size: 13px; color: #666;">${footer}</p>` : ""}
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
        <p style="font-size: 12px; color: #999;">This is an automated notification from GRX10 — sent from the admin account on behalf of the system.</p>
      </div>
    </div>
  `;
}

function tableRow(label: string, value: string, bold = false) {
  return `<tr><td style="padding: 8px 0; color: #666; width: 160px;">${label}</td><td style="padding: 8px 0; color: #333; ${bold ? "font-weight: 600;" : ""}">${value}</td></tr>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { type, payload } = await req.json();

    // Try to get Graph token — email is best-effort; in-app notifications ALWAYS run
    let accessToken: string | null = null;
    try {
      accessToken = await getGraphToken();
    } catch (err) {
      console.warn("Could not obtain Graph token — emails will be skipped:", err);
    }
    const senderEmail = "sriram@grx10.com";

    // ─── MEMO PUBLISHED ───────────────────────────────────────────────────────
    if (type === "memo_published") {
      const { memo_id } = payload;

      const { data: memo, error: memoError } = await supabase
        .from("memos")
        .select("*")
        .eq("id", memo_id)
        .single();

      if (memoError || !memo) throw new Error(`Memo not found: ${memoError?.message}`);

      let recipientEmails: string[] = [];
      if (memo.recipients && memo.recipients.length > 0) {
        recipientEmails = memo.recipients;
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("email")
          .eq("status", "active")
          .not("email", "is", null);
        recipientEmails = (profiles || []).map((p: any) => p.email!).filter(Boolean);
      }

      const { data: recipientProfiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("email", recipientEmails)
        .not("user_id", "is", null);

      // In-app notifications — always runs
      for (const profile of recipientProfiles || []) {
        await insertNotification(
          supabase, profile.user_id,
          `📢 New Memo: ${memo.title}`,
          memo.excerpt || memo.content?.substring(0, 150) || "New memo published",
          "memo", "/performance/memos"
        );
      }

      // Emails — best-effort
      if (recipientEmails.length > 0 && accessToken) {
        const htmlBody = emailTemplate(
          "#e94560", "📢", `New Memo: ${memo.title}`,
          `From ${memo.author_name} · ${memo.department} · Priority: ${memo.priority}`,
          tableRow("Content", memo.excerpt || memo.content || "No content")
        );
        const recipients = recipientEmails.map((email) => ({ email }));
        for (let i = 0; i < recipients.length; i += 50) {
          const batch = recipients.slice(i, i + 50);
          await sendEmail(accessToken, senderEmail, batch, `📢 New Memo: ${memo.title}`, htmlBody);
        }
      }

      return new Response(
        JSON.stringify({ success: true, sent_to: recipientEmails.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── LEAVE REQUEST CREATED ────────────────────────────────────────────────
    if (type === "leave_request_created") {
      const { leave_request_id } = payload;

      const { data: leave, error: leaveError } = await supabase
        .from("leave_requests")
        .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
        .eq("id", leave_request_id)
        .single();

      if (leaveError || !leave) throw new Error(`Leave request not found: ${leaveError?.message}`);

      const employeeName = (leave as any).profiles?.full_name || "An employee";
      const employeeEmail = (leave as any).profiles?.email;
      const employeeUserId = (leave as any).profiles?.user_id;
      const managerId = (leave as any).profiles?.manager_id;

      let manager: { email: string; full_name: string | null; user_id: string } | null = null;
      if (managerId) {
        const { data } = await supabase
          .from("profiles")
          .select("email, full_name, user_id")
          .eq("id", managerId)
          .single();
        manager = data;
      }

      const leaveRows = [
        tableRow("Type", leave.leave_type, true),
        tableRow("From", leave.from_date),
        tableRow("To", leave.to_date),
        tableRow("Days", String(leave.days), true),
        ...(leave.reason ? [tableRow("Reason", leave.reason)] : []),
      ].join("");

      // ── In-app notifications (always run) ──
      if (manager?.user_id) {
        await insertNotification(
          supabase, manager.user_id,
          `Leave Request from ${employeeName}`,
          `${employeeName} requested ${leave.days} day(s) of ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date})`,
          "leave_request", "/hrms/inbox"
        );
      }
      if (employeeUserId) {
        await insertNotification(
          supabase, employeeUserId,
          "Leave Request Submitted",
          `Your ${leave.leave_type} leave request (${leave.from_date} to ${leave.to_date}) has been submitted and is pending approval.`,
          "leave_request", "/hrms/leaves"
        );
      }

      // ── Emails (best-effort) ──
      if (manager?.email) {
        const htmlBody = emailTemplate(
          "#f5a623", "🗓️", `Leave Request from ${employeeName}`,
          "Requires your approval",
          leaveRows,
          "Please log in to <strong>GRX10</strong> to approve or reject this request."
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: manager.email, name: manager.full_name || undefined }],
          `🗓️ Leave Request from ${employeeName} — Approval Required`,
          htmlBody
        );
      }
      if (employeeEmail) {
        const htmlBody = emailTemplate(
          "#3498db", "📋", "Leave Request Submitted",
          `Hi ${employeeName}, your leave request has been submitted and is pending approval.`,
          leaveRows
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: employeeEmail, name: employeeName }],
          `📋 Leave Request Submitted — Awaiting Approval`,
          htmlBody
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── LEAVE REQUEST DECIDED ────────────────────────────────────────────────
    if (type === "leave_request_decided") {
      const { leave_request_id, decision, reviewer_name } = payload;

      const { data: leave, error: leaveError } = await supabase
        .from("leave_requests")
        .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
        .eq("id", leave_request_id)
        .single();

      if (leaveError || !leave) throw new Error(`Leave request not found: ${leaveError?.message}`);

      const employeeEmail = (leave as any).profiles?.email;
      const employeeName = (leave as any).profiles?.full_name || "Employee";
      const employeeUserId = (leave as any).profiles?.user_id;
      const managerId = (leave as any).profiles?.manager_id;

      const isApproved = decision === "approved";
      const statusColor = isApproved ? "#27ae60" : "#e74c3c";
      const statusIcon = isApproved ? "✅" : "❌";
      const statusText = isApproved ? "Approved" : "Rejected";

      let manager: { email: string; full_name: string | null; user_id: string } | null = null;
      if (managerId) {
        const { data } = await supabase
          .from("profiles")
          .select("email, full_name, user_id")
          .eq("id", managerId)
          .single();
        manager = data;
      }

      const leaveRows = [
        tableRow("Status", statusText, true),
        tableRow("Type", leave.leave_type),
        tableRow("From", leave.from_date),
        tableRow("To", leave.to_date),
        tableRow("Days", String(leave.days), true),
        ...(reviewer_name ? [tableRow("Reviewed by", reviewer_name)] : []),
      ].join("");

      // ── In-app notifications (always run) ──
      const empUserId = employeeUserId || (await supabase
        .from("profiles").select("user_id").eq("id", leave.profile_id).maybeSingle()
      ).data?.user_id;

      if (empUserId) {
        await insertNotification(
          supabase, empUserId,
          `Leave ${statusText}`,
          `Your ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date}) has been ${decision}.`,
          isApproved ? "leave_approved" : "leave_rejected",
          "/hrms/leaves"
        );
      }
      if (manager?.user_id) {
        await insertNotification(
          supabase, manager.user_id,
          `Leave ${statusText} — ${employeeName}`,
          `${employeeName}'s ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date}) was ${decision}.`,
          isApproved ? "leave_approved" : "leave_rejected",
          "/hrms/inbox"
        );
      }

      // ── Emails (best-effort) ──
      if (employeeEmail) {
        const htmlBody = emailTemplate(
          statusColor, statusIcon, `Leave Request ${statusText}`,
          `Hi ${employeeName}, your leave request has been ${decision}.`,
          leaveRows
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: employeeEmail, name: employeeName }],
          `${statusIcon} Leave Request ${statusText} — ${employeeName}`,
          htmlBody
        );
      }
      if (manager?.email && manager.email !== employeeEmail) {
        const htmlBody = emailTemplate(
          statusColor, statusIcon, `Leave ${statusText} — ${employeeName}`,
          `This confirms you ${decision} ${employeeName}'s leave request.`,
          leaveRows
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: manager.email, name: manager.full_name || undefined }],
          `${statusIcon} Confirmation: Leave ${statusText} for ${employeeName}`,
          htmlBody
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CORRECTION REQUEST CREATED ───────────────────────────────────────────
    if (type === "correction_request_created") {
      const { correction_request_id } = payload;

      const { data: correction, error: corrError } = await supabase
        .from("attendance_correction_requests")
        .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
        .eq("id", correction_request_id)
        .single();

      if (corrError || !correction) throw new Error(`Correction request not found: ${corrError?.message}`);

      const employeeName = (correction as any).profiles?.full_name || "An employee";
      const employeeEmail = (correction as any).profiles?.email;
      const employeeUserId = (correction as any).profiles?.user_id;
      const managerId = (correction as any).profiles?.manager_id;

      let manager: { email: string; full_name: string | null; user_id: string } | null = null;
      if (managerId) {
        const { data } = await supabase
          .from("profiles")
          .select("email, full_name, user_id")
          .eq("id", managerId)
          .single();
        manager = data;
      }

      const correctionRows = [
        tableRow("Date", correction.date, true),
        ...(correction.requested_check_in ? [tableRow("Requested Check-in", correction.requested_check_in)] : []),
        ...(correction.requested_check_out ? [tableRow("Requested Check-out", correction.requested_check_out)] : []),
        tableRow("Reason", correction.reason),
      ].join("");

      // ── In-app notifications (always run) ──
      if (manager?.user_id) {
        await insertNotification(
          supabase, manager.user_id,
          `Correction Request from ${employeeName}`,
          `${employeeName} submitted an attendance correction for ${correction.date}.`,
          "leave_request", "/hrms/inbox"
        );
      }
      if (employeeUserId) {
        await insertNotification(
          supabase, employeeUserId,
          "Correction Request Submitted",
          `Your attendance correction for ${correction.date} has been submitted and is pending review.`,
          "leave_request", "/hrms/my-attendance"
        );
      }

      // ── Emails (best-effort) ──
      if (manager?.email) {
        const htmlBody = emailTemplate(
          "#f5a623", "📝", `Attendance Correction Request from ${employeeName}`,
          "Requires your review",
          correctionRows,
          "Please log in to <strong>GRX10</strong> to approve or reject this correction request."
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: manager.email, name: manager.full_name || undefined }],
          `📝 Attendance Correction Request from ${employeeName} — Review Required`,
          htmlBody
        );
      }
      if (employeeEmail) {
        const htmlBody = emailTemplate(
          "#3498db", "📋", "Attendance Correction Submitted",
          `Hi ${employeeName}, your correction request has been submitted and is pending review.`,
          correctionRows
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: employeeEmail, name: employeeName }],
          `📋 Attendance Correction Submitted — Awaiting Review`,
          htmlBody
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CORRECTION REQUEST DECIDED ───────────────────────────────────────────
    if (type === "correction_request_decided") {
      const { correction_request_id, decision, reviewer_name } = payload;

      const { data: correction, error: corrError } = await supabase
        .from("attendance_correction_requests")
        .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
        .eq("id", correction_request_id)
        .single();

      if (corrError || !correction) throw new Error(`Correction request not found: ${corrError?.message}`);

      const employeeEmail = (correction as any).profiles?.email;
      const employeeName = (correction as any).profiles?.full_name || "Employee";
      const employeeUserId = (correction as any).profiles?.user_id;
      const managerId = (correction as any).profiles?.manager_id;

      const isApproved = decision === "approved";
      const statusIcon = isApproved ? "✅" : "❌";
      const statusText = isApproved ? "Approved" : "Rejected";
      const statusColor = isApproved ? "#27ae60" : "#e74c3c";

      let manager: { email: string; full_name: string | null; user_id: string } | null = null;
      if (managerId) {
        const { data } = await supabase
          .from("profiles")
          .select("email, full_name, user_id")
          .eq("id", managerId)
          .single();
        manager = data;
      }

      const correctionRows = [
        tableRow("Status", statusText, true),
        tableRow("Date", correction.date),
        ...(correction.requested_check_in ? [tableRow("Requested Check-in", correction.requested_check_in)] : []),
        ...(correction.requested_check_out ? [tableRow("Requested Check-out", correction.requested_check_out)] : []),
        ...(reviewer_name ? [tableRow("Reviewed by", reviewer_name)] : []),
      ].join("");

      // Prominent reviewer notes block shown only in employee email
      const reviewerNotesBlock = correction.reviewer_notes
        ? `
          <div style="margin: 20px 0 4px; border-left: 4px solid ${statusColor}; background: ${isApproved ? "#f0faf4" : "#fdf2f2"}; border-radius: 0 8px 8px 0; padding: 14px 16px;">
            <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${statusColor};">📝 Reviewer Notes</p>
            <p style="margin: 0; font-size: 15px; color: #333; line-height: 1.5;">${correction.reviewer_notes}</p>
          </div>`
        : "";

      // ── In-app notifications (always run) ──
      if (employeeUserId) {
        await insertNotification(
          supabase, employeeUserId,
          `Attendance Correction ${statusText}`,
          `Your attendance correction for ${correction.date} has been ${decision}.${correction.reviewer_notes ? ` Note: ${correction.reviewer_notes}` : ""}`,
          isApproved ? "leave_approved" : "leave_rejected",
          "/hrms/my-attendance"
        );
      }
      if (manager?.user_id) {
        await insertNotification(
          supabase, manager.user_id,
          `Correction ${statusText} — ${employeeName}`,
          `${employeeName}'s attendance correction for ${correction.date} was ${decision}.`,
          isApproved ? "leave_approved" : "leave_rejected",
          "/hrms/inbox"
        );
      }

      // ── Emails (best-effort) ──
      if (employeeEmail) {
        const htmlBody = emailTemplate(
          statusColor, statusIcon, `Attendance Correction ${statusText}`,
          `Hi ${employeeName}, your correction request has been ${decision}.`,
          correctionRows,
          undefined,
          reviewerNotesBlock
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: employeeEmail, name: employeeName }],
          `${statusIcon} Attendance Correction ${statusText} — ${correction.date}`,
          htmlBody
        );
      }
      if (manager?.email && manager.email !== employeeEmail) {
        const htmlBody = emailTemplate(
          statusColor, statusIcon, `Correction ${statusText} — ${employeeName}`,
          `This confirms you ${decision} ${employeeName}'s attendance correction request.`,
          correctionRows
        );
        await sendEmail(
          accessToken, senderEmail,
          [{ email: manager.email, name: manager.full_name || undefined }],
          `${statusIcon} Confirmation: Correction ${statusText} for ${employeeName}`,
          htmlBody
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid notification type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Notification email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
