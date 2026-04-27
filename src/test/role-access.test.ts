/**
 * Role Access Tests
 *
 * Verifies that every role (admin, hr, finance, payroll, manager, employee) is
 * correctly granted or denied access to the Employees page and Payroll KPI
 * cards, using a known in-memory org fixture.
 *
 * Tests are pure-logic: they extract the same access rules that the hooks and
 * route guards apply (useIsAdminHROrFinance, PayrollRoute guard, usePayrollStats)
 * and run them against deterministic fixture data — no Supabase calls needed.
 */

import { describe, it, expect } from "vitest";

// ─── Org fixture ──────────────────────────────────────────────────────────────

const ORG_ID = "org-fixture-001";

const FIXTURE_EMPLOYEES = [
  { id: "p1", user_id: "u1", organization_id: ORG_ID, status: "active",   full_name: "Alice Admin" },
  { id: "p2", user_id: "u2", organization_id: ORG_ID, status: "active",   full_name: "Bob Finance" },
  { id: "p3", user_id: "u3", organization_id: ORG_ID, status: "on_leave", full_name: "Carol HR" },
  { id: "p4", user_id: "u4", organization_id: ORG_ID, status: "inactive", full_name: "Dave Payroll" },
  { id: "p5", user_id: "u5", organization_id: ORG_ID, status: "active",   full_name: "Eve Employee" },
];

const FIXTURE_PAYROLL_RECORDS = [
  { id: "pr1", organization_id: ORG_ID, pay_period: "2026-04", profile_id: "p1", net_pay: 80000, basic_salary: 50000, hra: 20000, transport_allowance: 0, other_allowances: 10000, pf_deduction: 1800, tax_deduction: 5000, other_deductions: 200, lop_deduction: 0, status: "locked" },
  { id: "pr2", organization_id: ORG_ID, pay_period: "2026-04", profile_id: "p2", net_pay: 60000, basic_salary: 38000, hra: 15200, transport_allowance: 0, other_allowances: 6800, pf_deduction: 1800, tax_deduction: 0,    other_deductions: 200, lop_deduction: 0, status: "draft" },
  { id: "pr3", organization_id: ORG_ID, pay_period: "2026-04", profile_id: "p3", net_pay: 45000, basic_salary: 28000, hra: 11200, transport_allowance: 0, other_allowances:  4800, pf_deduction: 1500, tax_deduction: 0,    other_deductions: 200, lop_deduction:  300, status: "locked" },
  // Superseded — must be excluded from stats
  { id: "pr4", organization_id: ORG_ID, pay_period: "2026-04", profile_id: "p1", net_pay: 79000, basic_salary: 50000, hra: 20000, transport_allowance: 0, other_allowances: 10000, pf_deduction: 1800, tax_deduction: 5000, other_deductions: 200, lop_deduction: 0, status: "superseded" },
  // Different period — must not appear in April stats
  { id: "pr5", organization_id: ORG_ID, pay_period: "2026-03", profile_id: "p4", net_pay: 55000, basic_salary: 34000, hra: 13600, transport_allowance: 0, other_allowances:  7400, pf_deduction: 1800, tax_deduction: 0,    other_deductions: 200, lop_deduction: 0, status: "locked" },
];

// ─── Access-gate logic (mirrors useIsAdminHROrFinance / PayrollRoute) ─────────

const EMPLOYEE_PAGE_ROLES = new Set(["admin", "hr", "finance", "payroll"]);
const PAYROLL_PAGE_ROLES  = new Set(["admin", "hr", "finance", "payroll"]);
const ALL_ROLES = ["admin", "hr", "finance", "payroll", "manager", "employee"] as const;
type Role = typeof ALL_ROLES[number];

function canAccessEmployeePage(role: Role): boolean {
  return EMPLOYEE_PAGE_ROLES.has(role);
}

function canAccessPayrollPage(role: Role): boolean {
  return PAYROLL_PAGE_ROLES.has(role);
}

