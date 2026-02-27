import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Printer } from "lucide-react";
import DOMPurify from "dompurify";
import type { PayrollRecord } from "@/hooks/usePayroll";
import grx10Logo from "@/assets/grx10-logo.webp";

const fmt = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString("en-IN")}`;
};

const fmtFull = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  if (!record) return null;

  const lopDays = Number((record as any).lop_days) || 0;
  const lopDeduction = Number((record as any).lop_deduction) || 0;
  const workingDays = Number((record as any).working_days) || 0;
  const paidDays = Number((record as any).paid_days) || 0;

  const earnings = [
    { label: "Basic Salary", amount: Number(record.basic_salary) },
    { label: "House Rent Allowance (HRA)", amount: Number(record.hra) },
    { label: "Transport Allowance", amount: Number(record.transport_allowance) },
    { label: "Other Allowances", amount: Number(record.other_allowances) },
  ];
  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);

  const deductions = [
    { label: "Provident Fund (PF)", amount: Number(record.pf_deduction) },
    { label: "Tax Deduction (TDS)", amount: Number(record.tax_deduction) },
    { label: "Other Deductions", amount: Number(record.other_deductions) },
    ...(lopDeduction > 0 ? [{ label: `Loss of Pay (${lopDays} days)`, amount: lopDeduction }] : []),
  ];
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPay = Number(record.net_pay);

  const employeeName = DOMPurify.sanitize(record.profiles?.full_name || "Employee");
  const department = DOMPurify.sanitize(record.profiles?.department || "—");
  const jobTitle = DOMPurify.sanitize(record.profiles?.job_title || "—");
  const period = periodLabel(record.pay_period);
  const processedDate = record.processed_at
    ? new Date(record.processed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const buildHTML = () => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pay Slip — ${employeeName} — ${period}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #111827; background: #fff; padding: 48px; max-width: 740px; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 18px; border-bottom: 3px solid #e11d74; margin-bottom: 28px; }
    .hdr-left { display: flex; align-items: center; gap: 14px; }
    .hdr-logo { height: 44px; width: auto; }
    .hdr-left .co { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #e11d74; margin-bottom: 4px; }
    .hdr-left .doc { font-size: 22px; font-weight: 700; color: #111827; }
    .hdr-left .per { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .status { font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
    .s-processed { background: #dcfce7; color: #166534; }
    .s-draft { background: #f3f4f6; color: #6b7280; }
    .s-pending { background: #fef9c3; color: #854d0e; }
    .emp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; margin-bottom: 28px; padding: 18px 20px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
    .emp-field label { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 3px; }
    .emp-field span { font-size: 14px; font-weight: 500; color: #111827; }
    .tables { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .tbl-section h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 7px 0; font-size: 13px; }
    td.r { text-align: right; font-weight: 500; }
    td.nil { color: #d1d5db; }
    .sub td { padding-top: 10px; font-weight: 700; font-size: 13px; border-top: 2px solid #d1d5db; }
    .earn { color: #16a34a; }
    .deduct { color: #dc2626; }
    .net { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; background: linear-gradient(135deg, #fdf2f8, #fce7f3); border: 1px solid #f9a8d4; border-radius: 10px; margin-bottom: 28px; }
    .net .lbl { font-size: 16px; font-weight: 600; }
    .net .sub-lbl { font-size: 11px; color: #9ca3af; margin-top: 2px; }
    .net .val { font-size: 26px; font-weight: 800; color: #e11d74; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer .proc { font-size: 11px; color: #6b7280; }
    .footer .sig { font-size: 11px; color: #9ca3af; text-align: right; }
    .footer .sig span { display: block; width: 140px; border-top: 1px solid #d1d5db; padding-top: 4px; margin-top: 28px; }
    .wm { text-align: center; margin-top: 20px; font-size: 10px; color: #d1d5db; }
    @media print { body { padding: 28px; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <img src="${new URL(grx10Logo, window.location.origin).href}" alt="GRX10 Logo" class="hdr-logo" />
      <div>
      <div class="co">GRX10 Business Suite</div>
      <div class="doc">Pay Slip</div>
      <div class="per">${period}</div>
      </div>
    </div>
    <span class="status s-${record.status}">${record.status.charAt(0).toUpperCase() + record.status.slice(1)}</span>
  </div>

   <div class="emp-grid">
    <div class="emp-field"><label>Employee Name</label><span>${employeeName}</span></div>
    <div class="emp-field"><label>Department</label><span>${department}</span></div>
    <div class="emp-field"><label>Designation</label><span>${jobTitle}</span></div>
    <div class="emp-field"><label>Pay Period</label><span>${period}</span></div>
    ${workingDays > 0 ? `<div class="emp-field"><label>Working Days</label><span>${workingDays}</span></div>` : ""}
    ${paidDays > 0 ? `<div class="emp-field"><label>Paid Days</label><span>${paidDays}${lopDays > 0 ? ` (LOP: ${lopDays})` : ""}</span></div>` : ""}
  </div>

  <div class="tables">
    <div class="tbl-section">
      <h3>Earnings</h3>
      <table><tbody>
        ${earnings.map(e => `<tr><td>${e.label}</td><td class="r${e.amount === 0 ? ' nil' : ''}">${e.amount === 0 ? '—' : fmtFull(e.amount)}</td></tr>`).join("")}
        <tr class="sub"><td>Total Earnings</td><td class="r earn">${fmtFull(totalEarnings)}</td></tr>
      </tbody></table>
    </div>
    <div class="tbl-section">
      <h3>Deductions</h3>
      <table><tbody>
        ${deductions.map(d => `<tr><td>${d.label}</td><td class="r${d.amount === 0 ? ' nil' : ''}">${d.amount === 0 ? '—' : fmtFull(d.amount)}</td></tr>`).join("")}
        <tr class="sub"><td>Total Deductions</td><td class="r deduct">${fmtFull(totalDeductions)}</td></tr>
      </tbody></table>
    </div>
  </div>

  <div class="net">
    <div><div class="lbl">Net Pay</div><div class="sub-lbl">Total Earnings − Total Deductions</div></div>
    <div class="val">${fmtFull(netPay)}</div>
  </div>

  <div class="footer">
    <div class="proc">${processedDate ? `Processed on: <strong>${processedDate}</strong>` : '<em>Not yet processed</em>'}</div>
    <div class="sig"><span>Authorised Signatory</span></div>
  </div>
  <div class="wm">System-generated pay slip. No signature required if digitally authorised. &bull; GRX10 ERP</div>
</body>
</html>`;

  const openPrintWindow = () => {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    win.document.write(buildHTML());
    win.document.close();
    // Wait for content to render, then trigger print
    win.onload = () => {
      setTimeout(() => {
        win.print();
      }, 300);
    };
    // Auto-close popup after print dialog is dismissed
    win.onafterprint = () => win.close();
    // Fallback: poll for window closure to restore focus
    const poll = setInterval(() => {
      if (win.closed) {
        clearInterval(poll);
        window.focus();
      }
    }, 500);
  };

  const handleDownload = async () => {
    const html = buildHTML();
    // Create a temporary container to render the payslip
    const container = document.createElement("div");
    container.innerHTML = html;
    // Extract just the body content and styles
    const styleContent = container.querySelector("style")?.outerHTML || "";
    const bodyContent = container.querySelector("body")?.innerHTML || html;
    
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "0";
    wrapper.style.width = "740px";
    wrapper.style.background = "white";
    wrapper.style.padding = "48px";
    wrapper.style.fontFamily = "'Segoe UI', system-ui, -apple-system, sans-serif";
    wrapper.style.color = "#111827";
    wrapper.innerHTML = `<style>${styleContent.replace(/<\/?style>/g, "")}</style>${bodyContent}`;
    document.body.appendChild(wrapper);

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 0,
          filename: `PaySlip_${employeeName.replace(/\s+/g, "_")}_${record.pay_period}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(wrapper)
        .save();
    } catch (err) {
      console.error("PDF generation failed, falling back to print:", err);
      // Fallback to print dialog
      const win = window.open("", "_blank", "width=800,height=900");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.onload = () => setTimeout(() => win.print(), 300);
      win.onafterprint = () => win.close();
    } finally {
      document.body.removeChild(wrapper);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl glass-morphism">
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

        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <img src={grx10Logo} alt="GRX10 Logo" className="h-10 w-auto" />
              <div>
              <p className="text-xs font-bold tracking-widest text-primary uppercase mb-1">GRX10 Business Suite</p>
              <h2 className="text-xl font-bold">Pay Slip</h2>
              <p className="text-sm text-muted-foreground">{period}</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                record.status === "processed"
                  ? "bg-green-500/10 text-green-600 border-green-500/30"
                  : record.status === "pending"
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  : "bg-muted text-muted-foreground"
              }
            >
              {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
            </Badge>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 rounded-lg p-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Employee Name</p>
              <p className="font-medium">{record.profiles?.full_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Department</p>
              <p className="font-medium">{record.profiles?.department || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Designation</p>
              <p className="font-medium">{record.profiles?.job_title || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pay Period</p>
              <p className="font-medium">{period}</p>
            </div>
            {workingDays > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Working Days</p>
                <p className="font-medium">{workingDays}</p>
              </div>
            )}
            {paidDays > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Paid Days</p>
                <p className="font-medium">
                  {paidDays}
                  {lopDays > 0 && <span className="text-amber-600 ml-1">(LOP: {lopDays})</span>}
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Earnings</h3>
              <table className="w-full">
                <tbody>
                  {earnings.filter(e => e.amount > 0).map((e) => (
                    <tr key={e.label}>
                      <td className="py-1.5 text-sm">{e.label}</td>
                      <td className="py-1.5 text-sm text-right font-medium">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-foreground/20">
                    <td className="pt-2 text-sm font-bold">Total Earnings</td>
                    <td className="pt-2 text-sm text-right font-bold text-green-600">{fmt(totalEarnings)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deductions</h3>
              <table className="w-full">
                <tbody>
                  {deductions.filter(d => d.amount > 0).map((d) => (
                    <tr key={d.label}>
                      <td className="py-1.5 text-sm">{d.label}</td>
                      <td className="py-1.5 text-sm text-right font-medium">{fmt(d.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-foreground/20">
                    <td className="pt-2 text-sm font-bold">Total Deductions</td>
                    <td className="pt-2 text-sm text-right font-bold text-destructive">{fmt(totalDeductions)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Pay */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-5 flex justify-between items-center">
            <div>
              <p className="text-lg font-semibold">Net Pay</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Earnings − Total Deductions</p>
            </div>
            <span className="text-2xl font-bold text-gradient-primary">{fmt(netPay)}</span>
          </div>

          {processedDate && (
            <p className="text-xs text-muted-foreground text-center">
              Processed on {processedDate}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
