import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Number to Indian English words
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function twoDigits(n: number): string { return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''); }
  function threeDigits(n: number): string { if (n === 0) return ''; if (n < 100) return twoDigits(n); return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + twoDigits(n % 100) : ''); }
  if (num === 0) return 'Zero';
  const n = Math.abs(Math.round(num));
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  let result = '';
  if (crore) result += threeDigits(crore) + ' Crore ';
  if (lakh) result += twoDigits(lakh) + ' Lakh ';
  if (thousand) result += twoDigits(thousand) + ' Thousand ';
  if (rest) result += threeDigits(rest);
  return 'Rupees ' + result.trim() + ' Only';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowedRoles = ["admin", "hr", "finance"];
    const hasRole = (callerRoles ?? []).some((r: any) => allowedRoles.includes(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { payroll_run_id, entry_ids } = await req.json();

    if (!payroll_run_id) {
      return new Response(JSON.stringify({ error: "payroll_run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: run, error: runErr } = await supabase.from("payroll_runs").select("*").eq("id", payroll_run_id).single();
    if (runErr || !run) {
      return new Response(JSON.stringify({ error: "Payroll run not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (run.status !== "locked") {
      return new Response(JSON.stringify({ error: "Payslips can only be generated for locked payroll runs" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: org } = await supabase.from("organizations").select("name").eq("id", run.organization_id).single();

    // Fetch branding, signatory, and registered address from organization_compliance
    const { data: compliance } = await supabase.from("organization_compliance").select("brand_color, authorized_signatory_name, legal_name, registered_address").eq("organization_id", run.organization_id).maybeSingle();
    const brandColor = compliance?.brand_color || "#e11d74";
    const authorizedSignatoryName = compliance?.authorized_signatory_name || "";

    let query = supabase
      .from("payroll_entries")
      .select("*, profiles!profile_id(full_name, email, department, job_title, date_of_joining)")
      .eq("payroll_run_id", payroll_run_id);

    if (entry_ids && entry_ids.length > 0) query = query.in("id", entry_ids);
    query = query.is("payslip_generated_at", null);

    const { data: entries, error: entErr } = await query;
    if (entErr) {
      return new Response(JSON.stringify({ error: entErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ message: "All payslips already generated", generated: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const profileIds = entries.map((e: any) => e.profile_id);
    const { data: empDetails } = await supabase
      .from("employee_details")
      .select("profile_id, pan_number, uan_number, bank_account_number, bank_name, bank_ifsc, employee_id_number, date_of_joining")
      .in("profile_id", profileIds);

    const detailsMap = new Map((empDetails ?? []).map((d: any) => [d.profile_id, d]));

    const [year, month] = run.pay_period.split("-");
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const periodLabel = `${months[parseInt(month) - 1]} ${year}`;

    let generatedCount = 0;

    for (const entry of entries) {
      const details: any = detailsMap.get(entry.profile_id) || {};
      const profile: any = entry.profiles || {};

      const html = buildPayslipHTML({
        companyName: compliance?.legal_name || org?.name || "",
        companyAddress: compliance?.registered_address || "",
        periodLabel,
        employeeName: profile.full_name || "Employee",
        employeeId: details.employee_id_number || "—",
        designation: profile.job_title || "—",
        dateOfJoining: details.date_of_joining || profile.date_of_joining || "—",
        pan: details.pan_number || "—",
        uan: details.uan_number || "—",
        bankName: details.bank_name || "—",
        bankAccount: details.bank_account_number || "—",
        bankIfsc: details.bank_ifsc || "—",
        earnings: (entry.earnings_breakdown as any[]) || [],
        deductions: (entry.deductions_breakdown as any[]) || [],
        grossEarnings: entry.gross_earnings,
        totalDeductions: entry.total_deductions,
        netPay: entry.net_pay,
        workingDays: entry.working_days,
        paidDays: entry.paid_days || 0,
        lwpDays: entry.lwp_days,
        brandColor,
        authorizedSignatoryName,
      });

      const payslipUrl = `payslip://${run.pay_period}/${entry.profile_id}`;
      await supabase.from("payroll_entries").update({ payslip_url: payslipUrl, payslip_generated_at: new Date().toISOString() }).eq("id", entry.id);
      generatedCount++;
    }

    await supabase.from("audit_logs").insert({
      actor_id: run.generated_by,
      action: "payslips_generated",
      entity_type: "payroll_run",
      entity_id: payroll_run_id,
      organization_id: run.organization_id,
      metadata: { pay_period: run.pay_period, generated_count: generatedCount },
    });

    return new Response(JSON.stringify({ success: true, generated: generatedCount }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildPayslipHTML(data: {
  companyName: string; companyAddress: string; periodLabel: string;
  employeeName: string; employeeId: string; designation: string; dateOfJoining: string;
  pan: string; uan: string; bankName: string; bankAccount: string; bankIfsc: string;
  earnings: any[]; deductions: any[];
  grossEarnings: number; totalDeductions: number; netPay: number;
  workingDays: number; paidDays: number; lwpDays: number;
  brandColor: string;
  authorizedSignatoryName: string;
}): string {
  const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const maxRows = Math.max(data.earnings.length, data.deductions.length);
  const padE = [...data.earnings, ...Array(Math.max(0, maxRows - data.earnings.length)).fill(null)];
  const padD = [...data.deductions, ...Array(Math.max(0, maxRows - data.deductions.length)).fill(null)];

  const rows = padE.map((e: any, i: number) => {
    const d = padD[i];
    return `<tr>
      <td class="cell">${e ? e.name : ''}</td>
      <td class="cell r">${e ? fmt(e.monthly ?? e.amount ?? 0) : ''}</td>
      <td class="cell">${d ? d.name : ''}</td>
      <td class="cell r">${d ? fmt(d.monthly ?? d.amount ?? 0) : ''}</td>
    </tr>`;
  }).join("");

  const bc = data.brandColor;
  // Derive a slightly darker shade for borders
  const darken = (hex: string): string => {
    const h = hex.replace("#", "");
    const r = Math.max(0, parseInt(h.substring(0, 2), 16) - 20);
    const g = Math.max(0, parseInt(h.substring(2, 4), 16) - 20);
    const b = Math.max(0, parseInt(h.substring(4, 6), 16) - 20);
    return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
  };
  const bcBorder = darken(bc);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pay Slip — ${data.employeeName} — ${data.periodLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; background: #fff; width: 700px; max-width: 700px; margin: 0 auto; padding: 30px 36px 50px; }
  .company-header { display: flex; align-items: center; gap: 18px; margin-bottom: 6px; }
  .company-name { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  .company-address { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.5; }
  .payslip-title { text-align: center; font-size: 22px; font-weight: 600; font-style: italic; margin: 8px 0 16px; }
  .emp-section { border: 1px solid #ccc; margin-bottom: 16px; }
  .emp-header { background: ${bc}; color: #fff; text-align: center; font-size: 13px; font-weight: 700; padding: 6px; text-transform: uppercase; letter-spacing: 1px; }
  .emp-name { font-size: 15px; font-weight: 700; color: ${bc}; padding: 8px 12px; border-bottom: 1px solid #ddd; }
  .emp-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; }
  .emp-grid .eg-label { font-size: 11px; font-weight: 600; padding: 5px 12px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; background: #fafafa; }
  .emp-grid .eg-value { font-size: 11px; color: #555; padding: 5px 12px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; }
  .ed-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #ccc; }
  .ed-table .ed-header th { background: ${bc}; color: #fff; font-size: 12px; font-weight: 700; padding: 6px 12px; text-transform: uppercase; text-align: left; border: 1px solid ${bcBorder}; }
  .ed-table .ed-header th.r { text-align: right; }
  .cell { padding: 5px 12px; font-size: 12px; border-bottom: 1px solid #eee; }
  .cell.r { text-align: right; font-weight: 500; }
  .total-row td { border-top: 2px solid #999; font-weight: 700; font-size: 12px; padding: 7px 12px; }
  .netpay-row td { font-weight: 700; font-size: 12px; padding: 7px 12px; border-top: 1px solid #ccc; }
  .net-box { border: 2px solid #333; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .net-box .title { font-size: 14px; font-weight: 800; text-transform: uppercase; }
  .net-box .sub { font-size: 11px; color: #888; font-style: italic; }
  .net-box .amount { font-size: 24px; font-weight: 800; color: ${bc}; }
  .words-row { text-align: center; font-size: 12px; font-weight: 600; padding: 8px; border: 1px solid #ccc; border-top: none; background: #fafafa; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
  .footer .sig span { display: block; width: 140px; border-top: 1px solid #bbb; padding-top: 4px; margin-top: 30px; text-align: right; }
</style></head><body>
  <div class="company-header">
    <div>
      <div class="company-name">${data.companyName}</div>
      <div class="company-address">${data.companyAddress}</div>
    </div>
  </div>
  <div class="payslip-title">Pay Slip</div>

  <div class="emp-section">
    <div class="emp-header">Employee Summary</div>
    <div class="emp-name">${data.employeeName}</div>
    <div class="emp-grid">
      <div class="eg-label">Employee ID</div><div class="eg-value">${data.employeeId}</div>
      <div class="eg-label">PAN No</div><div class="eg-value">${data.pan}</div>
      <div class="eg-label">Designation</div><div class="eg-value">${data.designation}</div>
      <div class="eg-label">Bank Name</div><div class="eg-value">${data.bankName}</div>
      <div class="eg-label">Date of Joining</div><div class="eg-value">${data.dateOfJoining}</div>
      <div class="eg-label">Bank A/C No</div><div class="eg-value">${data.bankAccount}</div>
      <div class="eg-label">Pay Period</div><div class="eg-value">${data.periodLabel}</div>
      <div class="eg-label">IFSC Code</div><div class="eg-value">${data.bankIfsc}</div>
      <div class="eg-label">Working Days</div><div class="eg-value">${data.workingDays}</div>
      <div class="eg-label">UAN No</div><div class="eg-value">${data.uan}</div>
      <div class="eg-label">Paid Days</div><div class="eg-value">${data.paidDays}</div>
      <div class="eg-label">LOP</div><div class="eg-value">${data.lwpDays}</div>
    </div>
  </div>

  <table class="ed-table">
    <tr class="ed-header"><th>Earning</th><th class="r">Amount</th><th>Deduction</th><th class="r">Amount</th></tr>
    ${rows}
    <tr class="total-row">
      <td>Total Earnings</td><td class="r" style="color:#16a34a">${fmt(data.grossEarnings)}</td>
      <td>Total Deductions</td><td class="r" style="color:#dc2626">${fmt(data.totalDeductions)}</td>
    </tr>
    <tr class="netpay-row"><td colspan="2"></td><td><strong>Net Pay</strong></td><td class="r">${fmt(data.netPay)}</td></tr>
  </table>

  <div class="net-box">
    <div><div class="title">Total Net Payable</div><div class="sub">Gross Earnings - Total Deduction</div></div>
    <div class="amount">Rs : ${Math.round(data.netPay).toLocaleString("en-IN")}/-</div>
  </div>
  <div class="words-row">Amount in Words : ${numberToWords(data.netPay)}</div>

   <div class="footer">
    <div>Generated: ${new Date().toLocaleDateString("en-IN")}</div>
    <div class="sig">${data.authorizedSignatoryName ? `<span style="font-weight:600;font-size:11px;display:block;margin-bottom:2px">${data.authorizedSignatoryName}</span>` : ''}<span>Authorised Signatory</span></div>
  </div>
</body></html>`;
}
