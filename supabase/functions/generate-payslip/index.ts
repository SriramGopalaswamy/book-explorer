import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payroll_run_id, entry_ids } = await req.json();

    if (!payroll_run_id) {
      return new Response(
        JSON.stringify({ error: "payroll_run_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Import Supabase client
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify run is locked
    const { data: run, error: runErr } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", payroll_run_id)
      .single();

    if (runErr || !run) {
      return new Response(
        JSON.stringify({ error: "Payroll run not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (run.status !== "locked") {
      return new Response(
        JSON.stringify({ error: "Payslips can only be generated for locked payroll runs" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org details
    const { data: org } = await supabase
      .from("organizations")
      .select("name, address")
      .eq("id", run.organization_id)
      .single();

    // Fetch entries (optionally filter by entry_ids)
    let query = supabase
      .from("payroll_entries")
      .select("*, profiles!profile_id(full_name, email, department, job_title)")
      .eq("payroll_run_id", payroll_run_id);

    if (entry_ids && entry_ids.length > 0) {
      query = query.in("id", entry_ids);
    }

    // Only generate for entries that don't already have a payslip
    query = query.is("payslip_generated_at", null);

    const { data: entries, error: entErr } = await query;

    if (entErr) {
      return new Response(
        JSON.stringify({ error: entErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ message: "All payslips already generated", generated: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch employee details for PAN/UAN/Bank
    const profileIds = entries.map((e: any) => e.profile_id);
    const { data: empDetails } = await supabase
      .from("employee_details")
      .select("profile_id, pan_number, uan_number, bank_account_number, bank_name, bank_ifsc, employee_id_number")
      .in("profile_id", profileIds);

    const detailsMap = new Map(
      (empDetails ?? []).map((d: any) => [d.profile_id, d])
    );

    const [year, month] = run.pay_period.split("-");
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const periodLabel = `${months[parseInt(month) - 1]} ${year}`;

    let generatedCount = 0;

    for (const entry of entries) {
      const details = detailsMap.get(entry.profile_id) || {};
      const earnings = (entry.earnings_breakdown as any[]) || [];
      const deductions = (entry.deductions_breakdown as any[]) || [];
      const profile = entry.profiles || {};

      // Build payslip HTML
      const html = buildPayslipHTML({
        companyName: org?.name || "Company",
        companyAddress: org?.address || "",
        periodLabel,
        employeeName: profile.full_name || "Employee",
        employeeId: details.employee_id_number || "—",
        department: profile.department || "—",
        designation: profile.job_title || "—",
        pan: details.pan_number || "—",
        uan: details.uan_number || "—",
        bankAccount: details.bank_account_number || "—",
        earnings,
        deductions,
        grossEarnings: entry.gross_earnings,
        totalDeductions: entry.total_deductions,
        netPay: entry.net_pay,
        workingDays: entry.working_days,
        lwpDays: entry.lwp_days,
        pfEmployee: entry.pf_employee || 0,
        pfEmployer: entry.pf_employer || 0,
        tdsAmount: entry.tds_amount || 0,
        annualCTC: entry.annual_ctc,
      });

      // Store as HTML payslip reference (in production this would be PDF via puppeteer)
      // Mark as generated
      const payslipUrl = `payslip://${run.pay_period}/${entry.profile_id}`;
      
      await supabase
        .from("payroll_entries")
        .update({
          payslip_url: payslipUrl,
          payslip_generated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);

      generatedCount++;
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: run.generated_by,
      action: "payslips_generated",
      entity_type: "payroll_run",
      entity_id: payroll_run_id,
      organization_id: run.organization_id,
      metadata: {
        pay_period: run.pay_period,
        generated_count: generatedCount,
      },
    });

    return new Response(
      JSON.stringify({ success: true, generated: generatedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildPayslipHTML(data: {
  companyName: string;
  companyAddress: string;
  periodLabel: string;
  employeeName: string;
  employeeId: string;
  department: string;
  designation: string;
  pan: string;
  uan: string;
  bankAccount: string;
  earnings: any[];
  deductions: any[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  workingDays: number;
  lwpDays: number;
  pfEmployee: number;
  pfEmployer: number;
  tdsAmount: number;
  annualCTC: number;
}): string {
  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const earningsRows = data.earnings
    .map((e: any) => `<tr><td>${e.name}</td><td class="r">${fmt(e.monthly)}</td></tr>`)
    .join("");

  const deductionsRows = data.deductions
    .map((d: any) => `<tr><td>${d.name}</td><td class="r">${fmt(d.monthly)}</td></tr>`)
    .join("");

  // Add statutory deductions
  const statutoryRows = [
    data.pfEmployee > 0 ? `<tr><td>PF (Employee)</td><td class="r">${fmt(data.pfEmployee)}</td></tr>` : "",
    data.tdsAmount > 0 ? `<tr><td>TDS</td><td class="r">${fmt(data.tdsAmount)}</td></tr>` : "",
  ].join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payslip - ${data.employeeName} - ${data.periodLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
  .header { border-bottom: 3px solid #e11d74; padding-bottom: 16px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; color: #e11d74; }
  .header .period { font-size: 14px; color: #666; }
  .emp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 20px; padding: 16px; background: #f9f9f9; border-radius: 8px; }
  .emp-grid label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
  .emp-grid span { font-size: 13px; font-weight: 500; }
  .tables { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 12px; }
  .r { text-align: right; font-weight: 500; }
  .total td { border-top: 2px solid #ccc; font-weight: 700; padding-top: 8px; }
  .net-box { background: linear-gradient(135deg, #fdf2f8, #fce7f3); border: 1px solid #f9a8d4; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .net-box .label { font-size: 16px; font-weight: 600; }
  .net-box .value { font-size: 24px; font-weight: 800; color: #e11d74; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; }
  .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #666; }
  .watermark { text-align: center; margin-top: 16px; font-size: 10px; color: #ccc; }
</style></head><body>
  <div class="header">
    <h1>${data.companyName}</h1>
    <div class="period">Payslip for ${data.periodLabel}</div>
    ${data.companyAddress ? `<div style="font-size:11px;color:#888;">${data.companyAddress}</div>` : ""}
  </div>
  <div class="emp-grid">
    <div><label>Employee Name</label><br><span>${data.employeeName}</span></div>
    <div><label>Employee ID</label><br><span>${data.employeeId}</span></div>
    <div><label>Department</label><br><span>${data.department}</span></div>
    <div><label>Designation</label><br><span>${data.designation}</span></div>
    <div><label>PAN</label><br><span>${data.pan}</span></div>
    <div><label>UAN</label><br><span>${data.uan}</span></div>
    <div><label>Bank Account</label><br><span>${data.bankAccount}</span></div>
    <div><label>Annual CTC</label><br><span>${fmt(data.annualCTC)}</span></div>
  </div>
  <div class="tables">
    <div class="section">
      <h3>Earnings</h3>
      <table><tbody>${earningsRows}
      <tr class="total"><td>Gross Earnings</td><td class="r" style="color:green">${fmt(data.grossEarnings)}</td></tr>
      </tbody></table>
    </div>
    <div class="section">
      <h3>Deductions</h3>
      <table><tbody>${deductionsRows}${statutoryRows}
      <tr class="total"><td>Total Deductions</td><td class="r" style="color:red">${fmt(data.totalDeductions)}</td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="net-box">
    <div><div class="label">Net Pay</div><div style="font-size:11px;color:#888;">Gross - Deductions</div></div>
    <div class="value">${fmt(data.netPay)}</div>
  </div>
  <div class="footer">
    <div class="footer-grid">
      <div>Working Days: <strong>${data.workingDays}</strong></div>
      <div>LOP Days: <strong>${data.lwpDays}</strong></div>
      <div>Employer PF Contribution: <strong>${fmt(data.pfEmployer)}</strong></div>
      <div>Generated: <strong>${new Date().toLocaleDateString("en-IN")}</strong></div>
    </div>
  </div>
  <div class="watermark">System Generated Payslip — No signature required if digitally authorised</div>
</body></html>`;
}