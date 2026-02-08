import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Printer } from "lucide-react";
import type { PayrollRecord } from "@/hooks/usePayroll";

const formatCurrency = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString("en-IN")}`;
};

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
  ];
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  const handlePrint = () => {
    const printContent = document.getElementById("payslip-content");
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Pay Slip - ${record.profiles?.full_name}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; color: #1a1a1a; max-width: 700px; margin: 0 auto; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        h2 { font-size: 18px; color: #555; margin-bottom: 24px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #e11d74; padding-bottom: 16px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .info-item label { font-size: 12px; color: #888; display: block; }
        .info-item span { font-size: 14px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        th { font-weight: 600; color: #555; font-size: 12px; text-transform: uppercase; }
        .amount { text-align: right; }
        .total-row { font-weight: 700; border-top: 2px solid #333; }
        .net-pay { background: #f8f8f8; padding: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 24px; }
        .net-pay .label { font-size: 16px; font-weight: 600; }
        .net-pay .value { font-size: 24px; font-weight: 700; color: #e11d74; }
        .footer { margin-top: 40px; font-size: 12px; color: #aaa; text-align: center; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${printContent.innerHTML}
      <div class="footer">This is a system-generated pay slip. No signature required.</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl glass-morphism">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-gradient-primary text-xl">Pay Slip</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          </div>
        </DialogHeader>

        <div id="payslip-content" className="space-y-6">
          {/* Header */}
          <div className="header flex justify-between items-start">
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700 }}>GRX10 Business Suite</h1>
              <h2 style={{ fontSize: 14, color: "#888" }}>Pay Slip for {periodLabel(record.pay_period)}</h2>
            </div>
            <Badge
              variant="outline"
              className={
                record.status === "processed"
                  ? "bg-green-500/10 text-green-600 border-green-500/30"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/30"
              }
            >
              {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
            </Badge>
          </div>

          {/* Employee Info */}
          <div className="info-grid grid grid-cols-2 gap-4 text-sm">
            <div className="info-item">
              <label className="text-xs text-muted-foreground">Employee Name</label>
              <span className="font-medium">{record.profiles?.full_name || "—"}</span>
            </div>
            <div className="info-item">
              <label className="text-xs text-muted-foreground">Department</label>
              <span className="font-medium">{record.profiles?.department || "—"}</span>
            </div>
            <div className="info-item">
              <label className="text-xs text-muted-foreground">Designation</label>
              <span className="font-medium">{record.profiles?.job_title || "—"}</span>
            </div>
            <div className="info-item">
              <label className="text-xs text-muted-foreground">Pay Period</label>
              <span className="font-medium">{periodLabel(record.pay_period)}</span>
            </div>
          </div>

          <Separator />

          {/* Earnings & Deductions side by side */}
          <div className="grid grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Earnings</h3>
              <table>
                <tbody>
                  {earnings.filter(e => e.amount > 0).map((e) => (
                    <tr key={e.label}>
                      <td className="py-2 text-sm">{e.label}</td>
                      <td className="py-2 text-sm text-right font-medium amount">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="total-row border-t-2 border-foreground/20">
                    <td className="py-2 text-sm font-bold">Total Earnings</td>
                    <td className="py-2 text-sm text-right font-bold text-green-600 amount">{formatCurrency(totalEarnings)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deductions</h3>
              <table>
                <tbody>
                  {deductions.filter(d => d.amount > 0).map((d) => (
                    <tr key={d.label}>
                      <td className="py-2 text-sm">{d.label}</td>
                      <td className="py-2 text-sm text-right font-medium amount">{formatCurrency(d.amount)}</td>
                    </tr>
                  ))}
                  <tr className="total-row border-t-2 border-foreground/20">
                    <td className="py-2 text-sm font-bold">Total Deductions</td>
                    <td className="py-2 text-sm text-right font-bold text-destructive amount">{formatCurrency(totalDeductions)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Pay */}
          <div className="net-pay rounded-xl bg-primary/5 border border-primary/20 p-5 flex justify-between items-center">
            <span className="label text-lg font-semibold">Net Pay</span>
            <span className="value text-2xl font-bold text-gradient-primary">{formatCurrency(Number(record.net_pay))}</span>
          </div>

          {record.processed_at && (
            <p className="text-xs text-muted-foreground text-center">
              Processed on {new Date(record.processed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
