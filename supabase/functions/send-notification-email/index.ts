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

// Send email via MS Graph API
async function sendEmail(
  accessToken: string,
  senderEmail: string,
  toRecipients: { email: string; name?: string }[],
  subject: string,
  htmlBody: string
) {
  const message = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
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
    throw new Error(`Graph sendMail failed [${res.status}]: ${err}`);
  }
}

// Helper to insert in-app notifications
async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  message: string,
  type: string,
  link?: string
) {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    });
  } catch (err) {
    console.warn("Failed to insert notification:", err);
  }
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

    const accessToken = await getGraphToken();
    // Use the admin email as sender (must have a mailbox in MS365)
    const senderEmail = "sriram@grx10.com";

    if (type === "memo_published") {
      const { memo_id } = payload;

      // Fetch memo details
      const { data: memo, error: memoError } = await supabase
        .from("memos")
        .select("*")
        .eq("id", memo_id)
        .single();

      if (memoError || !memo) {
        throw new Error(`Memo not found: ${memoError?.message}`);
      }

      // Determine recipients: use memo.recipients array (emails), or fall back to all active profiles
      let recipientEmails: string[] = [];

      if (memo.recipients && memo.recipients.length > 0) {
        recipientEmails = memo.recipients;
      } else {
        // Send to all active employees
        const { data: profiles } = await supabase
          .from("profiles")
          .select("email")
          .eq("status", "active")
          .not("email", "is", null);

        recipientEmails = (profiles || [])
          .map((p: { email: string | null }) => p.email!)
          .filter(Boolean);
      }

      if (recipientEmails.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No recipients found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const htmlBody = `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px; color: #fff;">
            <h1 style="margin: 0 0 8px; font-size: 20px; color: #e94560;">📢 New Memo: ${memo.title}</h1>
            <p style="margin: 0; font-size: 13px; color: #aaa;">From ${memo.author_name} · ${memo.department} · Priority: ${memo.priority}</p>
          </div>
          <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <p style="color: #333; line-height: 1.6;">${memo.excerpt || memo.content || "No content"}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
            <p style="font-size: 12px; color: #999;">This is an automated notification from GRX10.</p>
          </div>
        </div>
      `;

      const recipients = recipientEmails.map((email) => ({ email }));

      // Send in batches of 50 (Graph API limit)
      for (let i = 0; i < recipients.length; i += 50) {
        const batch = recipients.slice(i, i + 50);
        await sendEmail(accessToken, senderEmail, batch, `📢 New Memo: ${memo.title}`, htmlBody);
      }

      console.log(`Memo email sent to ${recipientEmails.length} recipients`);

      // Insert in-app notifications for all recipients
      const { data: recipientProfiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("email", recipientEmails)
        .not("user_id", "is", null);

      for (const profile of recipientProfiles || []) {
        await insertNotification(
          supabase,
          profile.user_id,
          `📢 New Memo: ${memo.title}`,
          memo.excerpt || memo.content?.substring(0, 150) || "New memo published",
          "memo",
          "/performance/memos"
        );
      }

      console.log(`Memo notifications inserted for ${(recipientProfiles || []).length} users`);

      return new Response(
        JSON.stringify({ success: true, sent_to: recipientEmails.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "leave_request_created") {
      const { leave_request_id } = payload;

      // Fetch leave request with employee profile
      const { data: leave, error: leaveError } = await supabase
        .from("leave_requests")
        .select("*, profiles:profile_id (full_name, email, manager_id)")
        .eq("id", leave_request_id)
        .single();

      if (leaveError || !leave) {
        throw new Error(`Leave request not found: ${leaveError?.message}`);
      }

      const employeeName = (leave as any).profiles?.full_name || "An employee";
      const managerId = (leave as any).profiles?.manager_id;

      if (!managerId) {
        console.log("No manager assigned, skipping email notification");
        return new Response(
          JSON.stringify({ success: true, message: "No manager to notify" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get manager's email and user_id
      const { data: manager } = await supabase
        .from("profiles")
        .select("email, full_name, user_id")
        .eq("id", managerId)
        .single();

      if (!manager?.email) {
        console.log("Manager has no email, skipping");
        return new Response(
          JSON.stringify({ success: true, message: "Manager email not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert in-app notification for manager
      if (manager.user_id) {
        await insertNotification(
          supabase,
          manager.user_id,
          `Leave Request from ${employeeName}`,
          `${employeeName} requested ${leave.days} day(s) of ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date})`,
          "leave_request",
          "/dashboard"
        );
      }

      const htmlBody = `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px; color: #fff;">
            <h1 style="margin: 0 0 8px; font-size: 20px; color: #f5a623;">🗓️ Leave Request from ${employeeName}</h1>
            <p style="margin: 0; font-size: 13px; color: #aaa;">Requires your approval</p>
          </div>
          <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px 0; color: #666; width: 120px;">Type</td><td style="padding: 8px 0; color: #333; font-weight: 600;">${leave.leave_type}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">From</td><td style="padding: 8px 0; color: #333;">${leave.from_date}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">To</td><td style="padding: 8px 0; color: #333;">${leave.to_date}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Days</td><td style="padding: 8px 0; color: #333; font-weight: 600;">${leave.days}</td></tr>
              ${leave.reason ? `<tr><td style="padding: 8px 0; color: #666;">Reason</td><td style="padding: 8px 0; color: #333;">${leave.reason}</td></tr>` : ""}
            </table>
            <p style="margin-top: 16px; font-size: 13px; color: #666;">
              Please log in to <strong>GRX10</strong> to approve or reject this request from your dashboard.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
            <p style="font-size: 12px; color: #999;">This is an automated notification from GRX10.</p>
          </div>
        </div>
      `;

      await sendEmail(
        accessToken,
        senderEmail,
        [{ email: manager.email, name: manager.full_name || undefined }],
        `🗓️ Leave Request from ${employeeName} - Approval Required`,
        htmlBody
      );

      console.log(`Leave request email sent to manager: ${manager.email}`);

      return new Response(
        JSON.stringify({ success: true, sent_to: manager.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "leave_request_decided") {
      const { leave_request_id, decision, reviewer_name } = payload;

      const { data: leave, error: leaveError } = await supabase
        .from("leave_requests")
        .select("*, profiles:profile_id (full_name, email, manager_id)")
        .eq("id", leave_request_id)
        .single();

      if (leaveError || !leave) {
        throw new Error(`Leave request not found: ${leaveError?.message}`);
      }

      const employeeEmail = (leave as any).profiles?.email;
      const employeeName = (leave as any).profiles?.full_name || "Employee";
      const managerId = (leave as any).profiles?.manager_id;

      // We need the employee's user_id for in-app notification
      // The leave_request has user_id but that's the requester's auth id
      const employeeUserId = leave.user_id;

      // Look up manager email and user_id
      let managerRecipient: { email: string; name?: string } | null = null;
      let managerUserId: string | null = null;
      if (managerId) {
        const { data: manager } = await supabase
          .from("profiles")
          .select("email, full_name, user_id")
          .eq("id", managerId)
          .single();
        if (manager?.email) {
          managerRecipient = { email: manager.email, name: manager.full_name || undefined };
          managerUserId = manager.user_id;
        }
      }

      if (!employeeEmail) {
        console.log("Employee has no email, skipping");
        return new Response(
          JSON.stringify({ success: true, message: "Employee email not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isApproved = decision === "approved";
      const statusColor = isApproved ? "#27ae60" : "#e74c3c";
      const statusIcon = isApproved ? "✅" : "❌";
      const statusText = isApproved ? "Approved" : "Rejected";

      const htmlBody = `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px; color: #fff;">
            <h1 style="margin: 0 0 8px; font-size: 20px; color: ${statusColor};">${statusIcon} Leave Request ${statusText}</h1>
            <p style="margin: 0; font-size: 13px; color: #aaa;">Hi ${employeeName}, your leave request has been ${decision}.</p>
          </div>
          <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px 0; color: #666; width: 120px;">Status</td><td style="padding: 8px 0; font-weight: 600; color: ${statusColor};">${statusText}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Type</td><td style="padding: 8px 0; color: #333;">${leave.leave_type}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">From</td><td style="padding: 8px 0; color: #333;">${leave.from_date}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">To</td><td style="padding: 8px 0; color: #333;">${leave.to_date}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Days</td><td style="padding: 8px 0; color: #333; font-weight: 600;">${leave.days}</td></tr>
              ${reviewer_name ? `<tr><td style="padding: 8px 0; color: #666;">Reviewed by</td><td style="padding: 8px 0; color: #333;">${reviewer_name}</td></tr>` : ""}
            </table>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
            <p style="font-size: 12px; color: #999;">This is an automated notification from GRX10.</p>
          </div>
        </div>
      `;

      const recipients = [{ email: employeeEmail, name: employeeName }];
      if (managerRecipient && managerRecipient.email !== employeeEmail) {
        recipients.push(managerRecipient);
      }

      await sendEmail(
        accessToken,
        senderEmail,
        recipients,
        `${statusIcon} Leave Request ${statusText} - ${employeeName}`,
        htmlBody
      );

      const sentTo = recipients.map(r => r.email);
      console.log(`Leave decision email sent to: ${sentTo.join(", ")}`);

      // Insert in-app notifications
      const notifType = isApproved ? "leave_approved" : "leave_rejected";
      const notifTitle = `Leave ${statusText}`;
      const notifMsg = `Your ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date}) has been ${decision}.`;

      // Notify the employee whose leave was decided
      // The leave requests were seeded with the manager's user_id, so look up the actual employee user_id from profile
      const { data: empProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", leave.profile_id)
        .maybeSingle();

      if (empProfile?.user_id) {
        await insertNotification(supabase, empProfile.user_id, notifTitle, notifMsg, notifType, "/hrms/leaves");
      }

      // Notify the manager
      if (managerUserId) {
        await insertNotification(
          supabase,
          managerUserId,
          `Leave ${statusText} — ${employeeName}`,
          `${employeeName}'s ${leave.leave_type} leave (${leave.from_date} to ${leave.to_date}) was ${decision}.`,
          notifType,
          "/dashboard"
        );
      }

      return new Response(
        JSON.stringify({ success: true, sent_to: sentTo }),
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
