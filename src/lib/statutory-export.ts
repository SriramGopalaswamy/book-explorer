import * as XLSX from "xlsx";

type ExportFormat = "xlsx" | "csv";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = "Sheet1", format: ExportFormat = "xlsx") {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, filename.replace(/\.xlsx$/, ".csv"));
  } else {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    downloadBlob(blob, filename);
  }
}

export function exportMultiSheet(sheets: { name: string; data: Record<string, unknown>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, filename);
}

// ── GSTR-1 Export ──
export function exportGSTR1(rows: any[], period: string) {
  const b2b = rows.filter((r) => r.invoice_type === "B2B").map((r) => ({
    "GSTIN of Recipient": r.customer_gstin,
    "Receiver Name": r.customer_name,
    "Invoice Number": r.invoice_number,
    "Invoice Date": r.invoice_date,
    "Invoice Value": r.total_amount,
    "Place of Supply": r.place_of_supply,
    "HSN/SAC": r.hsn_sac,
    "Description": r.description,
    "Quantity": r.quantity,
    "Rate": r.rate,
    "Taxable Value": r.taxable_value,
    "CGST Rate (%)": r.cgst_rate,
    "CGST Amount": r.cgst_amount,
    "SGST Rate (%)": r.sgst_rate,
    "SGST Amount": r.sgst_amount,
    "IGST Rate (%)": r.igst_rate,
    "IGST Amount": r.igst_amount,
  }));

  const b2c = rows.filter((r) => r.invoice_type === "B2C").map((r) => ({
    "Invoice Number": r.invoice_number,
    "Invoice Date": r.invoice_date,
    "Customer Name": r.customer_name,
    "Place of Supply": r.place_of_supply,
    "HSN/SAC": r.hsn_sac,
    "Description": r.description,
    "Taxable Value": r.taxable_value,
    "CGST Amount": r.cgst_amount,
    "SGST Amount": r.sgst_amount,
    "IGST Amount": r.igst_amount,
    "Total": r.total_amount,
  }));

  const hsn = Object.values(
    rows.reduce((acc: any, r: any) => {
      const key = r.hsn_sac || "N/A";
      if (!acc[key]) acc[key] = { hsn: key, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, count: 0 };
      acc[key].taxable += r.taxable_value;
      acc[key].cgst += r.cgst_amount;
      acc[key].sgst += r.sgst_amount;
      acc[key].igst += r.igst_amount;
      acc[key].total += r.total_amount;
      acc[key].count += r.quantity;
      return acc;
    }, {})
  ).map((h: any) => ({
    "HSN/SAC": h.hsn,
    "Total Quantity": h.count,
    "Taxable Value": h.taxable,
    "CGST": h.cgst,
    "SGST": h.sgst,
    "IGST": h.igst,
    "Total Value": h.total,
  }));

  exportMultiSheet(
    [
      { name: "B2B Invoices", data: b2b },
      { name: "B2C Invoices", data: b2c },
      { name: "HSN Summary", data: hsn },
    ],
    `GSTR-1_${period}.xlsx`
  );
}

// ── GSTR-3B Export ──
export function exportGSTR3B(summary: any, period: string) {
  const data = [
    { "Particulars": "3.1 - Outward Taxable Supplies", "Taxable Value": summary.outward_taxable, "CGST": summary.cgst_payable, "SGST": summary.sgst_payable, "IGST": summary.igst_payable },
    { "Particulars": "3.1 - Outward Exempt Supplies", "Taxable Value": summary.outward_exempt, "CGST": 0, "SGST": 0, "IGST": 0 },
    { "Particulars": "3.1 - Outward Nil Rated", "Taxable Value": summary.outward_nil_rated, "CGST": 0, "SGST": 0, "IGST": 0 },
    { "Particulars": "", "Taxable Value": "", "CGST": "", "SGST": "", "IGST": "" },
    { "Particulars": "4 - Eligible ITC", "Taxable Value": summary.inward_taxable, "CGST": summary.itc_cgst, "SGST": summary.itc_sgst, "IGST": summary.itc_igst },
    { "Particulars": "", "Taxable Value": "", "CGST": "", "SGST": "", "IGST": "" },
    { "Particulars": "6.1 - Net Tax Payable", "Taxable Value": "", "CGST": summary.net_cgst, "SGST": summary.net_sgst, "IGST": summary.net_igst },
    { "Particulars": "TOTAL NET PAYABLE", "Taxable Value": "", "CGST": "", "SGST": "", "IGST": summary.net_payable },
  ];
  exportToExcel(data, `GSTR-3B_${period}.xlsx`, "GSTR-3B");
}

