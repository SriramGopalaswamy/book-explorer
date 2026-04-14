import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import DOMPurify from "dompurify";
import type { PayrollRecord } from "@/hooks/usePayroll";
import grx10Logo from "@/assets/grx10-logo.webp";
import { useState, useEffect } from "react";
import { normalizePayslip } from "@/lib/payslip-utils";
import { numberToWords } from "@/lib/number-to-words";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployeeDetails } from "@/hooks/useEmployeeDetails";
import React from "react";

/** Convert imported asset URL to an inline data URL for use in detached windows/iframes */
function useLogoDataUrl(src: string) {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          setDataUrl(canvas.toDataURL("image/png"));
        }
      } catch { /* CORS fallback */ }
    };
    img.src = src;
  }, [src]);
  return dataUrl;
}

const fmtFull = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (value: number) => `₹${value.toLocaleString("en-IN")}`;

/** Fetch branding and org identity info from organization_compliance for current user */
function useBrandingInfo(userId: string | undefined) {
  const [color, setColor] = useState("#e11d74");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
      if (!profile?.organization_id) return;
      const [{ data: compliance }, { data: org }] = await Promise.all([
        supabase.from("organization_compliance" as any).select("brand_color, legal_name, registered_address, state, pincode").eq("organization_id", profile.organization_id).maybeSingle(),
        supabase.from("organizations").select("name").eq("id", profile.organization_id).maybeSingle(),
      ]);
      if ((compliance as any)?.brand_color) setColor((compliance as any).brand_color);
      setCompanyName((compliance as any)?.legal_name || (org as any)?.name || "");
      const parts = [
        (compliance as any)?.registered_address,
        (compliance as any)?.state,
        (compliance as any)?.pincode,
      ].filter(Boolean);
      setCompanyAddress(parts.join(", "));
    })();
  }, [userId]);
  return { color, companyName, companyAddress };
}

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[parseInt(m) - 1]} ${y}`;
};

interface PaySlipDialogProps {
  record: PayrollRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaySlipDialog({ record, open, onOpenChange }: PaySlipDialogProps) {
  useLogoDataUrl(grx10Logo); // keep hook call order stable
  const { user } = useAuth();
  const { color: brandColor, companyName, companyAddress } = useBrandingInfo(user?.id);
  const { data: employeeDetails } = useEmployeeDetails(record?.profile_id ?? null);
  if (!record) return null;

  const slip = normalizePayslip(record);
  const { earnings, deductions, totalEarnings, totalDeductions, netPay, lopDays, workingDays, paidDays } = slip;

  const r = record as any;
  const ed = employeeDetails;
  const employeeName  = DOMPurify.sanitize(record.profiles?.full_name || "Employee");
  const jobTitle      = DOMPurify.sanitize(record.profiles?.job_title || "—");
  const department    = DOMPurify.sanitize(record.profiles?.department || r.department || "—");
  const employeeId    = DOMPurify.sanitize(record.profiles?.employee_id || ed?.employee_id_number || r.employee_id || "—");
  const panNumber     = DOMPurify.sanitize(ed?.pan_number || r.pan_number || "—");
  const bankName      = DOMPurify.sanitize(ed?.bank_name || r.bank_name || "—");
  const bankAccount   = DOMPurify.sanitize(ed?.bank_account_number || r.bank_account_number || "—");
  const bankIfsc      = DOMPurify.sanitize(ed?.bank_ifsc || r.bank_ifsc || "—");
  const uanNumber     = DOMPurify.sanitize(ed?.uan_number || r.uan_number || "—");
  const rawJoinDate   = record.profiles?.join_date || r.date_of_joining || "";
  const dateOfJoining = rawJoinDate
    ? DOMPurify.sanitize(new Date(rawJoinDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))
    : "—";
  const period        = periodLabel(record.pay_period);
  const genDate       = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  // Pad earnings/deductions to equal rows for side-by-side table
  const maxRows = Math.max(earnings.length, deductions.length);
  const padE = [...earnings,    ...Array(maxRows - earnings.length).fill(null)];
  const padD = [...deductions,  ...Array(maxRows - deductions.length).fill(null)];

  // Helper: derive tint backgrounds from brand color
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  };
  const rgb     = hexToRgb(brandColor);
  const tintBg  = `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`;
  const tintMed = `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;

  // Employee info table: 4 columns (label|value|label|value)
  const empFields = [
    ["Employee ID",    employeeId,               "Pay Period",   period],
    ["Designation",    jobTitle,                  "Department",   department],
    ["Date of Joining",dateOfJoining,             "Working Days", String(workingDays || "—")],
    ["Paid Days",      String(paidDays || "—"),   "LOP Days",     String(lopDays || "0")],
    ["PAN No",         panNumber,                 "UAN No",       uanNumber],
    ["Bank Name",      bankName,                  "Bank A/C No",  bankAccount],
    ["IFSC Code",      bankIfsc,                  "",             ""],
  ];

  const buildHTML = () => {
    const bc  = brandColor;
    const esc = (v: unknown) => DOMPurify.sanitize(String(v ?? ""));

    const eRows = padE.map((e, i) => {
      const d   = padD[i];
      const bg  = i % 2 === 0 ? "#fff" : tintBg;
      return `<tr style="background:${bg}">
        <td class="cell">${e ? esc(e.label) : ''}</td>
        <td class="cell r">${e && e.amount > 0 ? fmtFull(e.amount) : e ? '--' : ''}</td>
        <td class="cell mid">${d ? esc(d.label) : ''}</td>
        <td class="cell r">${d && d.amount > 0 ? fmtFull(d.amount) : d ? '--' : ''}</td>
      </tr>`;
    }).join("");

    const empRows = empFields.map(([l1, v1, l2, v2]) => `
      <tr>
        <td class="eg-label">${l1}</td><td class="eg-value">${esc(v1)}</td>
        <td class="eg-label">${l2}</td><td class="eg-value">${esc(v2)}</td>
      </tr>`).join("");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Pay Slip — ${employeeName} — ${period}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #1a1a1a; background: #fff;
         width: 700px; max-width: 700px; margin: 0 auto;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Header */
  .header { background: ${bc}; padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; }
  .co-name  { font-size: 20px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1.5px; line-height: 1.2; }
  .co-addr  { font-size: 10px; color: rgba(255,255,255,0.82); margin-top: 4px; line-height: 1.6; max-width: 340px; }
  .slip-title  { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 2px; text-transform: uppercase; text-align: right; }
  .slip-period { font-size: 11px; color: rgba(255,255,255,0.85); margin-top: 4px; font-style: italic; text-align: right; }

  /* Employee name bar */
  .emp-name-bar { background: ${tintMed}; padding: 8px 14px; border-left: 4px solid ${bc}; margin-top: 14px; }
  .emp-name-bar .name { font-size: 15px; font-weight: 700; color: ${bc}; }
  .emp-name-bar .sub  { font-size: 11px; color: #555; margin-top: 2px; }

  /* Employee details grid */
  .emp-table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; }
  .eg-label { font-size: 10px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.4px;
               padding: 5px 10px; background: ${tintBg}; border-bottom: 1px solid #e8e8e8; border-right: 1px solid #ddd; width: 18%; }
  .eg-value { font-size: 11px; color: #222; padding: 5px 10px;
               border-bottom: 1px solid #e8e8e8; border-right: 1px solid #ddd; width: 32%; }
  .emp-table tr:last-child .eg-label,
  .emp-table tr:last-child .eg-value { border-bottom: none; }

  /* Earnings & Deductions */
  .ed-table { width: 100%; border-collapse: collapse; margin-top: 14px; border: 1px solid #ddd; }
  .ed-table thead th { background: ${bc}; color: #fff; font-size: 11px; font-weight: 700;
                        padding: 7px 10px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  .ed-table thead th.r { text-align: right; }
  .cell { padding: 5px 10px; font-size: 11px; border-bottom: 1px solid #eee; color: #222; }
  .cell.r   { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .cell.mid { border-left: 1px solid #ddd; }
  .total-row td { border-top: 2px solid ${bc}; font-weight: 700; font-size: 11px;
                   padding: 7px 10px; background: ${tintBg}; }
  .earn { color: #15803d; }
  .ded  { color: #dc2626; }

  /* Net Pay */
  .net-box { background: ${bc}; padding: 14px 20px; margin-top: 14px;
              display: flex; justify-content: space-between; align-items: center; }
  .net-label { color: rgba(255,255,255,0.9); font-size: 11px; text-transform: uppercase;
                letter-spacing: 1px; font-weight: 700; }
  .net-sub   { color: rgba(255,255,255,0.7); font-size: 10px; font-style: italic; margin-top: 3px; }
  .net-amt   { color: #fff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .words-bar { background: ${tintBg}; border: 1px solid #ddd; border-top: none;
                text-align: center; font-size: 11px; font-weight: 600; color: #333; padding: 7px 10px; }

  /* Footer */
  .footer { margin-top: 18px; border-top: 2px solid ${bc}; padding-top: 10px;
             display: flex; justify-content: space-between; align-items: flex-start; }
  .gen-date  { font-size: 10px; color: #888; }
  .statutory { font-size: 9.5px; color: #999; font-style: italic; text-align: right; max-width: 340px; line-height: 1.5; }

  @media print { body { width: 100%; max-width: 100%; } }
</style></head><body>

  <div class="header">
    <div>
      <div class="co-name">${esc(companyName)}</div>
      ${companyAddress ? `<div class="co-addr">${esc(companyAddress)}</div>` : ''}
    </div>
    <div>
      <div class="slip-title">Pay Slip</div>
      <div class="slip-period">${period}</div>
    </div>
  </div>

  <div class="emp-name-bar">
    <div class="name">${employeeName}</div>
    <div class="sub">${esc(jobTitle)}${department && department !== '—' ? ' &nbsp;·&nbsp; ' + esc(department) : ''}</div>
  </div>

  <table class="emp-table"><tbody>${empRows}</tbody></table>

  <table class="ed-table">
    <thead>
      <tr>
        <th>Earning</th><th class="r">Amount (₹)</th>
        <th style="border-left:1px solid rgba(255,255,255,0.3)">Deduction</th><th class="r">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${eRows}
      <tr class="total-row">
        <td>Total Earnings</td><td class="r earn">${fmtFull(totalEarnings)}</td>
        <td class="mid">Total Deductions</td><td class="r ded">${fmtFull(totalDeductions)}</td>
      </tr>
    </tbody>
  </table>

  <div class="net-box">
    <div>
      <div class="net-label">Total Net Payable</div>
      <div class="net-sub">Gross Earnings − Total Deductions</div>
    </div>
    <div class="net-amt">₹${Math.round(netPay).toLocaleString("en-IN")}/-</div>
  </div>
  <div class="words-bar">Amount in Words: ${numberToWords(netPay)}</div>

  <div class="footer">
    <div class="gen-date">Generated on ${genDate}</div>
    <div class="statutory">This is a computer-generated payslip and does not require a physical signature.<br>
      Valid under the Information Technology Act, 2000 and the Payment of Wages Act, 1936.</div>
  </div>

</body></html>`;
  };

  const openPrintWindow = () => {
    const html = buildHTML();
    const win = window.open("", "_blank", "width=750,height=950");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
    win.onafterprint = () => win.close();
    const poll = setInterval(() => { if (win.closed) { clearInterval(poll); window.focus(); } }, 500);
  };

  const handleDownload = async () => {
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-10000px;top:0;width:700px;background:#ffffff;z-index:-1;";
    document.body.appendChild(container);

    const shadow = container.attachShadow({ mode: "open" });
    const parser = new DOMParser();
    const parsed = parser.parseFromString(buildHTML(), "text/html");
    const style = parsed.querySelector("style");
    if (style) shadow.appendChild(style.cloneNode(true));
    const bodyContent = document.createElement("div");
    bodyContent.innerHTML = parsed.body.innerHTML;
    shadow.appendChild(bodyContent);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [10, 16, 20, 16],
          filename: `PaySlip_${employeeName.replace(/\s+/g, "_")}_${record.pay_period}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", width: 700, windowWidth: 700, scrollX: 0, scrollY: 0 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(bodyContent)
        .save();
    } catch (err) {
      console.error("PDF generation failed, falling back to print:", err);
      openPrintWindow();
    } finally {
      if (container.parentNode) document.body.removeChild(container);
    }
  };

  // ── In-dialog React preview ───────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-morphism">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-gradient-primary text-xl">Pay Slip</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openPrintWindow}>
              <Printer className="h-4 w-4 mr-1" />Print
            </Button>
            <Button size="sm" onClick={handleDownload} className="bg-gradient-financial text-white hover:opacity-90">
              <Download className="h-4 w-4 mr-1" />Download PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Header */}
          <div className="rounded-md overflow-hidden">
            <div className="flex justify-between items-start p-4" style={{ background: brandColor }}>
              <div>
                <p className="text-base font-extrabold tracking-wider uppercase text-white">{companyName}</p>
                {companyAddress && <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.82)" }}>{companyAddress}</p>}
              </div>
              <div className="text-right">
                <p className="text-base font-bold tracking-widest uppercase text-white">Pay Slip</p>
                <p className="text-xs italic mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>{period}</p>
              </div>
            </div>
          </div>

          {/* Employee name bar */}
          <div className="px-3 py-2 rounded-sm border-l-4" style={{ background: tintMed, borderLeftColor: brandColor }}>
            <p className="font-bold text-sm" style={{ color: brandColor }}>{employeeName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {jobTitle}{department && department !== "—" ? ` · ${department}` : ""}
            </p>
          </div>

          {/* Employee details grid */}
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {empFields.map(([l1, v1, l2, v2], i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 font-semibold uppercase tracking-wide text-muted-foreground w-[18%]" style={{ background: tintBg }}>{l1}</td>
                    <td className="px-3 py-1.5 w-[32%]">{v1}</td>
                    <td className="px-3 py-1.5 font-semibold uppercase tracking-wide text-muted-foreground w-[18%] border-l border-border" style={{ background: tintBg }}>{l2}</td>
                    <td className="px-3 py-1.5">{v2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Earnings & Deductions */}
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: brandColor }}>
                  <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-white">Earning</th>
                  <th className="text-right px-3 py-2 font-bold uppercase tracking-wide text-white">Amount (₹)</th>
                  <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-white border-l border-white/20">Deduction</th>
                  <th className="text-right px-3 py-2 font-bold uppercase tracking-wide text-white">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {padE.map((e, i) => {
                  const d = padD[i];
                  return (
                    <tr key={i} className="border-b border-border/40 last:border-0"
                        style={{ background: i % 2 === 0 ? "#fff" : tintBg }}>
                      <td className="px-3 py-1.5">{e ? e.label : ""}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{e && e.amount > 0 ? fmt(e.amount) : e ? "--" : ""}</td>
                      <td className="px-3 py-1.5 border-l border-border">{d ? d.label : ""}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{d && d.amount > 0 ? fmt(d.amount) : d ? "--" : ""}</td>
                    </tr>
                  );
                })}
                <tr className="font-bold" style={{ background: tintBg, borderTop: `2px solid ${brandColor}` }}>
                  <td className="px-3 py-2">Total Earnings</td>
                  <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(totalEarnings)}</td>
                  <td className="px-3 py-2 border-l border-border">Total Deductions</td>
                  <td className="px-3 py-2 text-right text-destructive tabular-nums">{fmt(totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Pay */}
          <div className="rounded overflow-hidden">
            <div className="flex justify-between items-center px-5 py-3" style={{ background: brandColor }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/90">Total Net Payable</p>
                <p className="text-xs italic mt-0.5 text-white/70">Gross Earnings − Total Deductions</p>
              </div>
              <span className="text-2xl font-extrabold text-white tracking-tight">
                ₹{Math.round(netPay).toLocaleString("en-IN")}/-
              </span>
            </div>
            <div className="text-center text-xs font-semibold py-2 border border-t-0 border-border" style={{ background: tintBg }}>
              Amount in Words: {numberToWords(netPay)}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-start pt-2" style={{ borderTop: `2px solid ${brandColor}` }}>
            <p className="text-xs text-muted-foreground">Generated on {genDate}</p>
            <p className="text-xs text-muted-foreground italic text-right max-w-xs leading-relaxed">
              This is a computer-generated payslip and does not require a physical signature.<br />
              Valid under the Information Technology Act, 2000 and the Payment of Wages Act, 1936.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
