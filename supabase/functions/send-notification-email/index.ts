// deno-lint-ignore-file
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const senderEmail = "admin@grx10.com";

// Send email via Resend API — returns false on failure instead of throwing
async function sendEmail(
  toRecipients: { email: string; name?: string }[],
  subject: string,
  htmlBody: string
): Promise<boolean> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured — skipping email to:", toRecipients.map(r => r.email));
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `GRX10 <${senderEmail}>`,
        to: toRecipients.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
        subject,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`Resend API failed [${res.status}]: ${err}`);
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let type: string;
  let payload: Record<string, unknown>;

  try {
    const body = await req.json();
    type = body.type;
    payload = body.payload;
  } catch (err) {
    console.error("Failed to parse request body:", err);
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {

    // ─── TEST EMAIL ───────────────────────────────────────────────────────────
    if (type === "test_email") {
      const { to_email, to_name, subject, message } = payload as any;
      if (!to_email) {
        return new Response(JSON.stringify({ error: "to_email is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const htmlBody = emailTemplate("#3498db", "🧪", subject || "Test Notification", "This is a test email from GRX10 system.", tableRow("Message", String(message || "Hello! The email notification system is working correctly.")));
      const sent = await sendEmail([{ email: String(to_email), name: String(to_name || to_email) }], String(subject || "🧪 Test Notification from GRX10"), htmlBody);
      return new Response(JSON.stringify({ success: true, email_sent: sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MEMO PUBLISHED ───────────────────────────────────────────────────────
    if (type === "memo_published") {
      const { memo_id } = payload;
      let memo: any = null;
      let recipientEmails: string[] = [];
      let recipientProfiles: any[] = [];

      try {
        const { data, error: memoError } = await supabase.from("memos").select("*").eq("id", memo_id).single();
        if (memoError || !data) throw new Error(`Memo not found: ${memoError?.message}`);
        memo = data;

        if (memo.recipients && memo.recipients.length > 0) {
          recipientEmails = memo.recipients;
        } else {
          const { data: profiles } = await supabase.from("profiles").select("email").eq("status", "active").not("email", "is", null);
          recipientEmails = (profiles || []).map((p: any) => p.email!).filter(Boolean);
        }
        const { data: rp } = await supabase.from("profiles").select("user_id, email").in("email", recipientEmails).not("user_id", "is", null);
        recipientProfiles = rp || [];
      } catch (err) {
        console.error("memo_published: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      for (const profile of recipientProfiles) {
        await insertNotification(supabase, profile.user_id, `📢 New Memo: ${memo.title}`, memo.excerpt || memo.content?.substring(0, 150) || "New memo published", "memo", "/performance/memos");
      }

      try {
        if (recipientEmails.length > 0) {
          const htmlBody = emailTemplate("#e94560", "📢", `New Memo: ${memo.title}`, `From ${memo.author_name} · ${memo.department} · Priority: ${memo.priority}`, tableRow("Content", memo.excerpt || memo.content || "No content"));
          const recipients = recipientEmails.map((email: string) => ({ email }));
          for (let i = 0; i < recipients.length; i += 50) {
            await sendEmail(recipients.slice(i, i + 50), `📢 New Memo: ${memo.title}`, htmlBody);
          }
        }
      } catch (emailErr) {
        console.warn("memo_published: email send failed (in-app notifications already created):", emailErr);
      }

      return new Response(JSON.stringify({ success: true, sent_to: recipientEmails.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── LEAVE REQUEST CREATED ────────────────────────────────────────────────
    if (type === "leave_request_created") {
      const { leave_request_id } = payload;
      let leave: any = null;
      let manager: any = null;

      try {
        const { data, error: leaveError } = await supabase
          .from("leave_requests")
          .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
          .eq("id", leave_request_id)
          .single();
        if (leaveError || !data) throw new Error(`Leave request not found: ${leaveError?.message}`);
        leave = data;
        const managerId = (leave as any).profiles?.manager_id;
        if (managerId) {
          const { data: mgr } = await supabase.from("profiles").select("email, full_name, user_id").eq("id", managerId).single();
          manager = mgr;
        }
      } catch (err) {
        console.error("leave_request_created: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeName = (leave as any).profiles?.full_name || "An employee";
      const employeeEmail = (leave as any).profiles?.email;
      const employeeUserId = (leave as any).profiles?.user_id;
      const leaveRows = [
        tableRow("Type", leave.leave_type, true),
        tableRow("From", leave.from_date),
        tableRow("To", leave.to_date),
        tableRow("Days", String(leave.days), true),
        ...(leave.reason ? [tableRow("Reason", leave.reason)] : []),
      ].join("");

      if (manager?.user_id) {
        await insertNotification(supabase, manager.user_id, `Leave Request from ${employeeName}`, `${employeeName} requested ${leave.days} day(s) of ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date})`, "leave_request", "/hrms/inbox");
      }
      if (employeeUserId) {
        await insertNotification(supabase, employeeUserId, "Leave Request Submitted", `Your ${leave.leave_type} leave request (${leave.from_date} to ${leave.to_date}) has been submitted and is pending approval.`, "leave_request", "/hrms/leaves");
      }

      try {
        if (manager?.email) {
          const htmlBody = emailTemplate("#f5a623", "🗓️", `Leave Request from ${employeeName}`, "Requires your approval", leaveRows, "Please log in to <strong>GRX10</strong> to approve or reject this request.");
          await sendEmail([{ email: manager.email, name: manager.full_name || undefined }], `🗓️ Leave Request from ${employeeName} — Approval Required`, htmlBody);
        }
        if (employeeEmail) {
          const htmlBody = emailTemplate("#3498db", "📋", "Leave Request Submitted", `Hi ${employeeName}, your leave request has been submitted and is pending approval.`, leaveRows);
          await sendEmail([{ email: employeeEmail, name: employeeName }], `📋 Leave Request Submitted — Awaiting Approval`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("leave_request_created: email send failed (in-app notifications already created):", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── LEAVE REQUEST DECIDED ────────────────────────────────────────────────
    if (type === "leave_request_decided") {
      const { leave_request_id, decision, reviewer_name } = payload;
      let leave: any = null;
      let manager: any = null;

      try {
        const { data, error: leaveError } = await supabase
          .from("leave_requests")
          .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
          .eq("id", leave_request_id)
          .single();
        if (leaveError || !data) throw new Error(`Leave request not found: ${leaveError?.message}`);
        leave = data;
        const managerId = (leave as any).profiles?.manager_id;
        if (managerId) {
          const { data: mgr } = await supabase.from("profiles").select("email, full_name, user_id").eq("id", managerId).single();
          manager = mgr;
        }
      } catch (err) {
        console.error("leave_request_decided: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeEmail = (leave as any).profiles?.email;
      const employeeName = (leave as any).profiles?.full_name || "Employee";
      const employeeUserId = (leave as any).profiles?.user_id;
      const isApproved = decision === "approved";
      const statusColor = isApproved ? "#27ae60" : "#e74c3c";
      const statusIcon = isApproved ? "✅" : "❌";
      const statusText = isApproved ? "Approved" : "Rejected";
      const leaveRows = [
        tableRow("Status", statusText, true),
        tableRow("Type", leave.leave_type),
        tableRow("From", leave.from_date),
        tableRow("To", leave.to_date),
        tableRow("Days", String(leave.days), true),
        ...(reviewer_name ? [tableRow("Reviewed by", String(reviewer_name))] : []),
      ].join("");

      const empUserId = employeeUserId || (await supabase.from("profiles").select("user_id").eq("id", leave.profile_id).maybeSingle()).data?.user_id;
      if (empUserId) {
        await insertNotification(supabase, empUserId, `Leave ${statusText}`, `Your ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date}) has been ${decision}.`, isApproved ? "leave_approved" : "leave_rejected", "/hrms/leaves");
      }
      if (manager?.user_id) {
        await insertNotification(supabase, manager.user_id, `Leave ${statusText} — ${employeeName}`, `${employeeName}'s ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date}) was ${decision}.`, isApproved ? "leave_approved" : "leave_rejected", "/hrms/inbox");
      }

      try {
        if (employeeEmail) {
          const htmlBody = emailTemplate(statusColor, statusIcon, `Leave Request ${statusText}`, `Hi ${employeeName}, your leave request has been ${decision}.`, leaveRows);
          await sendEmail([{ email: employeeEmail, name: employeeName }], `${statusIcon} Leave Request ${statusText} — ${employeeName}`, htmlBody);
        }
        if (manager?.email && manager.email !== employeeEmail) {
          const htmlBody = emailTemplate(statusColor, statusIcon, `Leave ${statusText} — ${employeeName}`, `This confirms you ${decision} ${employeeName}'s leave request.`, leaveRows);
          await sendEmail([{ email: manager.email, name: manager.full_name || undefined }], `${statusIcon} Confirmation: Leave ${statusText} for ${employeeName}`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("leave_request_decided: email send failed (in-app notifications already created):", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── CORRECTION REQUEST CREATED ───────────────────────────────────────────
    if (type === "correction_request_created") {
      const { correction_request_id } = payload;
      let correction: any = null;
      let manager: any = null;

      try {
        const { data, error: corrError } = await supabase
          .from("attendance_correction_requests")
          .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
          .eq("id", correction_request_id)
          .single();
        if (corrError || !data) throw new Error(`Correction request not found: ${corrError?.message}`);
        correction = data;
        const managerId = (correction as any).profiles?.manager_id;
        if (managerId) {
          const { data: mgr } = await supabase.from("profiles").select("email, full_name, user_id").eq("id", managerId).single();
          manager = mgr;
        }
      } catch (err) {
        console.error("correction_request_created: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeName = (correction as any).profiles?.full_name || "An employee";
      const employeeEmail = (correction as any).profiles?.email;
      const employeeUserId = (correction as any).profiles?.user_id;
      const correctionRows = [
        tableRow("Date", correction.date, true),
        ...(correction.requested_check_in ? [tableRow("Requested Check-in", correction.requested_check_in)] : []),
        ...(correction.requested_check_out ? [tableRow("Requested Check-out", correction.requested_check_out)] : []),
        tableRow("Reason", correction.reason),
      ].join("");

      if (manager?.user_id) {
        await insertNotification(supabase, manager.user_id, `Correction Request from ${employeeName}`, `${employeeName} submitted an attendance correction for ${correction.date}.`, "leave_request", "/hrms/inbox");
      }
      if (employeeUserId) {
        await insertNotification(supabase, employeeUserId, "Correction Request Submitted", `Your attendance correction for ${correction.date} has been submitted and is pending review.`, "leave_request", "/hrms/my-attendance");
      }

      try {
        if (manager?.email) {
          const htmlBody = emailTemplate("#9b59b6", "📋", `Attendance Correction from ${employeeName}`, "Requires your review", correctionRows, "Please log in to <strong>GRX10</strong> to approve or reject this request.");
          await sendEmail([{ email: manager.email, name: manager.full_name || undefined }], `📋 Correction Request from ${employeeName} — Review Required`, htmlBody);
        }
        if (employeeEmail) {
          const htmlBody = emailTemplate("#3498db", "📋", "Correction Request Submitted", `Hi ${employeeName}, your attendance correction has been submitted.`, correctionRows);
          await sendEmail([{ email: employeeEmail, name: employeeName }], `📋 Correction Request Submitted`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("correction_request_created: email send failed (in-app notifications already created):", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── CORRECTION REQUEST DECIDED ───────────────────────────────────────────
    if (type === "correction_request_decided") {
      const { correction_request_id, decision, reviewer_name } = payload;
      let correction: any = null;
      let manager: any = null;

      try {
        const { data, error: corrError } = await supabase
          .from("attendance_correction_requests")
          .select("*, profiles:profile_id (full_name, email, user_id, manager_id)")
          .eq("id", correction_request_id)
          .single();
        if (corrError || !data) throw new Error(`Correction request not found: ${corrError?.message}`);
        correction = data;
        const managerId = (correction as any).profiles?.manager_id;
        if (managerId) {
          const { data: mgr } = await supabase.from("profiles").select("email, full_name, user_id").eq("id", managerId).single();
          manager = mgr;
        }
      } catch (err) {
        console.error("correction_request_decided: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeName = (correction as any).profiles?.full_name || "Employee";
      const employeeEmail = (correction as any).profiles?.email;
      const employeeUserId = (correction as any).profiles?.user_id;
      const isApproved = decision === "approved";
      const statusText = isApproved ? "Approved" : "Rejected";

      if (employeeUserId) {
        await insertNotification(supabase, employeeUserId, `Attendance Correction ${statusText}`, `Your attendance correction for ${correction.date} has been ${decision}.${correction.reviewer_notes ? ` Note: ${correction.reviewer_notes}` : ""}`, isApproved ? "leave_approved" : "leave_rejected", "/hrms/my-attendance");
      }
      if (manager?.user_id) {
        await insertNotification(supabase, manager.user_id, `Correction ${statusText} — ${employeeName}`, `${employeeName}'s attendance correction for ${correction.date} was ${decision}.`, isApproved ? "leave_approved" : "leave_rejected", "/hrms/inbox");
      }

      try {
        if (employeeEmail) {
          const rows = [
            tableRow("Status", statusText, true),
            tableRow("Date", correction.date),
            ...(reviewer_name ? [tableRow("Reviewed by", String(reviewer_name))] : []),
            ...(correction.reviewer_notes ? [tableRow("Notes", correction.reviewer_notes)] : []),
          ].join("");
          const color = isApproved ? "#27ae60" : "#e74c3c";
          const icon = isApproved ? "✅" : "❌";
          const htmlBody = emailTemplate(color, icon, `Attendance Correction ${statusText}`, `Hi ${employeeName}`, rows);
          await sendEmail([{ email: employeeEmail, name: employeeName }], `${icon} Attendance Correction ${statusText}`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("correction_request_decided: email send failed:", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── REIMBURSEMENT SUBMITTED ──────────────────────────────────────────────
    if (type === "reimbursement_submitted") {
      const { reimbursement_id } = payload;
      let reimbursement: any = null;
      let manager: any = null;

      try {
        const { data, error: rErr } = await supabase
          .from("reimbursement_requests")
          .select("*, profiles:profile_id(full_name, email, user_id, manager_id)")
          .eq("id", reimbursement_id)
          .single();
        if (rErr || !data) throw new Error(`Reimbursement not found: ${rErr?.message}`);
        reimbursement = data;
        const managerId = reimbursement.profiles?.manager_id;
        if (managerId) {
          const { data: mgr } = await supabase.from("profiles").select("email, full_name, user_id").eq("id", managerId).single();
          manager = mgr;
        }
      } catch (err) {
        console.error("reimbursement_submitted: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeName = reimbursement.profiles?.full_name || "An employee";
      const employeeEmail = reimbursement.profiles?.email;
      const employeeUserId = reimbursement.profiles?.user_id;
      const amountStr = `₹${Number(reimbursement.amount).toLocaleString()}`;

      if (manager?.user_id) {
        await insertNotification(supabase, manager.user_id, `Reimbursement Request from ${employeeName}`, `${employeeName} submitted a reimbursement claim of ${amountStr} for ${reimbursement.category || "expenses"}.`, "info", "/hrms/inbox");
      }
      if (employeeUserId) {
        await insertNotification(supabase, employeeUserId, "Reimbursement Submitted", `Your reimbursement claim of ${amountStr} has been submitted and is pending manager approval.`, "info", "/hrms/reimbursements");
      }

      try {
        const rows = [
          tableRow("Vendor", reimbursement.vendor_name || "—"),
          tableRow("Amount", amountStr, true),
          tableRow("Category", reimbursement.category || "—"),
          tableRow("Description", reimbursement.description || "—"),
        ].join("");

        if (manager?.email) {
          const htmlBody = emailTemplate("#f5a623", "💸", `Reimbursement Request from ${employeeName}`, "Requires your approval", rows, "Please log in to GRX10 Manager Inbox to approve or reject this claim.");
          await sendEmail([{ email: manager.email, name: manager.full_name || undefined }], `💸 Reimbursement Request from ${employeeName} — Approval Required`, htmlBody);
        }
        if (employeeEmail) {
          const htmlBody = emailTemplate("#3498db", "📋", "Reimbursement Submitted", `Hi ${employeeName}, your claim has been submitted.`, rows, "Your manager will review and approve shortly.");
          await sendEmail([{ email: employeeEmail, name: employeeName }], `📋 Reimbursement Submitted — Awaiting Manager Approval`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("reimbursement_submitted: email send failed:", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── REIMBURSEMENT MANAGER DECIDED ───────────────────────────────────────
    if (type === "reimbursement_manager_decided") {
      const { reimbursement_id, decision, reviewer_name } = payload;
      let reimbursement: any = null;

      try {
        const { data, error: rErr } = await supabase
          .from("reimbursement_requests")
          .select("*, profiles:profile_id(full_name, email, user_id, manager_id)")
          .eq("id", reimbursement_id)
          .single();
        if (rErr || !data) throw new Error(`Reimbursement not found: ${rErr?.message}`);
        reimbursement = data;
      } catch (err) {
        console.error("reimbursement_manager_decided: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeName = reimbursement.profiles?.full_name || "An employee";
      const employeeEmail = reimbursement.profiles?.email;
      const employeeUserId = reimbursement.profiles?.user_id;
      const isApproved = decision === "approved";
      const statusText = isApproved ? "Approved by Manager" : "Rejected by Manager";
      const amountStr = `₹${Number(reimbursement.amount).toLocaleString()}`;

      if (employeeUserId) {
        const msg = isApproved
          ? `Your reimbursement of ${amountStr} has been approved by your manager and forwarded to Finance for processing.`
          : `Your reimbursement of ${amountStr} has been rejected by your manager.${reimbursement.manager_notes ? ` Note: ${reimbursement.manager_notes}` : ""}`;
        await insertNotification(supabase, employeeUserId, `Reimbursement ${statusText}`, msg, isApproved ? "info" : "warning", "/hrms/reimbursements");
      }

      if (isApproved) {
        try {
          const { data: financeUsers } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["finance", "admin"]);
          for (const fu of (financeUsers || [])) {
            await insertNotification(
              supabase,
              fu.user_id,
              `💰 Reimbursement Pending Finance Approval`,
              `${employeeName}'s expense claim of ${amountStr} for ${reimbursement.category || "expenses"} has been approved by their manager and requires your review.`,
              "info",
              "/financial/reimbursements"
            );
          }
        } catch (err) {
          console.warn("Failed to notify Finance users of manager-approved reimbursement:", err);
        }
      }

      try {
        if (employeeEmail) {
          const rows = [
            tableRow("Vendor", reimbursement.vendor_name || "—"),
            tableRow("Amount", amountStr, true),
            tableRow("Category", reimbursement.category || "—"),
            tableRow("Status", statusText, true),
            ...(reimbursement.manager_notes ? [tableRow("Manager Note", reimbursement.manager_notes)] : []),
          ].join("");
          const color = isApproved ? "#27ae60" : "#e74c3c";
          const icon = isApproved ? "✅" : "❌";
          const footer = isApproved
            ? "Your claim is now with the Finance team for final approval and payment processing."
            : "Please contact your manager if you have questions.";
          const htmlBody = emailTemplate(color, icon, `Reimbursement ${statusText}`, `Hi ${employeeName}`, rows, footer);
          await sendEmail([{ email: employeeEmail, name: employeeName }], `${icon} Reimbursement ${statusText} — ${amountStr}`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("reimbursement_manager_decided: email send failed:", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── REIMBURSEMENT FINANCE DECIDED ───────────────────────────────────────
    if (type === "reimbursement_finance_decided") {
      const { reimbursement_id, decision, reviewer_name } = payload;
      let reimbursement: any = null;

      try {
        const { data, error: rErr } = await supabase
          .from("reimbursement_requests")
          .select("*, profiles:profile_id(full_name, email, user_id, manager_id)")
          .eq("id", reimbursement_id)
          .single();
        if (rErr || !data) throw new Error(`Reimbursement not found: ${rErr?.message}`);
        reimbursement = data;
      } catch (err) {
        console.error("reimbursement_finance_decided: data fetch failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const employeeName = reimbursement.profiles?.full_name || "An employee";
      const employeeEmail = reimbursement.profiles?.email;
      const employeeUserId = reimbursement.profiles?.user_id;
      const isPaid = decision === "paid";
      const statusText = isPaid ? "Approved & Paid" : "Rejected by Finance";
      const amountStr = `₹${Number(reimbursement.amount).toLocaleString()}`;

      if (employeeUserId) {
        const msg = isPaid
          ? `Your reimbursement claim of ${amountStr} has been approved by Finance and recorded as a paid expense.`
          : `Your reimbursement claim of ${amountStr} has been rejected by Finance.${reimbursement.finance_notes ? ` Note: ${reimbursement.finance_notes}` : ""}`;
        await insertNotification(supabase, employeeUserId, `Reimbursement ${statusText}`, msg, isPaid ? "info" : "warning", "/hrms/reimbursements");
      }

      try {
        if (employeeEmail) {
          const rows = [
            tableRow("Vendor", reimbursement.vendor_name || "—"),
            tableRow("Amount", amountStr, true),
            tableRow("Category", reimbursement.category || "—"),
            tableRow("Status", statusText, true),
            ...(reviewer_name ? [tableRow("Reviewed by", String(reviewer_name))] : []),
            ...(reimbursement.finance_notes ? [tableRow("Finance Note", reimbursement.finance_notes)] : []),
          ].join("");
          const color = isPaid ? "#27ae60" : "#e74c3c";
          const icon = isPaid ? "💰" : "❌";
          const footer = isPaid
            ? "Your reimbursement has been processed. Please check with Finance for payment details."
            : "Please contact the Finance team if you have any questions.";
          const htmlBody = emailTemplate(color, icon, `Reimbursement ${statusText}`, `Hi ${employeeName}`, rows, footer);
          await sendEmail([{ email: employeeEmail, name: employeeName }], `${icon} Reimbursement ${statusText} — ${amountStr}`, htmlBody);
        }
      } catch (emailErr) {
        console.warn("reimbursement_finance_decided: email send failed:", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unknown notification type: ${type}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-notification-email unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
