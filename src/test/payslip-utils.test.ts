import { describe, it, expect } from "vitest";
import { normalizePayslip } from "@/lib/payslip-utils";

describe("normalizePayslip", () => {
  // ── Engine path (payroll_entries with earnings_breakdown) ──
  describe("engine path", () => {
    it("normalizes engine record with breakdowns", () => {
      const record = {
        earnings_breakdown: [
          { name: "Basic Salary", monthly: 50000, statutory: false },
          { name: "HRA", monthly: 20000, statutory: false },
        ],
        deductions_breakdown: [
          { name: "PF", monthly: 6000, statutory: true },
          { name: "TDS", monthly: 4000, statutory: true },
        ],
        net_pay: 60000,
        lwp_days: 2,
        lwp_deduction: 3333,
        working_days: 30,
        paid_days: 28,
      };

      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(true);
      expect(result.earnings).toHaveLength(2);
      expect(result.deductions).toHaveLength(2);
      expect(result.totalEarnings).toBe(70000);
      expect(result.totalDeductions).toBe(10000);
      expect(result.netPay).toBe(60000);
      expect(result.lopDays).toBe(2);
      expect(result.lopDeduction).toBe(3333);
      expect(result.workingDays).toBe(30);
      expect(result.paidDays).toBe(28);
    });

    it("uses calculated net pay when net_pay is missing", () => {
      const record = {
        earnings_breakdown: [{ name: "Basic", monthly: 50000 }],
        deductions_breakdown: [{ name: "PF", monthly: 6000 }],
        working_days: 30,
        paid_days: 30,
      };

      const result = normalizePayslip(record);
      expect(result.netPay).toBe(44000); // 50000 - 6000
    });

    it("handles empty deductions", () => {
      const record = {
        earnings_breakdown: [{ name: "Basic", monthly: 30000 }],
        deductions_breakdown: [],
        net_pay: 30000,
        working_days: 22,
        paid_days: 22,
      };

      const result = normalizePayslip(record);
      expect(result.deductions).toHaveLength(0);
      expect(result.totalDeductions).toBe(0);
      expect(result.netPay).toBe(30000);
    });

    it("coerces string amounts to numbers", () => {
      const record = {
        earnings_breakdown: [{ name: "Basic", monthly: "50000" }],
        deductions_breakdown: [{ name: "PF", monthly: "6000" }],
        net_pay: "44000",
        lwp_days: "0",
        working_days: "30",
        paid_days: "30",
      };

      const result = normalizePayslip(record);
      expect(result.totalEarnings).toBe(50000);
      expect(result.totalDeductions).toBe(6000);
      expect(result.netPay).toBe(44000);
    });

    it("handles null/undefined amounts gracefully", () => {
      const record = {
        earnings_breakdown: [{ name: "Basic", monthly: null }],
        deductions_breakdown: [{ name: "PF", monthly: undefined }],
        working_days: 30,
        paid_days: 30,
      };

      const result = normalizePayslip(record);
      expect(result.totalEarnings).toBe(0);
      expect(result.totalDeductions).toBe(0);
    });

    it("marks statutory items correctly", () => {
      const record = {
        earnings_breakdown: [
          { name: "Basic", monthly: 50000, statutory: false },
          { name: "PF Employer", monthly: 6000, statutory: true },
        ],
        deductions_breakdown: [],
      };

      const result = normalizePayslip(record);
      expect(result.earnings[0].statutory).toBe(false);
      expect(result.earnings[1].statutory).toBe(true);
    });
  });

  // ── Legacy path (payroll_records with flat columns) ──
  describe("legacy path", () => {
    it("normalizes legacy record with flat columns", () => {
      const record = {
        basic_salary: 40000,
        hra: 16000,
        transport_allowance: 3000,
        other_allowances: 2000,
        pf_deduction: 4800,
        tax_deduction: 3000,
        other_deductions: 500,
        net_pay: 52700,
        working_days: 26,
        paid_days: 26,
        lop_days: 0,
      };

      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(false);
      expect(result.earnings).toHaveLength(4);
      expect(result.deductions).toHaveLength(3); // no LOP row when lop_days=0
      expect(result.totalEarnings).toBe(61000);
      expect(result.totalDeductions).toBe(8300);
      expect(result.netPay).toBe(52700);
    });

    it("adds LOP deduction row when lop_days > 0", () => {
      const record = {
        basic_salary: 30000,
        hra: 10000,
        transport_allowance: 0,
        other_allowances: 0,
        pf_deduction: 3600,
        tax_deduction: 0,   // zero — no TDS row expected
        other_deductions: 0, // zero — no Prof Tax row expected
        lop_days: 2,
        lop_deduction: 3077,
        working_days: 26,
        paid_days: 24,
        net_pay: 33323,
      };

      const result = normalizePayslip(record);
      // Only PF and LOP rows — tax_deduction/other_deductions are 0 so they are omitted.
      // gross=40000, net=33323, implied=6677, known=6677 → no catch-all row added.
      expect(result.deductions).toHaveLength(2); // PF, LOP
      const lopRow = result.deductions.find(d => d.label.startsWith("LOP"));
      expect(lopRow).toBeDefined();
      expect(lopRow!.amount).toBe(3077);
      expect(lopRow!.label).toContain("2 days");
    });

    it("auto-calculates LOP deduction when not stored", () => {
      const record = {
        basic_salary: 30000,
        hra: 10000,
        transport_allowance: 2000, // repurposed for incentives — excluded from LOP base
        other_allowances: 0,
        pf_deduction: 0,
        tax_deduction: 0,
        other_deductions: 0,
        lop_days: 3,
        lop_deduction: 0, // not stored — should be auto-derived
        working_days: 30,
        paid_days: 27,
      };

      const result = normalizePayslip(record);
      // grossFixed (LOP base) = basic + hra + other_allowances = 30000 + 10000 + 0 = 40000
      // transport_allowance is repurposed for incentives and excluded from the LOP base.
      // per_day = round(40000/30) * 3 = round(4000) = 4000
      expect(result.lopDeduction).toBe(4000);
      const lopRow = result.deductions.find(d => d.label.startsWith("LOP"));
      expect(lopRow!.amount).toBe(4000);
    });

    it("handles zero working_days without division error", () => {
      const record = {
        basic_salary: 30000,
        hra: 0,
        transport_allowance: 0,
        other_allowances: 0,
        pf_deduction: 0,
        tax_deduction: 0,
        other_deductions: 0,
        lop_days: 2,
        lop_deduction: 0,
        working_days: 0,
        paid_days: 0,
      };

      // Should not throw - lopDeduction stays 0 when working_days is 0
      const result = normalizePayslip(record);
      expect(result.lopDeduction).toBe(0);
    });

    it("shows catch-all deduction line when net_pay implies deductions not in flat columns", () => {
      // Scenario: bulk-uploaded record where only the final net_pay was captured
      // from the file but individual deduction columns were not populated.
      const record = {
        basic_salary: 7280,
        hra: 2912,
        transport_allowance: 0,
        other_allowances: 8008,
        pf_deduction: 0,
        tax_deduction: 0,
        other_deductions: 0,
        lop_days: 0,
        net_pay: 16200, // implies ₹2,000 in deductions (18200 - 16200)
        working_days: 26,
        paid_days: 26,
      };

      const result = normalizePayslip(record);
      expect(result.totalEarnings).toBe(18200);
      expect(result.netPay).toBe(16200);
      // Should have exactly one catch-all deduction row for the ₹2,000 gap
      expect(result.deductions).toHaveLength(1);
      expect(result.deductions[0].label).toBe("Salary Deductions");
      expect(result.deductions[0].amount).toBe(2000);
      // totalDeductions should now reconcile with net pay
      expect(result.totalDeductions).toBe(2000);
      expect(result.totalEarnings - result.totalDeductions).toBe(result.netPay);
    });

    it("handles missing/null fields", () => {
      const record = {
        basic_salary: null,
        hra: undefined,
        // everything else missing
      };

      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(false);
      expect(result.totalEarnings).toBe(0);
      expect(result.totalDeductions).toBe(0);
      expect(result.lopDays).toBe(0);
      expect(result.workingDays).toBe(0);
    });
  });

  // ── Detection logic ──
  describe("path detection", () => {
    it("uses engine path when earnings_breakdown is non-empty array", () => {
      const record = {
        earnings_breakdown: [{ name: "Basic", monthly: 50000 }],
        deductions_breakdown: [],
        basic_salary: 40000, // legacy fields also present
      };

      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(true);
    });

    it("falls back to legacy when earnings_breakdown is empty array", () => {
      const record = {
        earnings_breakdown: [],
        basic_salary: 40000,
      };

      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(false);
    });

    it("falls back to legacy when earnings_breakdown is null", () => {
      const record = {
        earnings_breakdown: null,
        basic_salary: 40000,
      };

      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(false);
    });

    it("falls back to legacy when earnings_breakdown is undefined", () => {
      const record = { basic_salary: 40000 };
      const result = normalizePayslip(record);
      expect(result.isEnginePath).toBe(false);
    });
  });
});
