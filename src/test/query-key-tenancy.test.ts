/**
 * GBC-28 — React Query queryKey tenancy regression guard.
 *
 * For every src/hooks/use*.ts file:
 *   - GLOBAL_QUERY_NAMES are allowed to omit `orgId`.
 *   - ORG_SCOPED_QUERY_NAMES must include the token `orgId` in their
 *     `queryKey` array literal.
 *   - EXPECTED_OFFENDERS is a curated list of names that *should* be
 *     org-scoped but currently aren't. The test passes today because of this
 *     allowlist; when an offender is fixed, the fixer must remove its entry
 *     from EXPECTED_OFFENDERS so the test stays green. That makes this file
 *     a self-cleaning punch-list.
 *
 * Adding a new hook with an org-scoped name and no orgId in its queryKey
 * fails the test. Adding a new global lookup that doesn't take orgId
 * requires extending GLOBAL_QUERY_NAMES.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const HOOKS_DIR = path.resolve(__dirname, "../hooks");

// Names that are TENANT-GLOBAL (statutory/reference data, not org-scoped).
// These MAY appear in a queryKey without `orgId`.
const GLOBAL_QUERY_NAMES = new Set<string>([
  "currencies",
  "tax-regimes",
  "tax-slabs",
]);

// Names that are ORG-SCOPED. queryKey arrays must include `orgId`.
// (Sourced from a grep of `queryKey:` across src/hooks/*.ts; expand as new
// hooks are added.)
const ORG_SCOPED_QUERY_NAMES = new Set<string>([
  "sales-returns",
  "purchase-returns",
  "dashboard-stats",
  "leave-requests",
  "my-leave-requests",
  "leave-balances",
  "holidays",
  "items",
  "warehouses",
  "stock-ledger",
  "stock-adjustments",
  "uom",
  "reorder-alerts",
  "exchange-rates",
  "recurring-transactions",
  "payment-receipts",
  "vendor-payments",
  "itc-reconciliation",
  "form16",
  "form16a",
  "leave-types",
  "leave-types-all",
  "gst-filing-status",
  "payroll-analytics",
  "gstr1",
  "gstr3b",
  "tds24q",
  "tds26q",
  "pf_ecr",
  "esi",
  "prof_tax",
  "employee-tax-settings",
  "investment-declarations",
  "org-has-transactions",
]);

// Currently-known offenders. Each entry must be removed when the underlying
// hook is fixed to include orgId. Empty as of the GBC-28 punch-list fix.
const EXPECTED_OFFENDERS = new Set<string>([]);

const QUERY_KEY_REGEX =
  /queryKey\s*:\s*\[\s*["']([a-zA-Z][\w-]*)["']\s*([^\]]*)\]/g;

interface Finding {
  hookFile: string;
  name: string;
  rest: string;
}

function scanHooks(): Finding[] {
  const findings: Finding[] = [];
  for (const f of fs.readdirSync(HOOKS_DIR)) {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
    const filePath = path.join(HOOKS_DIR, f);
    if (fs.statSync(filePath).isDirectory()) continue;
    const src = fs.readFileSync(filePath, "utf-8");
    let m: RegExpExecArray | null;
    QUERY_KEY_REGEX.lastIndex = 0;
    while ((m = QUERY_KEY_REGEX.exec(src)) !== null) {
      findings.push({ hookFile: f, name: m[1], rest: m[2] });
    }
  }
  return findings;
}

describe("GBC-28: queryKey must include orgId for org-scoped hooks", () => {
  const findings = scanHooks();

  it("found queryKey usages to inspect", () => {
    expect(findings.length).toBeGreaterThan(40);
  });

  it("global query names never include orgId (would cause needless cache misses)", () => {
    const violations = findings.filter(
      (f) => GLOBAL_QUERY_NAMES.has(f.name) && /\borgId\b/.test(f.rest),
    );
    expect(
      violations,
      `global queries should not include orgId in queryKey: ${violations
        .map((v) => `${v.hookFile}:${v.name}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("org-scoped query names include orgId — except known offenders", () => {
    const offendersDetected = new Set<string>();
    for (const f of findings) {
      if (!ORG_SCOPED_QUERY_NAMES.has(f.name)) continue;
      const hasOrgId = /\borgId\b/.test(f.rest);
      if (!hasOrgId) offendersDetected.add(f.name);
    }
    const surprise = [...offendersDetected].filter(
      (n) => !EXPECTED_OFFENDERS.has(n),
    );
    expect(
      surprise,
      `new org-scoped queryKey is missing orgId: ${surprise.join(", ")}. ` +
        "Either add orgId to the queryKey, or — if this name is intentionally " +
        "global — move it to GLOBAL_QUERY_NAMES.",
    ).toEqual([]);
  });

  it("EXPECTED_OFFENDERS does not list names that have already been fixed", () => {
    const fixedButStillListed: string[] = [];
    for (const name of EXPECTED_OFFENDERS) {
      const stillBroken = findings.some(
        (f) => f.name === name && !/\borgId\b/.test(f.rest),
      );
      if (!stillBroken) fixedButStillListed.push(name);
    }
    expect(
      fixedButStillListed,
      `${fixedButStillListed.join(", ")} no longer appears as an offender — ` +
        "remove it from EXPECTED_OFFENDERS to keep the punch-list accurate.",
    ).toEqual([]);
  });
});
