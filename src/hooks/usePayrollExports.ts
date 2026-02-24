import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PayrollEntry } from "@/hooks/usePayrollEngine";

/**
 * PF ECR Export — generates EPFO-compliant CSV from locked payroll entries.
 */
export function exportPFECR(entries: PayrollEntry[]) {
  const headers = [
    "UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages",
    "EDLI Wages", "EPF Contribution (EE)", "EPS Contribution (ER)",
    "EPF Contribution (ER)", "EDLI Contribution", "NCP Days", "Refund of Advances",
  ];

  const rows = entries.map((e) => {
    const grossWages = e.gross_earnings;
    const basicMonthly = (e.earnings_breakdown as any[])?.find(
      (c: any) => c.name?.toLowerCase().includes("basic")
    )?.monthly ?? Math.round(grossWages * 0.4);
    const epfWages = Math.min(basicMonthly, 15000);
    const epsWages = Math.min(epfWages, 15000);
    const pfEE = e.pf_employee ?? Math.round(epfWages * 0.12);
    const epsER = Math.round(epsWages * 0.0833);
    const epfER = Math.round(epfWages * 0.0367);
    const edli = Math.round(epsWages * 0.005);

    return [
      "", // UAN - not stored
      e.profiles?.full_name || "",
      grossWages,
      epfWages,
      epsWages,
      epsWages,
      pfEE,
      epsER,
      epfER,
      edli,
      e.lwp_days,
      0,
    ];
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCSV(csv, "PF_ECR_Export.csv");
}

/**
 * Bank Transfer File — generates NEFT-format CSV from locked payroll entries.
 */
export function exportBankTransferFile(
  entries: PayrollEntry[],
  format: string = "generic_neft"
) {
  const headers = [
    "Beneficiary Name", "Account Number", "IFSC Code", "Amount", "Remarks",
  ];

  const rows = entries.map((e) => [
    e.profiles?.full_name || "",
    "", // Account number from employee_details
    "", // IFSC from employee_details
    e.net_pay,
    `Salary ${e.payroll_run_id?.slice(0, 8) || ""}`,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCSV(csv, `Bank_Transfer_${format}.csv`);
}

/**
 * Payroll Master CSV — comprehensive export.
 */
export function exportPayrollMasterCSV(entries: PayrollEntry[], payPeriod: string) {
  const headers = [
    "Employee Name", "Department", "Job Title", "Annual CTC",
    "Gross Earnings", "PF (Employee)", "PF (Employer)", "TDS",
    "ESI (Employee)", "Total Deductions", "LWP Days", "Working Days",
    "Paid Days", "Net Pay",
  ];

  const rows = entries.map((e) => [
    e.profiles?.full_name || "",
    e.profiles?.department || "",
    e.profiles?.job_title || "",
    e.annual_ctc,
    e.gross_earnings,
    e.pf_employee ?? 0,
    e.pf_employer ?? 0,
    e.tds_amount ?? 0,
    e.esi_employee ?? 0,
    e.total_deductions,
    e.lwp_days,
    e.working_days,
    e.paid_days,
    e.net_pay,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadCSV(csv, `Payroll_Master_${payPeriod}.csv`);
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
