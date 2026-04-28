import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

function hexToRgbNorm(hex: string): [number, number, number] {
  const h = hex.replace("#", "").padEnd(6, "0");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

interface PayslipData {
  companyName: string;
  companyAddress: string;
  periodLabel: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  pan: string;
  uan: string;
  gender: string;
  location: string;
  bankAccount: string;
  bankIfsc: string;
  earnings: { name: string; monthly?: number; amount?: number }[];
  deductions: { name: string; monthly?: number; amount?: number }[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  workingDays: number;
  paidDays: number;
  lwpDays: number;
  brandColor: string;
}

async function generatePayslipPdf(data: PayslipData): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import("https://esm.sh/pdf-lib@1.17.1");

  const pdfDoc = await PDFDocument.create();
  const W = 595.28, H = 841.89;
  const page = pdfDoc.addPage([W, H]);

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const [br, bg, bb] = hexToRgbNorm(data.brandColor);
  const brand = rgb(br, bg, bb);
  const white = rgb(1, 1, 1);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.5, 0.5, 0.5);
  // Light tint: blend brand color 8% with white
  const tintR = br * 0.08 + 0.92, tintG = bg * 0.08 + 0.92, tintB = bb * 0.08 + 0.92;
  const tint = rgb(tintR, tintG, tintB);

  const margin = 36;
  const contentW = W - margin * 2;

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const headerH = 64;
  page.drawRectangle({ x: 0, y: H - headerH, width: W, height: headerH, color: brand });

  const coName = data.companyName.toUpperCase().slice(0, 52);
  page.drawText(coName, { x: margin, y: H - 26, size: 12, font: bold, color: white });
  if (data.companyAddress) {
    page.drawText(data.companyAddress.slice(0, 90), { x: margin, y: H - 42, size: 8, font: reg, color: rgb(0.9, 0.9, 0.9) });
  }

  const title = "PAY SLIP";
  const titleW = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, { x: W - margin - titleW, y: H - 26, size: 14, font: bold, color: white });
  const perW = reg.widthOfTextAtSize(data.periodLabel, 9);
  page.drawText(data.periodLabel, { x: W - margin - perW, y: H - 42, size: 9, font: reg, color: rgb(0.85, 0.85, 0.85) });

  let y = H - headerH - 8;

  // ── EMPLOYEE NAME BAR ────────────────────────────────────────────────────────
  const nameBarH = 28;
  page.drawRectangle({ x: margin, y: y - nameBarH, width: contentW, height: nameBarH, color: tint });
  page.drawRectangle({ x: margin, y: y - nameBarH, width: 3, height: nameBarH, color: brand });
  page.drawText(data.employeeName.slice(0, 55), { x: margin + 8, y: y - 13, size: 11, font: bold, color: brand });
  const sub = [data.designation, data.department].filter(s => s && s !== "-").join(" / ");
  if (sub) page.drawText(sub.slice(0, 80), { x: margin + 8, y: y - 23, size: 8, font: reg, color: gray });
  y -= nameBarH + 5;

  // ── EMPLOYEE INFO GRID ───────────────────────────────────────────────────────
  const empFields: [string, string][] = [
    ["Employee ID", data.employeeId],
    ["Pay Period", data.periodLabel],
    ["Designation", data.designation],
    ["Department", data.department],
    ["Gender", data.gender],
    ["Location", data.location],
    ["Date of Joining", data.dateOfJoining],
    ["Working Days", String(data.workingDays)],
    ["Paid Days", String(data.paidDays)],
    ["LOP Days", String(data.lwpDays)],
    ["PAN No", data.pan],
    ["UAN No", data.uan],
    ["Bank A/C No", data.bankAccount],
    ["IFSC Code", data.bankIfsc],
  ];

  const rowH = 16, gridRows = Math.ceil(empFields.length / 2);
  const gridH = gridRows * rowH;
  const colW = contentW / 2, labelW = colW * 0.42;

  page.drawRectangle({ x: margin, y: y - gridH, width: contentW, height: gridH, color: white });
  page.drawRectangle({ x: margin, y: y - gridH, width: contentW, height: gridH,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5, color: rgb(1,1,1,0) });

  for (let i = 0; i < empFields.length; i += 2) {
    const row = Math.floor(i / 2);
    const ry = y - (row + 1) * rowH;
    if (row > 0) {
      page.drawLine({ start: { x: margin, y: ry + rowH }, end: { x: margin + contentW, y: ry + rowH },
        thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    }
    // Left col label
    page.drawRectangle({ x: margin, y: ry, width: labelW, height: rowH, color: tint });
    page.drawText(empFields[i][0], { x: margin + 4, y: ry + 5, size: 7, font: bold, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(empFields[i][1].slice(0, 28), { x: margin + labelW + 4, y: ry + 5, size: 8, font: reg, color: black });
    // Vertical dividers left col
    page.drawLine({ start: { x: margin + labelW, y: ry }, end: { x: margin + labelW, y: ry + rowH },
      thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
    // Center divider
    page.drawLine({ start: { x: margin + colW, y: ry }, end: { x: margin + colW, y: ry + rowH },
      thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    if (i + 1 < empFields.length) {
      page.drawRectangle({ x: margin + colW, y: ry, width: labelW, height: rowH, color: tint });
      page.drawText(empFields[i + 1][0], { x: margin + colW + 4, y: ry + 5, size: 7, font: bold, color: rgb(0.35, 0.35, 0.35) });
      page.drawText(empFields[i + 1][1].slice(0, 28), { x: margin + colW + labelW + 4, y: ry + 5, size: 8, font: reg, color: black });
      page.drawLine({ start: { x: margin + colW + labelW, y: ry }, end: { x: margin + colW + labelW, y: ry + rowH },
        thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
    }
  }
  y -= gridH + 12;

  // ── EARNINGS & DEDUCTIONS TABLE ──────────────────────────────────────────────
  const thH = 20, trH = 15;
  page.drawRectangle({ x: margin, y: y - thH, width: contentW, height: thH, color: brand });

  const cE = margin, cEA = margin + contentW * 0.33;
  const cD = margin + contentW * 0.5, cDA = margin + contentW * 0.83;

  page.drawText("Earning", { x: cE + 4, y: y - 13, size: 8.5, font: bold, color: white });
  page.drawText("Amount (Rs.)", { x: cEA - 2, y: y - 13, size: 8, font: bold, color: white });
  page.drawLine({ start: { x: margin + contentW * 0.5, y: y - thH }, end: { x: margin + contentW * 0.5, y: y },
    thickness: 0.5, color: rgb(1,1,1) });
  page.drawText("Deduction", { x: cD + 4, y: y - 13, size: 8.5, font: bold, color: white });
  page.drawText("Amount (Rs.)", { x: cDA - 2, y: y - 13, size: 8, font: bold, color: white });
  y -= thH;

  const fmtAmt = (n: number) => `Rs.${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const maxRows = Math.max(data.earnings.length, data.deductions.length);

  for (let i = 0; i < maxRows; i++) {
    const e = data.earnings[i] || null;
    const d = data.deductions[i] || null;
    if (i % 2 === 1) page.drawRectangle({ x: margin, y: y - trH, width: contentW, height: trH, color: tint });
    page.drawLine({ start: { x: margin, y: y - trH }, end: { x: margin + contentW, y: y - trH },
      thickness: 0.2, color: rgb(0.9, 0.9, 0.9) });
    page.drawLine({ start: { x: margin + contentW * 0.5, y: y - trH }, end: { x: margin + contentW * 0.5, y: y },
      thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
    if (e) {
      page.drawText(String(e.name).slice(0, 32), { x: cE + 4, y: y - 10, size: 8, font: reg, color: black });
      const as = fmtAmt(e.monthly ?? e.amount ?? 0);
      page.drawText(as, { x: cEA - 2, y: y - 10, size: 8, font: reg, color: black });
    }
    if (d) {
      page.drawText(String(d.name).slice(0, 32), { x: cD + 4, y: y - 10, size: 8, font: reg, color: black });
      const as = fmtAmt(d.monthly ?? d.amount ?? 0);
      page.drawText(as, { x: cDA - 2, y: y - 10, size: 8, font: reg, color: black });
    }
    y -= trH;
  }

  // Total row
  const totH = 18;
  page.drawRectangle({ x: margin, y: y - totH, width: contentW, height: totH, color: tint });
  page.drawLine({ start: { x: margin, y }, end: { x: margin + contentW, y }, thickness: 1.2, color: brand });
  page.drawText("Total Earnings", { x: cE + 4, y: y - 12, size: 8.5, font: bold, color: rgb(0.05, 0.45, 0.2) });
  page.drawText(fmtAmt(data.grossEarnings), { x: cEA - 2, y: y - 12, size: 8.5, font: bold, color: rgb(0.05, 0.45, 0.2) });
  page.drawLine({ start: { x: margin + contentW * 0.5, y: y - totH }, end: { x: margin + contentW * 0.5, y }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
  page.drawText("Total Deductions", { x: cD + 4, y: y - 12, size: 8.5, font: bold, color: rgb(0.75, 0.1, 0.1) });
  page.drawText(fmtAmt(data.totalDeductions), { x: cDA - 2, y: y - 12, size: 8.5, font: bold, color: rgb(0.75, 0.1, 0.1) });
  y -= totH + 10;

  // ── NET PAY BOX ──────────────────────────────────────────────────────────────
  const netH = 44;
  page.drawRectangle({ x: margin, y: y - netH, width: contentW, height: netH, color: brand });
  page.drawText("TOTAL NET PAYABLE", { x: margin + 12, y: y - 16, size: 8, font: bold, color: rgb(0.9, 0.9, 0.9) });
  page.drawText("Gross Earnings - Total Deductions", { x: margin + 12, y: y - 28, size: 7.5, font: reg, color: rgb(0.75, 0.75, 0.75) });
  const netStr = `Rs.${Math.round(data.netPay).toLocaleString("en-IN")}/-`;
  const netW = bold.widthOfTextAtSize(netStr, 18);
  page.drawText(netStr, { x: margin + contentW - netW - 12, y: y - 30, size: 18, font: bold, color: white });
  y -= netH;

  // Words bar
  const wordsH = 18;
  page.drawRectangle({ x: margin, y: y - wordsH, width: contentW, height: wordsH, color: tint });
  page.drawLine({ start: { x: margin, y: y - wordsH }, end: { x: margin + contentW, y: y - wordsH }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  const words = `Amount in Words: ${numberToWords(data.netPay)}`.slice(0, 95);
  const wordsW = reg.widthOfTextAtSize(words, 8);
  page.drawText(words, { x: margin + Math.max(0, (contentW - wordsW) / 2), y: y - 12, size: 8, font: reg, color: black });
  y -= wordsH + 12;

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: margin, y }, end: { x: margin + contentW, y }, thickness: 1, color: brand });
  y -= 12;
  const genDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  page.drawText(`Generated on ${genDate}`, { x: margin, y, size: 8, font: reg, color: gray });
  const stat = "Computer-generated payslip. Valid under IT Act 2000 and Payment of Wages Act 1936.";
  const statW = reg.widthOfTextAtSize(stat, 7.5);
  page.drawText(stat, { x: Math.max(margin, W - margin - statW), y, size: 7.5, font: reg, color: rgb(0.6, 0.6, 0.6) });

  return await pdfDoc.save();
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

    const body = await req.json();
    const { payroll_run_id, entry_ids, entry_id } = body;

    // ── Single-entry mode (engine record): entry_id provided ─────────────────
    if (entry_id && !payroll_run_id) {
      const { data: entry, error: entErr } = await supabase
        .from("payroll_entries")
        .select("*, profiles!profile_id(full_name, department, job_title, location, join_date), payroll_runs!payroll_run_id(pay_period, organization_id, status)")
        .eq("id", entry_id)
        .single();

      if (entErr || !entry) {
        return new Response(JSON.stringify({ error: "Entry not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const run = entry.payroll_runs as any;
      const orgId = run?.organization_id;
      const payPeriod = run?.pay_period;

      const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
      const { data: compliance } = await supabase.from("organization_compliance")
        .select("brand_color, legal_name, registered_address, state, pincode")
        .eq("organization_id", orgId).maybeSingle();

      const { data: empDetail } = await supabase.from("employee_details")
        .select("pan_number, uan_number, bank_account_number, bank_ifsc, employee_id_number, date_of_joining, gender")
        .eq("profile_id", entry.profile_id).maybeSingle();

      const [yr, mo] = (payPeriod || "2026-01").split("-");
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const periodLabel = `${months[parseInt(mo) - 1]} ${yr}`;

      const profile: any = entry.profiles || {};
      const details: any = empDetail || {};
      const brandColor = (compliance as any)?.brand_color || "#e11d74";
      const companyName = (compliance as any)?.legal_name || org?.name || "";
      const addr = [(compliance as any)?.registered_address, (compliance as any)?.state, (compliance as any)?.pincode].filter(Boolean).join(", ");

      const pdfBytes = await generatePayslipPdf({
        companyName, companyAddress: addr, periodLabel,
        employeeName: profile.full_name || "Employee",
        employeeId: details.employee_id_number || "—",
        designation: profile.job_title || "—",
        department: profile.department || "—",
        dateOfJoining: details.date_of_joining || profile.join_date || "—",
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
        workingDays: entry.working_days || 0,
        paidDays: entry.paid_days || 0,
        lwpDays: entry.lwp_days || 0,
        brandColor,
      });

      const storagePath = `payslips/${orgId}/${entry.profile_id}/${payPeriod}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("erp-documents")
        .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (uploadErr) {
        return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadErr.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabase.from("payroll_entries")
        .update({ payslip_url: storagePath, payslip_generated_at: new Date().toISOString() })
        .eq("id", entry_id);

      const { data: signed } = await supabase.storage
        .from("erp-documents")
        .createSignedUrl(storagePath, 3600);

      return new Response(JSON.stringify({ success: true, signed_url: signed?.signedUrl ?? null }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Batch mode: payroll_run_id provided ──────────────────────────────────
    if (!payroll_run_id) {
      return new Response(JSON.stringify({ error: "payroll_run_id or entry_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: run, error: runErr } = await supabase.from("payroll_runs").select("*").eq("id", payroll_run_id).single();
    if (runErr || !run) {
      return new Response(JSON.stringify({ error: "Payroll run not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (run.status !== "locked") {
      return new Response(JSON.stringify({ error: "Payslips can only be generated for locked payroll runs" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: org } = await supabase.from("organizations").select("name").eq("id", run.organization_id).single();
    const { data: compliance } = await supabase.from("organization_compliance")
      .select("brand_color, legal_name, registered_address, state, pincode")
      .eq("organization_id", run.organization_id).maybeSingle();
    const brandColor = (compliance as any)?.brand_color || "#e11d74";
    const companyName = (compliance as any)?.legal_name || org?.name || "";
    const companyAddress = [(compliance as any)?.registered_address, (compliance as any)?.state, (compliance as any)?.pincode].filter(Boolean).join(", ");

    let query = supabase
      .from("payroll_entries")
      .select("*, profiles!profile_id(full_name, email, department, job_title, location, join_date)")
      .eq("payroll_run_id", payroll_run_id)
      .is("payslip_generated_at", null);

    if (entry_ids && entry_ids.length > 0) query = query.in("id", entry_ids);

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
      .select("profile_id, pan_number, uan_number, bank_account_number, bank_ifsc, employee_id_number, date_of_joining, gender")
      .in("profile_id", profileIds);

    const detailsMap = new Map((empDetails ?? []).map((d: any) => [d.profile_id, d]));

    const [year, month] = run.pay_period.split("-");
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const periodLabel = `${months[parseInt(month) - 1]} ${year}`;

    let generatedCount = 0;

    for (const entry of entries) {
      const details: any = detailsMap.get(entry.profile_id) || {};
      const profile: any = entry.profiles || {};

      const pdfBytes = await generatePayslipPdf({
        companyName, companyAddress, periodLabel,
        employeeName: profile.full_name || "Employee",
        employeeId: details.employee_id_number || "—",
        designation: profile.job_title || "—",
        department: profile.department || "—",
        dateOfJoining: details.date_of_joining || profile.join_date || "—",
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
        workingDays: entry.working_days || 0,
        paidDays: entry.paid_days || 0,
        lwpDays: entry.lwp_days || 0,
        brandColor,
      });

      const storagePath = `payslips/${run.organization_id}/${entry.profile_id}/${run.pay_period}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("erp-documents")
        .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (uploadErr) {
        console.error(`Upload failed for profile ${entry.profile_id}:`, uploadErr.message);
        continue;
      }

      await supabase.from("payroll_entries")
        .update({ payslip_url: storagePath, payslip_generated_at: new Date().toISOString() })
        .eq("id", entry.id);

      generatedCount++;
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "payslips_generated",
      entity_type: "payroll_run",
      entity_id: payroll_run_id,
      organization_id: run.organization_id,
      metadata: { pay_period: run.pay_period, generated_count: generatedCount },
    });

    return new Response(JSON.stringify({ success: true, generated: generatedCount }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// Kept for reference / future HTML email use
function buildPayslipHTML(data: PayslipData & { brandColor: string }): string {
  return `<!-- payslip HTML preserved for email use: ${data.employeeName} ${data.periodLabel} -->`;
}
