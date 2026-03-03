/**
 * Unified payslip data normalizer.
 * 
 * Two payroll paths exist:
 * 1. Legacy: `payroll_records` with hardcoded columns (basic_salary, hra, etc.)
 * 2. Engine: `payroll_entries` with dynamic earnings_breakdown/deductions_breakdown JSON
 *
 * This module normalizes both into a single shape for PaySlipDialog and MyPayslips.
 */

export interface PayslipLineItem {
  label: string;
  amount: number;
  statutory?: boolean;
}

export interface NormalizedPayslip {
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  lopDeduction: number;
  workingDays: number;
  paidDays: number;
  isEnginePath: boolean;
}

/**
 * Detect whether a record comes from the engine path (payroll_entries)
 * or the legacy path (payroll_records).
 */
function hasEngineBreakdown(record: any): boolean {
  const eb = record.earnings_breakdown;
  return Array.isArray(eb) && eb.length > 0;
}

/**
 * Normalize any payroll record shape into a unified PayslipLineItem structure.
 */
export function normalizePayslip(record: any): NormalizedPayslip {
  if (hasEngineBreakdown(record)) {
    return normalizeEngineRecord(record);
  }
  return normalizeLegacyRecord(record);
}

function normalizeEngineRecord(record: any): NormalizedPayslip {
  const earningsRaw: any[] = record.earnings_breakdown || [];
  const deductionsRaw: any[] = record.deductions_breakdown || [];

  const earnings: PayslipLineItem[] = earningsRaw.map((e: any) => ({
    label: e.name,
    amount: Number(e.monthly) || 0,
    statutory: !!e.statutory,
  }));

  const deductions: PayslipLineItem[] = deductionsRaw.map((d: any) => ({
    label: d.name,
    amount: Number(d.monthly) || 0,
    statutory: !!d.statutory,
  }));

  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay: Number(record.net_pay) || (totalEarnings - totalDeductions),
    lopDays: Number(record.lwp_days) || 0,
    lopDeduction: Number(record.lwp_deduction) || 0,
    workingDays: Number(record.working_days) || 0,
    paidDays: Number(record.paid_days) || 0,
    isEnginePath: true,
  };
}

function normalizeLegacyRecord(record: any): NormalizedPayslip {
  const earnings: PayslipLineItem[] = [
    { label: "Basic Salary", amount: Number(record.basic_salary) || 0 },
    { label: "House Rent Allowance (HRA)", amount: Number(record.hra) || 0 },
    { label: "Transport Allowance", amount: Number(record.transport_allowance) || 0 },
    { label: "Other Allowances", amount: Number(record.other_allowances) || 0 },
  ];

  const deductions: PayslipLineItem[] = [
    { label: "Provident Fund (PF)", amount: Number(record.pf_deduction) || 0 },
    { label: "Tax Deduction (TDS)", amount: Number(record.tax_deduction) || 0 },
    { label: "Other Deductions", amount: Number(record.other_deductions) || 0 },
  ];

  const lopDays = Number(record.lop_days) || 0;
  const lopDeduction = Number(record.lop_deduction) || 0;
  if (lopDeduction > 0) {
    deductions.push({ label: `Loss of Pay (${lopDays} days)`, amount: lopDeduction });
  }

  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    netPay: Number(record.net_pay) || (totalEarnings - totalDeductions),
    lopDays,
    lopDeduction,
    workingDays: Number(record.working_days) || 0,
    paidDays: Number(record.paid_days) || 0,
    isEnginePath: false,
  };
}
