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

      // Get manager's email
      const { data: manager } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", managerId)
        .single();

      if (!manager?.email) {
        console.log("Manager has no email, skipping");
        return new Response(
          JSON.stringify({ success: true, message: "Manager email not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
