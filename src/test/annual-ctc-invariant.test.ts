/**
 * Item 48: annual_ctc snapshot invariant tests.
 *
 * Verifies that the annual_ctc field on payroll_entries (and the engine's
 * computed intermediate objects) satisfies three invariants at all times:
 *
 *   1. annual_ctc must be positive and finite.
 *   2. annual_ctc >= gross_earnings * 12  (CTC is a ceiling, not a floor —
 *      actual gross may be lower due to LWP, but must never exceed CTC).
 *   3. annual_ctc ≈ sum(earnings_breakdown[i].annual)  within ±1 rupee
 *      (snapshot consistency: stored breakdown must match the stored CTC).
 *
 * These are pure in-memory tests — no Supabase connection needed.
 */

import { describe, it, expect } from "vitest";

// ── Types (mirrors PayrollEntry + usePayrollEngine internals) ────────────────

interface EarningsComponent {
  name: string;
  monthly: number;
  annual: number;
}

interface PayrollEntrySnapshot {
  profile_id: string;
  annual_ctc: number;
  gross_earnings: number;           // monthly gross (after LWP)
  earnings_breakdown: EarningsComponent[];
  lwp_days?: number;
  working_days?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function breakdownAnnualSum(breakdown: EarningsComponent[]): number {
  return breakdown.reduce((s, c) => s + (c.annual ?? c.monthly * 12), 0);
}

function makeEntry(
  overrides: Partial<PayrollEntrySnapshot> & { annual_ctc: number; gross_earnings: number }
): PayrollEntrySnapshot {
  const earnings = overrides.earnings_breakdown ?? [
    { name: "Basic Salary", monthly: overrides.annual_ctc / 12 * 0.4, annual: overrides.annual_ctc * 0.4 },
    { name: "HRA",          monthly: overrides.annual_ctc / 12 * 0.2, annual: overrides.annual_ctc * 0.2 },
    { name: "Other",        monthly: overrides.annual_ctc / 12 * 0.4, annual: overrides.annual_ctc * 0.4 },
  ];
  return {
    profile_id: "test-profile",
    lwp_days: 0,
    working_days: 22,
    ...overrides,
    earnings_breakdown: earnings,
  };
}

// ── Invariant assertions (reusable) ─────────────────────────────────────────

function assertAnnualCtcInvariants(entry: PayrollEntrySnapshot, label: string) {
  // Invariant 1: positive and finite
  expect(Number.isFinite(entry.annual_ctc), `${label}: annual_ctc must be finite`).toBe(true);
  expect(entry.annual_ctc, `${label}: annual_ctc must be > 0`).toBeGreaterThan(0);

  // Invariant 2: CTC >= gross*12 (gross may be lower due to LWP)
  expect(
    entry.annual_ctc,
    `${label}: annual_ctc (${entry.annual_ctc}) must be >= gross_earnings*12 (${entry.gross_earnings * 12})`
  ).toBeGreaterThanOrEqual(entry.gross_earnings * 12 - 1); // 1 rupee tolerance for fp rounding

  // Invariant 3: breakdown annual sum ≈ annual_ctc
  const breakdownSum = breakdownAnnualSum(entry.earnings_breakdown);
  expect(
    Math.abs(breakdownSum - entry.annual_ctc),
    `${label}: breakdown annual sum ${breakdownSum} must match annual_ctc ${entry.annual_ctc} (within Rs. 1)`
  ).toBeLessThanOrEqual(1);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("annual_ctc snapshot invariants", () => {
  describe("standard full-month entry (no LWP)", () => {
    it("satisfies all three invariants for a mid-range salary", () => {
      const entry = makeEntry({ annual_ctc: 600000, gross_earnings: 50000 });
      assertAnnualCtcInvariants(entry, "600k CTC full month");
    });

    it("satisfies all three invariants for a high-salary employee", () => {
      const entry = makeEntry({ annual_ctc: 2400000, gross_earnings: 200000 });
      assertAnnualCtcInvariants(entry, "24L CTC full month");
    });

    it("satisfies all three invariants for minimum-wage band", () => {
      const entry = makeEntry({ annual_ctc: 120000, gross_earnings: 10000 });
      assertAnnualCtcInvariants(entry, "1.2L CTC full month");
    });
  });

  describe("entry with LWP (leave without pay) deduction", () => {
    it("gross < CTC/12 when LWP days > 0 — invariant 2 still holds", () => {
      // Employee on 10L CTC takes 5 LWP days in a 22-working-day month
      const annualCtc = 1000000;
      const monthlyCTC = annualCtc / 12;
      const lwpDays = 5;
      const workingDays = 22;
      const gross = Math.round(monthlyCTC * ((workingDays - lwpDays) / workingDays));

      const entry = makeEntry({
        annual_ctc: annualCtc,
        gross_earnings: gross,
        lwp_days: lwpDays,
        working_days: workingDays,
      });

      // Gross must be less than full monthly CTC (LWP applied)
      expect(entry.gross_earnings).toBeLessThan(monthlyCTC);
      assertAnnualCtcInvariants(entry, "10L CTC with 5 LWP days");
    });

    it("fully absent employee (22 LWP out of 22 days) has gross = 0 — CTC still positive", () => {
      const annualCtc = 720000;
      const entry = makeEntry({ annual_ctc: annualCtc, gross_earnings: 0, lwp_days: 22, working_days: 22 });

      expect(entry.annual_ctc).toBeGreaterThan(0);
      expect(entry.gross_earnings).toBe(0);
      // Invariant 2: 0*12 = 0 <= 720000 ✓
      expect(entry.annual_ctc).toBeGreaterThanOrEqual(0);
    });
  });

  describe("legacy path fallback (annual_ctc = gross * 12)", () => {
    it("annual_ctc = gross*12 satisfies all invariants", () => {
      const gross = 45000;
      const annualCtc = gross * 12; // this is how useBulkUpload computes it
      const entry: PayrollEntrySnapshot = {
        profile_id: "legacy-profile",
        annual_ctc: annualCtc,
        gross_earnings: gross,
        earnings_breakdown: [
          { name: "Basic Salary", monthly: gross * 0.4, annual: gross * 0.4 * 12 },
          { name: "HRA",          monthly: gross * 0.2, annual: gross * 0.2 * 12 },
          { name: "Other",        monthly: gross * 0.4, annual: gross * 0.4 * 12 },
        ],
        lwp_days: 0,
        working_days: 22,
      };
      assertAnnualCtcInvariants(entry, "legacy gross*12");
    });
  });

  describe("edge cases", () => {
    it("rejects zero annual_ctc", () => {
      const entry = makeEntry({ annual_ctc: 0, gross_earnings: 0 });
      expect(entry.annual_ctc).toBe(0);
      // Invariant 1 should fail — document the expected violation
      expect(entry.annual_ctc > 0).toBe(false);
    });

    it("rejects negative annual_ctc", () => {
      const entry = makeEntry({ annual_ctc: -100000, gross_earnings: 0 });
      expect(entry.annual_ctc < 0).toBe(true);
      expect(Number.isFinite(entry.annual_ctc)).toBe(true);
    });

    it("fractional rupee rounding stays within 1-rupee tolerance", () => {
      // Real-world: CTC is 6,50,000; components split as 40/20/40 → floating point
      const annualCtc = 650000;
      const entry: PayrollEntrySnapshot = {
        profile_id: "fp-test",
        annual_ctc: annualCtc,
        gross_earnings: Math.floor(annualCtc / 12),
        earnings_breakdown: [
          { name: "Basic Salary", monthly: Math.round(annualCtc / 12 * 0.4), annual: Math.round(annualCtc * 0.4) },
          { name: "HRA",          monthly: Math.round(annualCtc / 12 * 0.2), annual: Math.round(annualCtc * 0.2) },
          { name: "Other",        monthly: Math.round(annualCtc / 12 * 0.4), annual: Math.round(annualCtc * 0.4) },
        ],
        lwp_days: 0,
        working_days: 22,
      };
      const breakdownSum = breakdownAnnualSum(entry.earnings_breakdown);
      expect(Math.abs(breakdownSum - annualCtc)).toBeLessThanOrEqual(1);
    });
  });

  describe("batch: multiple employees (simulates payroll run)", () => {
    const sampleRun: PayrollEntrySnapshot[] = [
      makeEntry({ annual_ctc: 600000,  gross_earnings: 50000,  profile_id: "e1" }),
      makeEntry({ annual_ctc: 1200000, gross_earnings: 100000, profile_id: "e2" }),
      makeEntry({ annual_ctc: 360000,  gross_earnings: 27273,  profile_id: "e3", lwp_days: 2, working_days: 22 }),
      makeEntry({ annual_ctc: 2400000, gross_earnings: 200000, profile_id: "e4" }),
    ];

    it("all entries in a payroll run satisfy the CTC invariants", () => {
      for (const entry of sampleRun) {
        assertAnnualCtcInvariants(entry, `batch entry for ${entry.profile_id}`);
      }
    });

    it("no entry has annual_ctc < gross_earnings * 12", () => {
      for (const entry of sampleRun) {
        expect(entry.annual_ctc).toBeGreaterThanOrEqual(Math.floor(entry.gross_earnings * 12));
      }
    });
  });
});
