import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Calculates the next run date after a given date based on frequency.
 */
function calcNextDate(fromDate: string, frequency: string): string {
  const d = new Date(fromDate);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().split("T")[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Support both cron (no auth) and manual invocation (with auth)
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // If called manually with auth, optionally scope to the user's org
    let scopeOrgId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();
        scopeOrgId = profile?.organization_id ?? null;
      }
    }

    const today = new Date().toISOString().split("T")[0];

    // Fetch all active recurring transactions whose next_run_date <= today
    let query = supabase
      .from("recurring_transactions")
      .select("*")
      .eq("status", "active")
      .lte("next_run_date", today);

    if (scopeOrgId) {
      query = query.eq("organization_id", scopeOrgId);
    }

    const { data: dueTxns, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (!dueTxns || dueTxns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No recurring transactions due", executed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let executed = 0;
    const errors: string[] = [];

    for (const tx of dueTxns) {
      try {
        // Check if end_date has passed
        if (tx.end_date && tx.end_date < today) {
          await supabase
            .from("recurring_transactions")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", tx.id);
          continue;
        }

        const amount = Number(tx.amount);

        // 1. Create a financial_record (expense entry)
        const { error: frErr } = await supabase.from("financial_records").insert({
          user_id: tx.created_by,
          organization_id: tx.organization_id,
          type: "expense",
          category: "Recurring",
          sub_category: tx.name,
          amount: amount,
          date: today,
          description: `[Auto] Recurring: ${tx.name}${tx.description ? " — " + tx.description : ""}`,
          status: "completed",
          payment_method: "auto",
        });
        if (frErr) {
          console.warn(`[RecurringExec] financial_record insert failed for ${tx.id}:`, frErr.message);
        }

        // 2. Create a bank_transaction (debit)
        const { error: btErr } = await supabase.from("bank_transactions").insert({
          user_id: tx.created_by,
          organization_id: tx.organization_id,
          amount: amount,
          transaction_type: "debit",
          description: `Recurring: ${tx.name}`,
          reference: `REC-${tx.id.substring(0, 8)}`,
          category: "Recurring Payment",
          transaction_date: today,
          reconciled: false,
        });
        if (btErr) {
          console.warn(`[RecurringExec] bank_transaction insert failed for ${tx.id}:`, btErr.message);
        }

        // 3. Update the recurring transaction: advance next_run_date, set last_run_date
        const nextDate = calcNextDate(today, tx.frequency);

        // Check if the next date exceeds end_date → mark completed
        const newStatus =
          tx.end_date && nextDate > tx.end_date ? "completed" : "active";

        const { error: updErr } = await supabase
          .from("recurring_transactions")
          .update({
            last_run_date: today,
            next_run_date: newStatus === "completed" ? null : nextDate,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id);

        if (updErr) {
          errors.push(`Update failed for ${tx.id}: ${updErr.message}`);
        } else {
          executed++;
        }
      } catch (txErr: any) {
        errors.push(`${tx.id}: ${txErr.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Executed ${executed} recurring transaction(s)`,
        executed,
        total_due: dueTxns.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[RecurringExec] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
