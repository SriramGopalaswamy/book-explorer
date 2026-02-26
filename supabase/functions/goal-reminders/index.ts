// deno-lint-ignore-file
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const senderEmail = "onboarding@resend.dev";

async function sendEmail(
  toRecipients: { email: string; name?: string }[],
  subject: string,
  htmlBody: string
): Promise<boolean> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured — skipping email");
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
        to: toRecipients.map((r) => r.email),
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

function emailTemplate(icon: string, heading: string, body: string) {
  return `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px 12px 0 0; color: #fff;">
        <h1 style="margin: 0 0 8px; font-size: 20px; color: #f5a623;">${icon} ${heading}</h1>
        <p style="margin: 0; font-size: 13px; color: #aaa;">GRX10 Automated Reminder</p>
      </div>
      <div style="padding: 20px; background: #fff; border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 14px; color: #333; line-height: 1.6;">${body}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
        <p style="font-size: 12px; color: #999;">This is an automated reminder from GRX10.</p>
      </div>
    </div>
  `;
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

  const today = new Date();
  const dayOfMonth = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  // Current month string for goal_plans (YYYY-MM format)
  const currentMonthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Last day of current month
  const lastDay = new Date(year, month + 1, 0).getDate();
  const isLastDay = dayOfMonth === lastDay;
  const isFirstWeek = dayOfMonth >= 1 && dayOfMonth <= 7;
  const isApril = month === 3; // 0-indexed, April = 3

  // Check if any reminder window is active
  const hasGoalWindow = isFirstWeek || isLastDay;
  const hasDeclarationWindow = isApril && dayOfMonth >= 1 && dayOfMonth <= 30;

  if (!hasGoalWindow && !hasDeclarationWindow) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "Not in any reminder window" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get all active employees across all orgs
  const { data: activeProfiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, organization_id")
    .eq("status", "active");

  if (profilesErr || !activeProfiles) {
    console.error("Failed to fetch profiles:", profilesErr);
    return new Response(
      JSON.stringify({ error: "Failed to fetch profiles" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let notified = 0;
  let emailed = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // GOAL REMINDERS
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasGoalWindow) {
    const { data: existingPlans } = await supabase
      .from("goal_plans")
      .select("user_id, status, items")
      .eq("month", currentMonthStr);

    const plansByUser = new Map<string, any>();
    for (const plan of existingPlans || []) {
      plansByUser.set(plan.user_id, plan);
    }

    // FIRST WEEK: Remind employees who haven't created a goal plan
    if (isFirstWeek) {
      const delinquents = activeProfiles.filter(
        (p) => p.user_id && !plansByUser.has(p.user_id)
      );

      for (const emp of delinquents) {
        await insertNotification(supabase, emp.user_id,
          "🎯 Create Your Monthly Goals",
          `You haven't created your goal plan for ${currentMonthStr} yet. Please submit your targets by the 7th.`,
          "goal_reminder", "/performance/goals"
        );
        notified++;

        if (emp.email) {
          const html = emailTemplate("🎯", "Monthly Goal Plan Required",
            `Hi ${emp.full_name || "there"},<br><br>
            You haven't submitted your <strong>monthly goal plan</strong> for <strong>${currentMonthStr}</strong> yet.<br><br>
            Please log in to GRX10 and create your goal plan with targets and weightages by <strong>the 7th of this month</strong>.<br><br>
            <a href="https://swift-link-story.lovable.app/performance/goals" style="display: inline-block; padding: 10px 20px; background: #f5a623; color: #1a1a2e; text-decoration: none; border-radius: 6px; font-weight: 600;">Create Goal Plan →</a>`
          );
          const sent = await sendEmail([{ email: emp.email, name: emp.full_name || undefined }],
            `🎯 Action Required: Submit Your Goal Plan for ${currentMonthStr}`, html);
          if (sent) emailed++;
        }
      }
    }

    // LAST DAY: Remind employees who haven't submitted actuals
    if (isLastDay) {
      const needActuals = activeProfiles.filter((p) => {
        if (!p.user_id) return false;
        const plan = plansByUser.get(p.user_id);
        if (!plan) return false;
        if (plan.status !== "approved") return false;
        const items = Array.isArray(plan.items) ? plan.items : [];
        return items.some((item: any) => !item.actual || item.actual === "");
      });

      for (const emp of needActuals) {
        await insertNotification(supabase, emp.user_id,
          "📊 Submit Your Goal Actuals",
          `Today is the last day of the month. Please submit your actual numbers for ${currentMonthStr} before end of day.`,
          "goal_reminder", "/performance/goals"
        );
        notified++;

        if (emp.email) {
          const html = emailTemplate("📊", "Submit Your Goal Actuals — Deadline Today",
            `Hi ${emp.full_name || "there"},<br><br>
            Today is the <strong>last day</strong> to submit your <strong>actual numbers</strong> for your ${currentMonthStr} goal plan.<br><br>
            Please log in to GRX10, fill in the Actual column for all your goals, and submit for scoring approval.<br><br>
            <a href="https://swift-link-story.lovable.app/performance/goals" style="display: inline-block; padding: 10px 20px; background: #e74c3c; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Submit Actuals Now →</a>`
          );
          const sent = await sendEmail([{ email: emp.email, name: emp.full_name || undefined }],
            `⚠️ Deadline Today: Submit Goal Actuals for ${currentMonthStr}`, html);
          if (sent) emailed++;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVESTMENT DECLARATION REMINDERS (April 1-30)
  // ═══════════════════════════════════════════════════════════════════════════
  if (hasDeclarationWindow) {
    const declarationFY = `${year}-${year + 1}`;
    const daysRemaining = 30 - dayOfMonth;

    // Send reminders on specific days: 1, 5, 10, 15, 20, 25, 28, 29, 30
    const reminderDays = [1, 5, 10, 15, 20, 25, 28, 29, 30];
    if (reminderDays.includes(dayOfMonth)) {
      // Get employees who haven't submitted any declarations for this FY
      const { data: existingDeclarations } = await supabase
        .from("investment_declarations")
        .select("profile_id")
        .eq("financial_year", declarationFY);

      const declaredProfileIds = new Set((existingDeclarations || []).map((d: any) => d.profile_id));

      const delinquents = activeProfiles.filter(
        (p) => p.id && p.user_id && !declaredProfileIds.has(p.id)
      );

      const urgency = daysRemaining <= 5 ? "urgent" : daysRemaining <= 10 ? "warning" : "info";
      const urgencyIcon = urgency === "urgent" ? "🚨" : urgency === "warning" ? "⚠️" : "📋";
      const urgencyColor = urgency === "urgent" ? "#e74c3c" : urgency === "warning" ? "#f5a623" : "#3498db";

      for (const emp of delinquents) {
        await insertNotification(supabase, emp.user_id,
          `${urgencyIcon} Investment Declaration Required`,
          `Submit your investment declarations for FY ${declarationFY} before April 30th. ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining.`,
          "declaration_reminder", "/hrms/payroll"
        );
        notified++;

        if (emp.email) {
          const html = emailTemplate(urgencyIcon, `Investment Declaration — ${daysRemaining} Days Left`,
            `Hi ${emp.full_name || "there"},<br><br>
            The investment declaration window for <strong>FY ${declarationFY}</strong> is open until <strong>April 30th</strong>.<br><br>
            You haven't submitted your tax-saving investment declarations yet. These declarations (80C, 80D, HRA, NPS, etc.) are used to calculate your monthly TDS deductions throughout the year.<br><br>
            <strong style="color: ${urgencyColor};">${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining</strong><br><br>
            <a href="https://swift-link-story.lovable.app/hrms/payroll" style="display: inline-block; padding: 10px 20px; background: ${urgencyColor}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Submit Declarations →</a>`
          );
          const sent = await sendEmail([{ email: emp.email, name: emp.full_name || undefined }],
            `${urgencyIcon} Investment Declaration Required — FY ${declarationFY} (${daysRemaining} days left)`, html);
          if (sent) emailed++;
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      date: today.toISOString().split("T")[0],
      month: currentMonthStr,
      goal_window_active: hasGoalWindow,
      declaration_window_active: hasDeclarationWindow,
      notifications_sent: notified,
      emails_sent: emailed,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
