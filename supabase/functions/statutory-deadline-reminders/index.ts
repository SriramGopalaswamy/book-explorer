import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Statutory filing deadlines (day of month, and frequency)
const FILING_DEADLINES = [
  { id: "gstr1", name: "GSTR-1", dueDay: 11, frequency: "monthly", description: "Outward Supplies Return" },
  { id: "gstr3b", name: "GSTR-3B", dueDay: 20, frequency: "monthly", description: "Summary Return" },
  { id: "pf", name: "PF ECR", dueDay: 15, frequency: "monthly", description: "Provident Fund Contribution" },
  { id: "esi", name: "ESI Return", dueDay: 15, frequency: "monthly", description: "Employee State Insurance" },
  { id: "pt", name: "Professional Tax", dueDay: 20, frequency: "monthly", description: "Professional Tax Deduction" },
  // TDS quarterly deadlines are handled separately
];

const TDS_QUARTERLY_DEADLINES = [
  { quarter: "Q1", dueMonth: 6, dueDay: 31 },  // Jul 31
  { quarter: "Q2", dueMonth: 9, dueDay: 31 },  // Oct 31
  { quarter: "Q3", dueMonth: 0, dueDay: 31 },  // Jan 31 (next year)
  { quarter: "Q4", dueMonth: 4, dueDay: 31 },  // May 31 (next year)
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const reminderDays = [15, 7, 3]; // Days before deadline to send reminders
    const notifications: Array<{ org_id: string; user_id: string; title: string; message: string; link: string; urgency: string }> = [];

    // Get all active organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("status", "active");

    if (!orgs?.length) {
      return new Response(JSON.stringify({ message: "No active organizations" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    for (const org of orgs) {
      // Get all admin users for this org
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("organization_id", org.id)
        .in("role", ["admin", "finance", "hr"]);

      if (!adminRoles?.length) continue;

      const adminUserIds = adminRoles.map((r: any) => r.user_id);

      // Check monthly filings
      for (const filing of FILING_DEADLINES) {
        const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, filing.dueDay);
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (reminderDays.includes(daysUntil)) {
          const urgency = daysUntil <= 3 ? "urgent" : daysUntil <= 7 ? "warning" : "info";
          for (const userId of adminUserIds) {
            notifications.push({
              org_id: org.id,
              user_id: userId,
              title: `${filing.name} filing due in ${daysUntil} days`,
              message: `${filing.description} is due by ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Prepare and upload to the government portal.`,
              link: "/financial/statutory-filings",
              urgency,
            });
          }
        }
      }

      // Check TDS quarterly deadlines
      for (const tds of TDS_QUARTERLY_DEADLINES) {
        const dueYear = tds.dueMonth < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
        const dueDate = new Date(dueYear, tds.dueMonth, tds.dueDay);
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (reminderDays.includes(daysUntil)) {
          const urgency = daysUntil <= 3 ? "urgent" : daysUntil <= 7 ? "warning" : "info";
          for (const userId of adminUserIds) {
            notifications.push({
              org_id: org.id,
              user_id: userId,
              title: `TDS ${tds.quarter} filing due in ${daysUntil} days`,
              message: `TDS 24Q/26Q for ${tds.quarter} is due by ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Upload to TRACES portal.`,
              link: "/financial/statutory-filings",
              urgency,
            });
          }
        }
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      const notifRows = notifications.map((n) => ({
        user_id: n.user_id,
        organization_id: n.org_id,
        title: n.title,
        message: n.message,
        type: "statutory_deadline",
        link: n.link,
        is_read: false,
      }));

      const { error: insertError } = await supabase.from("notifications").insert(notifRows);
      if (insertError) {
        console.error("Failed to insert notifications:", insertError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, notificationsSent: notifications.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Statutory deadline reminders error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