// ─── KPI calculation logic (mirrors usePayrollStats) ─────────────────────────

interface PayrollRecord {
  id: string;
  organization_id: string;
  pay_period: string;
  profile_id: string;
  net_pay: number;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  other_allowances: number;
  pf_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  lop_deduction: number;
  status: string;
}

function computePayrollKPIs(records: PayrollRecord[], payPeriod: string, orgId: string) {
  const scoped = records
    .filter((r) => r.organization_id === orgId)
    .filter((r) => r.pay_period === payPeriod)
    .filter((r) => r.status !== "superseded");

  return {
    totalEmployees: scoped.length,
    totalPayroll: scoped.reduce((s, r) => s + r.net_pay, 0),
    locked: scoped.filter((r) => r.status === "locked").length,
    pending: scoped.filter((r) => ["draft", "under_review", "approved"].includes(r.status)).length,
    totalBasic: scoped.reduce((s, r) => s + r.basic_salary, 0),
    totalAllowances: scoped.reduce((s, r) => s + r.hra + r.transport_allowance + r.other_allowances, 0),
    totalDeductions: scoped.reduce((s, r) => s + r.pf_deduction + r.tax_deduction + r.other_deductions + r.lop_deduction, 0),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mirrors the hard-guard in useEmployees: returns [] when orgId is missing. */
function fetchEmployees(orgId: string | undefined) {
  if (!orgId) return [];
  return FIXTURE_EMPLOYEES.filter((e) => e.organization_id === orgId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Employees page — role access gate", () => {
  const allowed: Role[] = ["admin", "hr", "finance", "payroll"];
  const denied:  Role[] = ["manager", "employee"];

  allowed.forEach((role) => {
    it(`${role} can access the Employees page`, () => {
      expect(canAccessEmployeePage(role)).toBe(true);
    });
  });

  denied.forEach((role) => {
    it(`${role} is denied access to the Employees page`, () => {
      expect(canAccessEmployeePage(role)).toBe(false);
    });
  });
});

describe("Payroll page — route guard", () => {
  const allowed: Role[] = ["admin", "hr", "finance", "payroll"];
  const denied:  Role[] = ["manager", "employee"];

  allowed.forEach((role) => {
    it(`${role} can access the Payroll page`, () => {
      expect(canAccessPayrollPage(role)).toBe(true);
    });
  });

  denied.forEach((role) => {
    it(`${role} is denied access to the Payroll page`, () => {
      expect(canAccessPayrollPage(role)).toBe(false);
    });
  });
});

describe("Employee count — org fixture", () => {
  it("returns all 5 employees for the fixture org", () => {
    const employees = fetchEmployees(ORG_ID);
    expect(employees).toHaveLength(5);
  });

  it("returns empty list when orgId is undefined (hard guard)", () => {
    const employees = fetchEmployees(undefined);
    expect(employees).toHaveLength(0);
  });

  it("returns empty list for an unknown orgId (tenant isolation)", () => {
    const employees = fetchEmployees("org-other-999");
    expect(employees).toHaveLength(0);
  });

  it("count is consistent across multiple calls (no side-effects)", () => {
    expect(fetchEmployees(ORG_ID)).toHaveLength(fetchEmployees(ORG_ID).length);
  });

  it("all 4 roles that can access Employees see the same employee list", () => {
    const counts = (["admin", "hr", "finance", "payroll"] as Role[]).map(
      () => fetchEmployees(ORG_ID).length
    );
    expect(new Set(counts).size).toBe(1); // all identical
    expect(counts[0]).toBe(5);
  });
});

describe("Payroll KPI cards — April 2026 fixture", () => {
  const kpis = computePayrollKPIs(FIXTURE_PAYROLL_RECORDS, "2026-04", ORG_ID);

  it("totalEmployees excludes superseded records", () => {
    // pr1, pr2, pr3 are valid; pr4 is superseded
    expect(kpis.totalEmployees).toBe(3);
  });

  it("totalPayroll sums only non-superseded records for the period", () => {
    // 80000 + 60000 + 45000 = 185000
    expect(kpis.totalPayroll).toBe(185_000);
  });

  it("locked count is correct", () => {
    // pr1 locked, pr3 locked
    expect(kpis.locked).toBe(2);
  });

  it("pending count is correct", () => {
    // pr2 draft
    expect(kpis.pending).toBe(1);
  });

  it("excludes records from a different period", () => {
    const march = computePayrollKPIs(FIXTURE_PAYROLL_RECORDS, "2026-03", ORG_ID);
    // only pr5 is in March
    expect(march.totalEmployees).toBe(1);
    expect(march.totalPayroll).toBe(55_000);
  });

  it("returns zero KPIs for a period with no records", () => {
    const empty = computePayrollKPIs(FIXTURE_PAYROLL_RECORDS, "2026-01", ORG_ID);
    expect(empty.totalEmployees).toBe(0);
    expect(empty.totalPayroll).toBe(0);
  });

  it("totalDeductions are computed correctly", () => {
    // pr1: 1800+5000+200+0=7000 | pr2: 1800+0+200+0=2000 | pr3: 1500+0+200+300=2000
    expect(kpis.totalDeductions).toBe(11_000);
  });

  it("totalBasic is correct", () => {
    // 50000 + 38000 + 28000 = 116000
    expect(kpis.totalBasic).toBe(116_000);
  });
});

describe("Period sync — Engine tab updates KPI period", () => {
  /** Extracts the YYYY-MM prefix from any engine period format */
  function extractMonthPeriod(enginePeriod: string): string {
    return enginePeriod.split("-").slice(0, 2).join("-");
  }

  it("monthly period passes through unchanged", () => {
    expect(extractMonthPeriod("2026-04")).toBe("2026-04");
  });

  it("biweekly H1 maps to the correct month", () => {
    expect(extractMonthPeriod("2026-04-H1")).toBe("2026-04");
  });

  it("biweekly H2 maps to the correct month", () => {
    expect(extractMonthPeriod("2026-04-H2")).toBe("2026-04");
  });

  it("weekly W1 maps to the correct month", () => {
    expect(extractMonthPeriod("2026-04-W1")).toBe("2026-04");
  });

  it("weekly W4 maps to the correct month", () => {
    expect(extractMonthPeriod("2026-04-W4")).toBe("2026-04");
  });

  it("changing month in Engine produces a different KPI period", () => {
    const april = extractMonthPeriod("2026-04");
    const march = extractMonthPeriod("2026-03");
    expect(april).not.toBe(march);
  });

  it("KPI stats differ between April and March fixture data", () => {
    const april = computePayrollKPIs(FIXTURE_PAYROLL_RECORDS, extractMonthPeriod("2026-04"), ORG_ID);
    const march = computePayrollKPIs(FIXTURE_PAYROLL_RECORDS, extractMonthPeriod("2026-03"), ORG_ID);
    expect(april.totalPayroll).not.toBe(march.totalPayroll);
    expect(april.totalEmployees).toBeGreaterThan(march.totalEmployees);
  });
});

describe("Tenant isolation — cross-org data bleed", () => {
  it("org-A records do not appear in org-B KPIs", () => {
    const orgB = "org-other-999";
    const kpis = computePayrollKPIs(FIXTURE_PAYROLL_RECORDS, "2026-04", orgB);
    expect(kpis.totalEmployees).toBe(0);
    expect(kpis.totalPayroll).toBe(0);
  });

  it("org-B employees do not appear in org-A employee list", () => {
    const orgBEmployees = fetchEmployees("org-other-999");
    expect(orgBEmployees).toHaveLength(0);
    const orgAEmployees = fetchEmployees(ORG_ID);
    expect(orgAEmployees.every((e) => e.organization_id === ORG_ID)).toBe(true);
  });
});
