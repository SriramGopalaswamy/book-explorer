/**
 * Item 34: RBAC/RLS consistency tests.
 *
 * These tests verify that DEFAULT_PERMISSIONS is internally consistent and
 * enforces the expected access-control boundaries for each role.
 *
 * They run against the in-memory permissions constants only (no Supabase
 * connection needed) — they are fast, deterministic, and catch regressions in
 * the permissions matrix before any schema change ships.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  CONFIGURABLE_ROLES,
  RESOURCES,
  type ConfigurableRole,
  type ResourceKey,
} from "@/lib/permissions";

// ─── Helpers ────────────────────────────────────────────────────────────────

function canView(role: ConfigurableRole, resource: ResourceKey): boolean {
  return DEFAULT_PERMISSIONS[role][resource]?.can_view ?? false;
}
function canCreate(role: ConfigurableRole, resource: ResourceKey): boolean {
  return DEFAULT_PERMISSIONS[role][resource]?.can_create ?? false;
}
function canDelete(role: ConfigurableRole, resource: ResourceKey): boolean {
  return DEFAULT_PERMISSIONS[role][resource]?.can_delete ?? false;
}

// Resources that must NEVER be visible to an employee (PII / financial risk)
const EMPLOYEE_MUST_DENY: ResourceKey[] = [
  RESOURCES.FINANCIAL,
  RESOURCES.HRMS_PAYROLL,      // full payroll register (not own payslip)
  RESOURCES.HRMS_EMPLOYEES,    // employee management
  RESOURCES.USER_MANAGEMENT,
  RESOURCES.AUDIT_LOG,
  RESOURCES.CONNECTORS,
  RESOURCES.SETTINGS,
  RESOURCES.HRMS_CTC_COMPONENTS,
];

// Resources that must NEVER be visible to a manager
const MANAGER_MUST_DENY: ResourceKey[] = [
  RESOURCES.FINANCIAL,
  RESOURCES.HRMS_PAYROLL,
  RESOURCES.HRMS_EMPLOYEES,
  RESOURCES.AUDIT_LOG,
  RESOURCES.CONNECTORS,
  RESOURCES.HRMS_CTC_COMPONENTS,
  RESOURCES.SETTINGS,
];

// ─── Completeness ────────────────────────────────────────────────────────────

describe("DEFAULT_PERMISSIONS completeness", () => {
  it("every configurable role has an entry", () => {
    for (const role of CONFIGURABLE_ROLES) {
      expect(DEFAULT_PERMISSIONS).toHaveProperty(role);
    }
  });

  it("every resource key appears in every role's permissions", () => {
    const allResources = Object.values(RESOURCES) as ResourceKey[];
    for (const role of CONFIGURABLE_ROLES) {
      for (const resource of allResources) {
        expect(DEFAULT_PERMISSIONS[role]).toHaveProperty(resource);
      }
    }
  });

  it("no permission row has undefined action flags", () => {
    const allResources = Object.values(RESOURCES) as ResourceKey[];
    const actions = ["can_view", "can_create", "can_edit", "can_delete", "can_export"] as const;
    for (const role of CONFIGURABLE_ROLES) {
      for (const resource of allResources) {
        const perm = DEFAULT_PERMISSIONS[role][resource];
        for (const action of actions) {
          expect(typeof perm[action]).toBe("boolean");
        }
      }
    }
  });
});

// ─── Employee role boundaries ────────────────────────────────────────────────

describe("employee role — must be denied sensitive resources", () => {
  for (const resource of EMPLOYEE_MUST_DENY) {
    it(`employee cannot view ${resource}`, () => {
      expect(canView("employee", resource)).toBe(false);
    });
    it(`employee cannot create on ${resource}`, () => {
      expect(canCreate("employee", resource)).toBe(false);
    });
    it(`employee cannot delete on ${resource}`, () => {
      expect(canDelete("employee", resource)).toBe(false);
    });
  }

  it("employee can view own payslips (hrms_my_payslips)", () => {
    expect(canView("employee", RESOURCES.HRMS_MY_PAYSLIPS)).toBe(true);
  });
  it("employee can view attendance (own, RLS-scoped)", () => {
    expect(canView("employee", RESOURCES.HRMS_ATTENDANCE)).toBe(true);
  });
  it("employee can create leave requests", () => {
    expect(canCreate("employee", RESOURCES.HRMS_LEAVES)).toBe(true);
  });
});

// ─── Manager role boundaries ─────────────────────────────────────────────────

describe("manager role — must not access finance or admin resources", () => {
  for (const resource of MANAGER_MUST_DENY) {
    it(`manager cannot view ${resource}`, () => {
      expect(canView("manager", resource)).toBe(false);
    });
  }

  it("manager can view manager inbox", () => {
    expect(canView("manager", RESOURCES.HRMS_MANAGER_INBOX)).toBe(true);
  });
  it("manager can edit attendance (direct reports, RLS-scoped)", () => {
    expect(DEFAULT_PERMISSIONS.manager.hrms_attendance.can_edit).toBe(true);
  });
});

// ─── HR role boundaries ──────────────────────────────────────────────────────

describe("hr role — full HRMS access, no financial or admin", () => {
  it("hr cannot view financial resources", () => {
    expect(canView("hr", RESOURCES.FINANCIAL)).toBe(false);
  });
  it("hr cannot access connectors", () => {
    expect(canView("hr", RESOURCES.CONNECTORS)).toBe(false);
  });
  it("hr cannot manage users (admin-only)", () => {
    expect(canView("hr", RESOURCES.USER_MANAGEMENT)).toBe(false);
  });
  it("hr can create payroll runs", () => {
    expect(canCreate("hr", RESOURCES.HRMS_PAYROLL)).toBe(true);
  });
  it("hr has full employee management", () => {
    const perm = DEFAULT_PERMISSIONS.hr.hrms_employees;
    expect(perm.can_view).toBe(true);
    expect(perm.can_create).toBe(true);
    expect(perm.can_edit).toBe(true);
  });
});

// ─── Finance role boundaries ─────────────────────────────────────────────────

describe("finance role — financial access, no HRMS admin", () => {
  it("finance can view and export financial resources", () => {
    const perm = DEFAULT_PERMISSIONS.finance.financial;
    expect(perm.can_view).toBe(true);
    expect(perm.can_export).toBe(true);
  });
  it("finance cannot manage employees", () => {
    expect(canView("finance", RESOURCES.HRMS_EMPLOYEES)).toBe(false);
  });
  it("finance cannot view audit logs", () => {
    expect(canView("finance", RESOURCES.AUDIT_LOG)).toBe(false);
  });
  it("finance can approve payroll (can_edit on hrms_payroll)", () => {
    expect(DEFAULT_PERMISSIONS.finance.hrms_payroll.can_edit).toBe(true);
  });
  it("finance cannot create payroll runs (HR does that)", () => {
    expect(canCreate("finance", RESOURCES.HRMS_PAYROLL)).toBe(false);
  });
});

// ─── Payroll role boundaries ─────────────────────────────────────────────────

describe("payroll role — restricted view-only by default", () => {
  it("payroll cannot view financial resources", () => {
    expect(canView("payroll", RESOURCES.FINANCIAL)).toBe(false);
  });
  it("payroll can view payroll register", () => {
    expect(canView("payroll", RESOURCES.HRMS_PAYROLL)).toBe(true);
  });
  it("payroll cannot create payroll runs by default", () => {
    expect(canCreate("payroll", RESOURCES.HRMS_PAYROLL)).toBe(false);
  });
  it("payroll cannot access user management", () => {
    expect(canView("payroll", RESOURCES.USER_MANAGEMENT)).toBe(false);
  });
});

// ─── Privilege escalation guards ─────────────────────────────────────────────

describe("privilege escalation: no role should have delete on critical resources by default", () => {
  const criticalResources: ResourceKey[] = [
    RESOURCES.FINANCIAL,
    RESOURCES.AUDIT_LOG,
    RESOURCES.USER_MANAGEMENT,
  ];

  for (const role of CONFIGURABLE_ROLES) {
    for (const resource of criticalResources) {
      it(`${role} cannot delete ${resource}`, () => {
        expect(canDelete(role, resource)).toBe(false);
      });
    }
  }
});
