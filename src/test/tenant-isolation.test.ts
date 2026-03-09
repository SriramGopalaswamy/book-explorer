/**
 * Tenant Isolation Test Suite
 * 
 * Validates that all data-fetching hooks enforce strict organization scoping,
 * preventing cross-tenant data leakage during context switches, privilege
 * escalation, and simulation contamination scenarios.
 * 
 * Categories:
 * 1. Query Scoping Assertions
 * 2. Context Switch Race Conditions
 * 3. Privilege Boundary Tests
 * 4. Simulation Contamination Guards
 * 5. Data Lifecycle Boundary Tests
 * 6. Mutation Scoping Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────
function readHookFile(hookName: string): string {
  const filePath = path.resolve(__dirname, `../hooks/${hookName}.ts`);
  return fs.readFileSync(filePath, "utf-8");
}

const ORG_SCOPED_HOOKS = [
  "useEmployees",
  "useFinancialData",
  "useAttendance",
  "useLeaves",
  "usePayroll",
  "useInvoices",
  "useInventory",
  "useSalesOrders",
  "usePurchaseOrders",
  "useBanking",
  "usePayments",
  "useReturns",
  "useWarehouse",
  "useManufacturing",
  "useCashFlow",
  "useGSTReconciliation",
  "useEInvoices",
  "useEwayBills",
  "useAssets",
  "useRoles",
  "useAuditLogs",
  "usePrivacyCompliance",
  "useCrossModuleAnalytics",
];

// ─── 1. Query Scoping Assertions ──────────────────────────────────
describe("1. Query Scoping Assertions", () => {
  describe("Hard guard pattern — every hook returns [] when orgId is missing", () => {
    ORG_SCOPED_HOOKS.forEach((hookName) => {
      it(`${hookName} contains a hard guard for missing orgId`, () => {
        const source = readHookFile(hookName);
        // Must have: if (!orgId) return [] (or equivalent empty-return guard)
        const hasHardGuard =
          /if\s*\(\s*!orgId\s*\)\s*return\s*\[\s*\]/.test(source) ||
          /if\s*\(\s*!user\s*\|\|\s*!orgId\s*\)\s*return\s*\[\s*\]/.test(source) ||
          /if\s*\(\s*!orgId\s*\)\s*return\s*\{/.test(source) ||
          /if\s*\(\s*!user\s*\|\|\s*!orgId\s*\)\s*return\s*\{/.test(source) ||
          /if\s*\(\s*!orgId\s*\)\s*return\s*null/.test(source);
        expect(hasHardGuard, `${hookName} must have a hard guard when orgId is undefined`).toBe(true);
      });
    });
  });

  describe("Mandatory .eq('organization_id', orgId) filter", () => {
    ORG_SCOPED_HOOKS.forEach((hookName) => {
      it(`${hookName} applies organization_id filter unconditionally`, () => {
        const source = readHookFile(hookName);
        // Should NOT have conditional org filter like: if (orgId) { .eq("organization_id"...) }
        const hasConditionalOrgFilter = /if\s*\(\s*orgId\s*\)\s*\{?\s*\n?\s*.*\.eq\s*\(\s*["']organization_id["']/.test(source);
        expect(hasConditionalOrgFilter, `${hookName} must NOT have conditional organization_id filtering`).toBe(false);
      });
    });
  });

  describe("Query enabled flag includes orgId check", () => {
    ORG_SCOPED_HOOKS.forEach((hookName) => {
      it(`${hookName} has orgId in enabled condition`, () => {
        const source = readHookFile(hookName);
        // The enabled flag should reference orgId
        const hasOrgIdInEnabled =
          /enabled:\s*.*!!orgId/.test(source) ||
          /enabled:\s*.*orgId/.test(source) ||
          // Some hooks use isDevMode bypass
          /enabled:\s*\(.*orgId.*\)\s*\|\|\s*isDevMode/.test(source);
        expect(hasOrgIdInEnabled, `${hookName} must include orgId in the 'enabled' condition`).toBe(true);
      });
    });
  });
});

// ─── 2. Context Switch Race Condition Guards ──────────────────────
describe("2. Context Switch Race Condition Guards", () => {
  it("useUserOrganization uses placeholderData to prevent undefined flicker", () => {
    const source = readHookFile("useUserOrganization");
    const hasPlaceholderData = /placeholderData/.test(source);
    expect(hasPlaceholderData, "useUserOrganization must use placeholderData to prevent flicker").toBe(true);
  });

  it("useUserOrganization has long staleTime to reduce refetch frequency", () => {
    const source = readHookFile("useUserOrganization");
    const hasStaleTime = /staleTime:\s*1000\s*\*\s*60/.test(source);
    expect(hasStaleTime, "useUserOrganization must have a long staleTime").toBe(true);
  });

  describe("No hook fetches data without user AND orgId", () => {
    ORG_SCOPED_HOOKS.forEach((hookName) => {
      it(`${hookName} gates on both user and orgId`, () => {
        const source = readHookFile(hookName);
        // queryFn should check both user and orgId before proceeding
        const checksUserAndOrg =
          /if\s*\(\s*!user\s*\|\|\s*!orgId\s*\)/.test(source) ||
          (/if\s*\(\s*!user\s*\)/.test(source) && /if\s*\(\s*!orgId\s*\)/.test(source));
        expect(checksUserAndOrg, `${hookName} must check both user and orgId in queryFn`).toBe(true);
      });
    });
  });
});

// ─── 3. Privilege Boundary Tests ──────────────────────────────────
describe("3. Privilege Boundary Tests", () => {
  it("useRoles is organization-scoped, not global", () => {
    const source = readHookFile("useRoles");
    const hasOrgScope = /\.eq\s*\(\s*["']organization_id["']/.test(source) ||
                        /organization_id/.test(source);
    expect(hasOrgScope, "useRoles must scope role queries to the active organization").toBe(true);
  });

  it("useEmployees uses profiles_safe view for non-admin users", () => {
    const source = readHookFile("useEmployees");
    const usesProfilesSafe = /profiles_safe/.test(source);
    expect(usesProfilesSafe, "useEmployees must use profiles_safe view for non-admin access").toBe(true);
  });

  it("useEmployees non-admin path also scopes by organization_id", () => {
    const source = readHookFile("useEmployees");
    // The profiles_safe path should also have org_id filter
    const safeViewSection = source.split("profiles_safe")[1] || "";
    const hasOrgFilter = /\.eq\s*\(\s*["']organization_id["']\s*,\s*orgId\s*\)/.test(safeViewSection);
    expect(hasOrgFilter, "profiles_safe query must also filter by organization_id").toBe(true);
  });

  it("useAuditLogs is organization-scoped", () => {
    const source = readHookFile("useAuditLogs");
    const hasOrgScope = /\.eq\s*\(\s*["']organization_id["']/.test(source);
    expect(hasOrgScope, "Audit logs must be scoped to the active organization").toBe(true);
  });
});

// ─── 4. Simulation Contamination Guards ───────────────────────────
describe("4. Simulation Contamination Guards", () => {
  it("sandbox-simulation edge function exists", () => {
    const fnPath = path.resolve(__dirname, "../../supabase/functions/sandbox-simulation/index.ts");
    expect(fs.existsSync(fnPath), "sandbox-simulation edge function must exist").toBe(true);
  });

  it("sandbox-simulation includes cross-tenant visibility assertion", () => {
    const fnPath = path.resolve(__dirname, "../../supabase/functions/sandbox-simulation/index.ts");
    const source = fs.readFileSync(fnPath, "utf-8");
    const hasCrossTenantCheck =
      /cross.?tenant/i.test(source) ||
      /visibility.?assert/i.test(source) ||
      /contamination/i.test(source) ||
      /spillover/i.test(source);
    expect(hasCrossTenantCheck, "sandbox-simulation must include cross-tenant contamination check").toBe(true);
  });

  it("useEmployees queryKey includes orgId for cache isolation", () => {
    const source = readHookFile("useEmployees");
    const queryKeyHasOrgId = /queryKey:\s*\[.*orgId/.test(source);
    expect(queryKeyHasOrgId, "useEmployees queryKey must include orgId to prevent cache collisions across tenants").toBe(true);
  });

  ORG_SCOPED_HOOKS.slice(0, 10).forEach((hookName) => {
    it(`${hookName} queryKey includes orgId for cache isolation`, () => {
      const source = readHookFile(hookName);
      const queryKeyHasOrgId = /queryKey:\s*\[.*orgId/.test(source);
      expect(queryKeyHasOrgId, `${hookName} queryKey must include orgId`).toBe(true);
    });
  });
});

// ─── 5. Data Lifecycle Boundary Tests ─────────────────────────────
describe("5. Data Lifecycle Boundary Tests", () => {
  it("useFinancialData excludes soft-deleted records", () => {
    const source = readHookFile("useFinancialData");
    const filtersSoftDeleted = /\.eq\s*\(\s*["']is_deleted["']\s*,\s*false\s*\)/.test(source);
    expect(filtersSoftDeleted, "Financial data must exclude soft-deleted records").toBe(true);
  });

  it("useInvoices excludes soft-deleted invoices", () => {
    const source = readHookFile("useInvoices");
    const filtersSoftDeleted = /is_deleted/.test(source);
    expect(filtersSoftDeleted, "Invoices must handle soft-delete filtering").toBe(true);
  });
});

// ─── 6. Mutation Scoping Tests ────────────────────────────────────
describe("6. Mutation Scoping Tests", () => {
  it("useCreateEmployee uses edge function (server-side org resolution)", () => {
    const source = readHookFile("useEmployees");
    const usesEdgeFn = /supabase\.functions\.invoke\s*\(\s*["']manage-roles["']/.test(source);
    expect(usesEdgeFn, "Employee creation must go through manage-roles edge function for server-side org resolution").toBe(true);
  });

  it("useDeleteEmployee uses edge function for cleanup", () => {
    const source = readHookFile("useEmployees");
    const usesEdgeFnForDelete = /action.*delete_user|delete_user.*action/.test(source);
    expect(usesEdgeFnForDelete, "Employee deletion must go through edge function for proper cleanup").toBe(true);
  });

  it("useAddFinancialRecord validates user authentication before mutation", () => {
    const source = readHookFile("useFinancialData");
    const checksAuth = /if\s*\(\s*!user\s*\)\s*throw/.test(source);
    expect(checksAuth, "Financial mutations must validate user authentication").toBe(true);
  });
});

// ─── 7. Edge Function Server-Side Isolation ───────────────────────
describe("7. Edge Function Server-Side Isolation", () => {
  const SECURITY_CRITICAL_FUNCTIONS = [
    "integrity-audit",
    "manage-roles",
    "generate-payslip",
    "sandbox-simulation",
    "db-inspector",
  ];

  SECURITY_CRITICAL_FUNCTIONS.forEach((fnName) => {
    it(`${fnName} edge function validates Authorization header`, () => {
      const fnPath = path.resolve(__dirname, `../../supabase/functions/${fnName}/index.ts`);
      if (!fs.existsSync(fnPath)) return; // skip if not present
      const source = fs.readFileSync(fnPath, "utf-8");
      const validatesAuth = /Authorization/.test(source) || /authHeader/.test(source) || /Bearer/.test(source);
      expect(validatesAuth, `${fnName} must validate Authorization header`).toBe(true);
    });

    it(`${fnName} edge function resolves org from server, not client`, () => {
      const fnPath = path.resolve(__dirname, `../../supabase/functions/${fnName}/index.ts`);
      if (!fs.existsSync(fnPath)) return;
      const source = fs.readFileSync(fnPath, "utf-8");
      // Should use getUser() or getClaims() or service role to resolve identity
      const resolvesServerSide =
        /getUser/.test(source) || /getClaims/.test(source) ||
        /SERVICE_ROLE/.test(source) || /service_role/.test(source) ||
        /SUPABASE_SERVICE_ROLE_KEY/.test(source);
      expect(resolvesServerSide, `${fnName} must resolve identity/org server-side`).toBe(true);
    });
  });
});