// ── TDS 24Q Export ──
export function exportTDS24Q(rows: any[], period: string) {
  const data = rows.map((r) => ({
    "Employee Name": r.employee_name,
    "PAN": r.employee_pan || "XXXXX0000X",
    "Pay Period": r.pay_period,
    "Gross Salary": r.gross_salary,
    "HRA Exempt": r.hra_exempt,
    "Standard Deduction": r.standard_deduction,
    "Taxable Income": r.taxable_income,
    "TDS Deducted": r.tds_deducted,
    "Surcharge": r.surcharge,
    "Health & Education Cess (4%)": r.cess,
    "Total TDS": r.total_tds,
  }));
  exportToExcel(data, `TDS_24Q_${period}.xlsx`, "Form 24Q");
}

// ── TDS 26Q Export ──
export function exportTDS26Q(rows: any[], period: string) {
  const data = rows.map((r) => ({
    "Deductee Name": r.deductee_name,
    "PAN of Deductee": r.deductee_pan || "XXXXX0000X",
    "Section Code": r.section_code,
    "Date of Payment": r.payment_date,
    "Amount Paid/Credited": r.amount_paid,
    "TDS Rate (%)": r.tds_rate,
    "TDS Amount": r.tds_amount,
    "Description": r.description,
  }));
  exportToExcel(data, `TDS_26Q_${period}.xlsx`, "Form 26Q");
}

// ── PF ECR Export ──
export function exportPFECR(rows: any[], period: string) {
  const data = rows.map((r) => ({
    "UAN": r.uan || "",
    "Employee Name": r.employee_name,
    "Gross Wages": r.gross_wages,
    "EPF Wages": r.epf_wages,
    "EPS Wages": r.eps_wages,
    "EDLI Wages": r.edli_wages,
    "EPF (Employee 12%)": r.epf_employee,
    "EPS (Employer 8.33%)": r.eps_employer,
    "EPF Diff (Employer 3.67%)": r.epf_employer,
    "EDLI Contribution": r.edli_contribution,
    "NCP Days": r.ncp_days,
    "Refund of Advances": r.refund_of_advances,
  }));
  exportToExcel(data, `PF_ECR_${period}.xlsx`, "ECR");
}

// ── ESI Export ──
export function exportESI(rows: any[], period: string) {
  const data = rows.map((r) => ({
    "IP Number": r.ip_number || "",
    "Employee Name": r.employee_name,
    "No. of Days Worked": r.days_worked,
    "Total Wages": r.gross_wages,
    "Employee Contribution (0.75%)": r.employee_contribution,
    "Employer Contribution (3.25%)": r.employer_contribution,
    "Total Contribution": r.total_contribution,
  }));
  exportToExcel(data, `ESI_Return_${period}.xlsx`, "ESI");
}

// ── Professional Tax Export ──
export function exportProfTax(rows: any[], period: string) {
  const data = rows.map((r) => ({
    "Employee Name": r.employee_name,
    "Gross Salary": r.gross_salary,
    "PT Amount": r.pt_amount,
    "State": r.state,
    "Month": r.month,
  }));
  exportToExcel(data, `Professional_Tax_${period}.xlsx`, "Prof Tax");
}
