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
    const { data: compliance } = await supabase.from("organization_compliance").select("brand_color, authorized_signatory_name, legal_name, registered_address, state, pincode").eq("organization_id", run.organization_id).maybeSingle();
    const brandColor = compliance?.brand_color || "#e11d74";

    let query = supabase
      .from("payroll_entries")
      .select("*, profiles!profile_id(full_name, email, department, job_title, date_of_joining, location)")
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
      .select("profile_id, pan_number, uan_number, bank_account_number, bank_name, bank_ifsc, employee_id_number, date_of_joining, gender")
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
        companyAddress: [compliance?.registered_address, compliance?.state, compliance?.pincode].filter(Boolean).join(", "),
        periodLabel,
        employeeName: profile.full_name || "Employee",
        employeeId: details.employee_id_number || "—",
        designation: profile.job_title || "—",
        department: profile.department || "—",
        dateOfJoining: details.date_of_joining || profile.date_of_joining || "—",
        pan: details.pan_number || "—",
        uan: details.uan_number || "—",
        gender: details.gender || "—",
        location: profile.location || "—",
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
  employeeName: string; employeeId: string; designation: string; department: string; dateOfJoining: string;
  pan: string; uan: string; gender: string; location: string; bankAccount: string; bankIfsc: string;
  earnings: any[]; deductions: any[];
  grossEarnings: number; totalDeductions: number; netPay: number;
  workingDays: number; paidDays: number; lwpDays: number;
  brandColor: string;
}): string {
  const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Derive a slightly darker shade for table row tints
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };
  const rgb = hexToRgb(data.brandColor);
  const tintBg = `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`;
  const tintMed = `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;

  const maxRows = Math.max(data.earnings.length, data.deductions.length);
  const padE = [...data.earnings, ...Array(Math.max(0, maxRows - data.earnings.length)).fill(null)];
  const padD = [...data.deductions, ...Array(Math.max(0, maxRows - data.deductions.length)).fill(null)];

  const rows = padE.map((e: any, i: number) => {
    const d = padD[i];
    const bg = i % 2 === 0 ? "#fff" : tintBg;
    return `<tr style="background:${bg}">
      <td class="cell">${e ? e.name : ''}</td>
      <td class="cell r">${e ? fmt(e.monthly ?? e.amount ?? 0) : ''}</td>
      <td class="cell mid">${d ? d.name : ''}</td>
      <td class="cell r">${d ? fmt(d.monthly ?? d.amount ?? 0) : ''}</td>
    </tr>`;
  }).join("");

  const genDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  // Employee info grid rows: rendered as 4-col table (label|value|label|value), pairs taken sequentially
  const formattedDOJ = typeof data.dateOfJoining === "string" && data.dateOfJoining !== "—"
    ? new Date(data.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : data.dateOfJoining;
  const empFields = [
    ["Employee ID",    data.employeeId],
    ["Pay Period",     data.periodLabel],
    ["Designation",    data.designation],
    ["Department",     data.department],
    ["Gender",         data.gender],
    ["Location",       data.location],
    ["Date of Joining", formattedDOJ],
    ["Working Days",   String(data.workingDays)],
    ["Paid Days",      String(data.paidDays)],
    ["LOP Days",       String(data.lwpDays)],
    ["PAN No",         data.pan],
    ["UAN No",         data.uan],
    ["Bank A/C No",    data.bankAccount],
    ["IFSC Code",      data.bankIfsc],
  ];

  // Render as a 4-column grid (label | value | label | value) for compact A4 layout
  const empRows: string[] = [];
  for (let i = 0; i < empFields.length; i += 2) {
    const [l1, v1] = empFields[i];
    const [l2, v2] = empFields[i + 1] || ["", ""];
    empRows.push(`<tr>
      <td class="eg-label">${l1}</td><td class="eg-value">${v1}</td>
      <td class="eg-label">${l2}</td><td class="eg-value">${v2}</td>
    </tr>`);
  }

  const bc = data.brandColor;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Pay Slip — ${data.employeeName} — ${data.periodLabel}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #1a1a1a; background: #fff;
         width: 700px; max-width: 700px; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── Header ── */
  .header { background: ${bc}; padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-left .co-name { font-size: 20px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1.5px; line-height: 1.2; }
  .header-left .co-addr { font-size: 10px; color: rgba(255,255,255,0.80); margin-top: 4px; line-height: 1.6; max-width: 340px; }
  .header-right { text-align: right; }
  .header-right .slip-title { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 2px; text-transform: uppercase; }
  .header-right .slip-period { font-size: 11px; color: rgba(255,255,255,0.85); margin-top: 4px; font-style: italic; }

  /* ── Employee section ── */
  .emp-name-bar { background: ${tintMed}; padding: 8px 16px; border-left: 4px solid ${bc}; margin-top: 14px; }
  .emp-name-bar .name { font-size: 15px; font-weight: 700; color: ${bc}; }
  .emp-name-bar .sub  { font-size: 11px; color: #555; margin-top: 2px; }

  .emp-table { width: 100%; border-collapse: collapse; margin-top: 0; border: 1px solid #ddd; }
  .emp-table .eg-label { font-size: 10px; font-weight: 700; color: #444; text-transform: uppercase;
                          letter-spacing: 0.4px; padding: 5px 10px; background: ${tintBg};
                          border-bottom: 1px solid #e8e8e8; border-right: 1px solid #ddd; width: 18%; }
  .emp-table .eg-value { font-size: 11px; color: #222; padding: 5px 10px;
                          border-bottom: 1px solid #e8e8e8; border-right: 1px solid #ddd; width: 32%; }
  .emp-table tr:last-child .eg-label,
  .emp-table tr:last-child .eg-value { border-bottom: none; }

  /* ── Earnings & Deductions ── */
  .ed-table { width: 100%; border-collapse: collapse; margin-top: 14px; border: 1px solid #ddd; }
  .ed-table thead th { background: ${bc}; color: #fff; font-size: 11px; font-weight: 700;
                        padding: 7px 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .ed-table thead th.r { text-align: right; }
  .cell { padding: 5px 10px; font-size: 11px; border-bottom: 1px solid #eee; color: #222; }
  .cell.r { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .cell.mid { border-left: 1px solid #ddd; }
  .total-row td { border-top: 2px solid ${bc}; font-weight: 700; font-size: 11px; padding: 7px 10px;
                   background: ${tintBg}; }
  .total-row .earn  { color: #15803d; }
  .total-row .ded   { color: #dc2626; }

  /* ── Net Pay ── */
  .net-box { background: ${bc}; padding: 14px 20px; margin-top: 14px;
              display: flex; justify-content: space-between; align-items: center; }
  .net-box .net-label { color: rgba(255,255,255,0.9); font-size: 11px; text-transform: uppercase;
                          letter-spacing: 1px; font-weight: 700; }
  .net-box .net-sub   { color: rgba(255,255,255,0.7); font-size: 10px; font-style: italic; margin-top: 3px; }
  .net-box .net-amt   { color: #fff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .words-bar { background: ${tintBg}; border: 1px solid #ddd; border-top: none;
                text-align: center; font-size: 11px; font-weight: 600; color: #333; padding: 7px 10px; }

  /* ── Footer ── */
  .footer { margin-top: 18px; border-top: 2px solid ${bc}; padding-top: 10px;
             display: flex; justify-content: space-between; align-items: flex-start; }
  .footer .gen-date  { font-size: 10px; color: #888; }
  .footer .statutory { font-size: 9.5px; color: #999; font-style: italic; text-align: right; max-width: 340px; line-height: 1.5; }
</style></head><body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="co-name">${data.companyName}</div>
      ${data.companyAddress ? `<div class="co-addr">${data.companyAddress}</div>` : ''}
    </div>
    <div class="header-right">
      <div class="slip-title">Pay Slip</div>
      <div class="slip-period">${data.periodLabel}</div>
    </div>
  </div>

  <!-- Employee Name Bar -->
  <div class="emp-name-bar">
    <div class="name">${data.employeeName}</div>
    <div class="sub">${data.designation}${data.department && data.department !== '—' ? ' &nbsp;·&nbsp; ' + data.department : ''}</div>
  </div>

  <!-- Employee Details Grid -->
  <table class="emp-table">
    <tbody>
      ${empRows.join("\n      ")}
    </tbody>
  </table>

  <!-- Earnings & Deductions -->
  <table class="ed-table">
    <thead>
      <tr>
        <th style="text-align:left">Earning</th>
        <th class="r">Amount (₹)</th>
        <th style="text-align:left;border-left:1px solid rgba(255,255,255,0.3)">Deduction</th>
        <th class="r">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td>Total Earnings</td>
        <td class="r earn">${fmt(data.grossEarnings)}</td>
        <td class="mid">Total Deductions</td>
        <td class="r ded">${fmt(data.totalDeductions)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Net Pay -->
  <div class="net-box">
    <div>
      <div class="net-label">Total Net Payable</div>
      <div class="net-sub">Gross Earnings − Total Deductions</div>
    </div>
    <div class="net-amt">₹${Math.round(data.netPay).toLocaleString("en-IN")}/-</div>
  </div>
  <div class="words-bar">Amount in Words: ${numberToWords(data.netPay)}</div>

  <!-- Footer -->
  <div class="footer">
    <div class="gen-date">Generated on ${genDate}</div>
    <div class="statutory">This is a computer-generated payslip and does not require a physical signature.<br>
      Valid under the Information Technology Act, 2000 and the Payment of Wages Act, 1936.</div>
  </div>

</body></html>`;
}
