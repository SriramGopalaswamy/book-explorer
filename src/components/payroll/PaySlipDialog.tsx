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

/** Fetch brand color from organization_compliance for current user */
function useBrandingInfo(userId: string | undefined) {
  const [color, setColor] = useState("#e11d74");
  const [signatoryName, setSignatoryName] = useState("");
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
      if (!profile?.organization_id) return;
      const { data } = await supabase.from("organization_compliance" as any).select("brand_color, authorized_signatory_name").eq("organization_id", profile.organization_id).maybeSingle();
      if ((data as any)?.brand_color) setColor((data as any).brand_color);
      if ((data as any)?.authorized_signatory_name) setSignatoryName((data as any).authorized_signatory_name);
    })();
  }, [userId]);
  return { color, signatoryName };
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
  const logoDataUrl = useLogoDataUrl(grx10Logo);
  const { user } = useAuth();
  const { color: brandColor, signatoryName } = useBrandingInfo(user?.id);
  // Fetch employee_details using the proven hook — runs only when profile_id is present,
  // does not affect the payroll list query at all.  Must be called before any early returns.
  const { data: employeeDetails } = useEmployeeDetails(record?.profile_id ?? null);
  if (!record) return null;

  const slip = normalizePayslip(record);
  const { earnings, deductions, totalEarnings, totalDeductions, netPay, lopDays, workingDays, paidDays } = slip;

  const r = record as any; // engine entries may carry extra fields from older payroll rows
  const ed = employeeDetails; // from employee_details table via useEmployeeDetails hook
  const employeeName = DOMPurify.sanitize(record.profiles?.full_name || "Employee");
  const jobTitle = DOMPurify.sanitize(record.profiles?.job_title || "—");
  // profiles.employee_id (EMP001 style); fall back to employee_details.employee_id_number
  const employeeId = DOMPurify.sanitize(record.profiles?.employee_id || ed?.employee_id_number || r.employee_id || "—");
  const panNumber = DOMPurify.sanitize(ed?.pan_number || r.pan_number || "—");
  const bankName = DOMPurify.sanitize(ed?.bank_name || r.bank_name || "—");
  const uanNumber = DOMPurify.sanitize(ed?.uan_number || r.uan_number || "—");
  const pfAccountNo = DOMPurify.sanitize(r.pf_account_number || "—");
  const gender = DOMPurify.sanitize(ed?.gender || r.gender || "—");
  const location = DOMPurify.sanitize(r.profiles?.location || r.location || "—");
  // join_date from profile (YYYY-MM-DD) formatted to DD-MMM-YYYY
  const rawJoinDate = record.profiles?.join_date || r.date_of_joining || "";
  const dateOfJoining = rawJoinDate
    ? DOMPurify.sanitize(new Date(rawJoinDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))
    : "—";
  const period = periodLabel(record.pay_period);
  const processedDate = record.processed_at
    ? new Date(record.processed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const logoSrc = logoDataUrl || new URL(grx10Logo, window.location.origin).href;

  // Pad earnings/deductions to equal rows for side-by-side table
  const maxRows = Math.max(earnings.length, deductions.length);
  const paddedEarnings = [...earnings, ...Array(maxRows - earnings.length).fill(null)];
  const paddedDeductions = [...deductions, ...Array(maxRows - deductions.length).fill(null)];

  const buildHTML = () => {
    const bc = brandColor;
    const esc = (v: unknown) => DOMPurify.sanitize(String(v ?? ""));
    const eRows = paddedEarnings.map((e, i) => {
      const d = paddedDeductions[i];
      return `<tr>
        <td class="cell">${e ? esc(e.label) : ''}</td>
        <td class="cell r">${e && e.amount > 0 ? fmtFull(e.amount) : e ? '--' : ''}</td>
        <td class="cell">${d ? esc(d.label) : ''}</td>
        <td class="cell r">${d && d.amount > 0 ? fmtFull(d.amount) : d ? '--' : ''}</td>
      </tr>`;
    }).join("");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pay Slip — ${employeeName} — ${period}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; background: #fff; width: 700px; max-width: 700px; margin: 0 auto; padding: 30px 36px; }
  .company-header { display: flex; align-items: center; gap: 18px; margin-bottom: 6px; padding-bottom: 10px; }
  .company-logo { height: 72px; width: auto; }
  .company-info { flex: 1; }
  .company-name { font-size: 22px; font-weight: 800; color: #1a1a1a; text-transform: uppercase; letter-spacing: 1px; }
  .company-address { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.5; }
  .payslip-title { text-align: center; font-size: 22px; font-weight: 600; color: #333; font-style: italic; margin: 8px 0 16px; }

  /* Employee Summary */
  .emp-section { border: 1px solid #ccc; margin-bottom: 16px; }
  .emp-header { background: ${bc}; color: #fff; text-align: center; font-size: 13px; font-weight: 700; padding: 6px; text-transform: uppercase; letter-spacing: 1px; }
  .emp-name { font-size: 15px; font-weight: 700; color: ${bc}; padding: 8px 12px; border-bottom: 1px solid #ddd; }
  .emp-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; }
  .emp-grid .eg-label { font-size: 11px; font-weight: 600; color: #333; padding: 5px 12px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; background: #fafafa; }
  .emp-grid .eg-value { font-size: 11px; color: #555; padding: 5px 12px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; }
  .emp-grid .eg-value:nth-child(4n) { border-right: none; }
  .emp-grid .eg-label:nth-child(4n) { border-right: none; }

  /* Earnings & Deductions */
  .ed-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #ccc; }
  .ed-table .ed-header th { background: ${bc}; color: #fff; font-size: 12px; font-weight: 700; padding: 6px 12px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; border: 1px solid ${bc}; }
  .ed-table .ed-header th.r { text-align: right; }
  .cell { padding: 5px 12px; font-size: 12px; border-bottom: 1px solid #eee; }
  .cell.r { text-align: right; font-weight: 500; }
  .total-row td { border-top: 2px solid #999; font-weight: 700; font-size: 12px; padding: 7px 12px; }
  .netpay-row td { font-weight: 700; font-size: 12px; padding: 7px 12px; border-top: 1px solid #ccc; }

  /* Net Pay Box */
  .net-box { border: 2px solid #333; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .net-box .label-side { }
  .net-box .label-side .title { font-size: 14px; font-weight: 800; text-transform: uppercase; }
  .net-box .label-side .sub { font-size: 11px; color: #888; font-style: italic; }
  .net-box .amount { font-size: 24px; font-weight: 800; color: ${bc}; }
  .words-row { text-align: center; font-size: 12px; font-weight: 600; padding: 8px; border: 1px solid #ccc; border-top: none; background: #fafafa; margin-bottom: 20px; }

  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
  .footer .sig { text-align: right; }
  .footer .sig .line { display: block; width: 140px; border-top: 1px solid #bbb; padding-top: 4px; margin-top: 30px; }
  @media print { body { padding: 20px; } }
</style></head><body>

  <div class="company-header">
    <img src="${logoSrc}" alt="Logo" class="company-logo" />
    <div class="company-info">
      <div class="company-name">GRX10 Solutions Pvt Ltd</div>
      <div class="company-address">MKB Tower, 3rd floor, 2nd Cross Road, Appareddy Palya Rd, HAL 2nd Stage,<br/>Indiranagar, Bengaluru, Karnataka 560009</div>
    </div>
  </div>
  <div class="payslip-title">Pay Slip</div>

  <div class="emp-section">
    <div class="emp-header">Employee Summary</div>
    <div class="emp-name">${employeeName}</div>
    <div class="emp-grid">
      <div class="eg-label">Employee ID</div>
      <div class="eg-value">${employeeId}</div>
      <div class="eg-label">Location</div>
      <div class="eg-value">${location}</div>

      <div class="eg-label">Designation</div>
      <div class="eg-value">${jobTitle}</div>
      <div class="eg-label">PAN No</div>
      <div class="eg-value">${panNumber}</div>

      <div class="eg-label">Gender</div>
      <div class="eg-value">${gender}</div>
      <div class="eg-label">Bank Name</div>
      <div class="eg-value">${bankName}</div>

      <div class="eg-label">Date of Joining</div>
      <div class="eg-value">${dateOfJoining}</div>
      <div class="eg-label">Working Days</div>
      <div class="eg-value">${workingDays || '—'}</div>

      <div class="eg-label">PF A/C No</div>
      <div class="eg-value">${pfAccountNo}</div>
      <div class="eg-label">Paid Days</div>
      <div class="eg-value">${paidDays || '—'}</div>

      <div class="eg-label">UAN</div>
      <div class="eg-value">${uanNumber}</div>
      <div class="eg-label">LOP</div>
      <div class="eg-value">${lopDays || '0'}</div>
    </div>
  </div>

  <table class="ed-table">
    <tr class="ed-header">
      <th>Earning</th>
      <th class="r">Amount</th>
      <th>Deduction</th>
      <th class="r">Amount</th>
    </tr>
    ${eRows}
    <tr class="total-row">
      <td>Total Earnings</td>
      <td class="r" style="color:#16a34a">${fmtFull(totalEarnings)}</td>
      <td>Total Deductions</td>
      <td class="r" style="color:#dc2626">${fmtFull(totalDeductions)}</td>
    </tr>
    <tr class="netpay-row">
      <td colspan="2"></td>
      <td><strong>Net Pay</strong></td>
      <td class="r" style="font-size:13px">${fmtFull(netPay)}</td>
    </tr>
  </table>

  <div class="net-box">
    <div class="label-side">
      <div class="title">Total Net Payable</div>
      <div class="sub">Gross Earnings - Total Deduction</div>
    </div>
    <div class="amount">Rs : ${Math.round(netPay).toLocaleString("en-IN")}/-</div>
  </div>
  <div class="words-row">Amount in Words : ${numberToWords(netPay)}</div>

   <div class="footer">
    <div>${processedDate ? `Processed on: ${processedDate}` : 'Not yet processed'}</div>
    <div class="sig">${signatoryName ? `<span style="font-weight:600;font-size:11px;display:block;margin-bottom:2px">${DOMPurify.sanitize(signatoryName)}</span>` : ''}<span class="line">Authorised Signatory</span></div>
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
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.width = "700px";
    container.style.background = "#ffffff";
    container.style.zIndex = "-1";
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
      await new Promise<void>((resolve) => {
        const img = shadow.querySelector("img") as HTMLImageElement | null;
        if (img && !img.complete) {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 2000);
        } else {
          setTimeout(resolve, 400);
        }
      });

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

  // In-dialog preview mirrors the PDF layout
  const maxRowsUI = Math.max(earnings.length, deductions.length);
  const padE = [...earnings, ...Array(maxRowsUI - earnings.length).fill(null)];
  const padD = [...deductions, ...Array(maxRowsUI - deductions.length).fill(null)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-morphism">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-gradient-primary text-xl">Pay Slip</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openPrintWindow}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button size="sm" onClick={handleDownload} className="bg-gradient-financial text-white hover:opacity-90">
              <Download className="h-4 w-4 mr-1" />
              Download PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company Header */}
          <div className="flex items-center gap-4">
            <img src={grx10Logo} alt="GRX10 Logo" className="h-16 w-auto" />
            <div>
              <p className="text-lg font-extrabold tracking-wide uppercase">GRX10 Solutions Pvt Ltd</p>
              <p className="text-xs text-muted-foreground leading-relaxed">MKB Tower, 3rd floor, 2nd Cross Road, Appareddy Palya Rd, HAL 2nd Stage,<br/>Indiranagar, Bengaluru, Karnataka 560009</p>
            </div>
          </div>
          <p className="text-center text-xl font-semibold italic text-foreground/80">Pay Slip</p>

          {/* Employee Summary */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-primary text-primary-foreground text-center text-sm font-bold py-1.5 uppercase tracking-wider">
              Employee Summary
            </div>
            <div className="px-3 py-2 border-b border-border">
              <span className="text-base font-bold text-primary">{employeeName}</span>
            </div>
            <div className="grid grid-cols-4 text-xs">
              {[
                ["Employee ID", employeeId,              "Location",    location],
                ["Designation", jobTitle,                "PAN No",      panNumber],
                ["Gender",      gender,                  "Bank Name",   bankName],
                ["Date of Joining", dateOfJoining,       "Working Days", String(workingDays || "—")],
                ["PF A/C No",   pfAccountNo,             "Paid Days",   String(paidDays || "—")],
                ["UAN",         uanNumber,               "LOP",         String(lopDays || "0")],
              ].map((row, i) => (
                <React.Fragment key={i}>
                  <div className="px-3 py-1.5 border-b border-r border-border bg-muted/30 font-semibold">{row[0]}</div>
                  <div className="px-3 py-1.5 border-b border-r border-border">{row[1]}</div>
                  <div className="px-3 py-1.5 border-b border-r border-border bg-muted/30 font-semibold">{row[2]}</div>
                  <div className="px-3 py-1.5 border-b border-border">{row[3]}</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Earnings & Deductions Table */}
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide">Earning</th>
                  <th className="text-right px-3 py-1.5 font-bold uppercase tracking-wide">Amount</th>
                  <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide">Deduction</th>
                  <th className="text-right px-3 py-1.5 font-bold uppercase tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody>
                {padE.map((e, i) => {
                  const d = padD[i];
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-1.5">{e ? e.label : ""}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{e && e.amount > 0 ? fmt(e.amount) : e ? "--" : ""}</td>
                      <td className="px-3 py-1.5">{d ? d.label : ""}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{d && d.amount > 0 ? fmt(d.amount) : d ? "--" : ""}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-foreground/30 font-bold">
                  <td className="px-3 py-2">Total Earnings</td>
                  <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{fmt(totalEarnings)}</td>
                  <td className="px-3 py-2">Total Deductions</td>
                  <td className="px-3 py-2 text-right text-destructive">{fmt(totalDeductions)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={2}></td>
                  <td className="px-3 py-2 font-bold">Net Pay</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(netPay)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Payable Box */}
          <div className="border-2 border-foreground/60 rounded p-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-extrabold uppercase">Total Net Payable</p>
              <p className="text-xs text-muted-foreground italic">Gross Earnings - Total Deduction</p>
            </div>
            <span className="text-2xl font-extrabold text-primary">Rs : {Math.round(netPay).toLocaleString("en-IN")}/-</span>
          </div>
          <div className="text-center text-xs font-semibold border border-border rounded py-2 bg-muted/20">
            Amount in Words : {numberToWords(netPay)}
          </div>

          {processedDate && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Processed on {processedDate}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Need React import for React.Fragment usage in JSX
import React from "react";
