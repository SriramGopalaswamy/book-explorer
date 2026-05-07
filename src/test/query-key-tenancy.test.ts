/**
 * GBC-28 — React Query queryKey tenancy regression guard.
 *
 * This is a STATIC-TEXT scan, not an AST parse. See top-of-file caveat in
 * src/test/storage-bucket-policy.test.ts and security-definer-search-path.test.ts
 * for the broader limitations of regex-based source inspection. The structural
 * fix is to walk the TS AST via @typescript-eslint/parser; until that lands,
 * this file uses heuristics that distinguish a queryKey IN A useQuery
 * declaration (must be tenant-scoped) from a queryKey in an
 * invalidateQueries / removeQueries / setQueryData / cancelQueries call
 * (allowed to omit orgId because React Query prefix-matches).
 *
 * Invariants:
 *   - GLOBAL_QUERY_NAMES are allowed to omit orgId in declarations.
 *   - ORG_SCOPED_QUERY_NAMES must include the token `orgId` in their
 *     queryKey when they appear inside a useQuery / useInfiniteQuery /
 *     useSuspenseQuery declaration.
 *   - EXPECTED_OFFENDERS is empty as of the GBC-28 punch-list fix.
 *     Any new entry signals a regression.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const HOOKS_DIR = path.resolve(__dirname, "../hooks");

const GLOBAL_QUERY_NAMES = new Set<string>([
  "currencies",
  "tax-regimes",
  "tax-slabs",
]);

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

// Currently-known offenders. Empty as of the GBC-28 punch-list fix; an entry
// reappearing here means a hook was reverted or a new hook author skipped orgId.
const EXPECTED_OFFENDERS = new Set<string>([]);

interface Finding {
  hookFile: string;
  name: string;
  rest: string;
  // True iff the queryKey lexically appears inside a useQuery/useInfiniteQuery/
  // useSuspenseQuery declaration (not an invalidateQueries / setQueryData call).
  inDeclaration: boolean;
}

const QUERY_KEY_REGEX =
  /queryKey\s*:\s*\[\s*["']([a-zA-Z][\w-]*)["']\s*([^\]]*)\]/g;

// Heuristic: walk back from the queryKey occurrence until we find the nearest
// enclosing `<identifier>(` token. If that identifier is one of the React-Query
// declaration hooks, treat the queryKey as a declaration. Otherwise it's an
// invalidation / cache poke and is allowed to omit orgId.
const DECLARATION_CALLEES = /\b(useQuery|useInfiniteQuery|useSuspenseQuery|useSuspenseInfiniteQuery)\s*\(/;

function classifyQueryKeyContext(src: string, atIndex: number): boolean {
  // Look at the 800 chars preceding the queryKey occurrence; find the most
  // recent `<ident>(` token. (800 covers hook bodies in this codebase.)
  const start = Math.max(0, atIndex - 800);
  const window = src.slice(start, atIndex);
  // Find the LAST callee opener in the window
  const calleeRegex = /\b(\w+)\s*\(/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = calleeRegex.exec(window)) !== null) {
    last = m;
  }
  if (!last) return false;
  return DECLARATION_CALLEES.test(last[0]);
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
      findings.push({
        hookFile: f,
        name: m[1],
        rest: m[2],
        inDeclaration: classifyQueryKeyContext(src, m.index),
      });
    }
  }
  return findings;
}

describe("GBC-28: queryKey must include orgId for org-scoped hook declarations", () => {
  const findings = scanHooks();
  const declarations = findings.filter((f) => f.inDeclaration);

  it("found a meaningful number of useQuery declarations", () => {
    expect(declarations.length).toBeGreaterThan(20);
  });

  it("the heuristic classifies at least some occurrences as non-declarations (invalidations etc.)", () => {
    const nonDecl = findings.filter((f) => !f.inDeclaration);
    expect(nonDecl.length).toBeGreaterThan(5);
  });

  it("global query names never include orgId in declarations", () => {
    const violations = declarations.filter(
      (f) => GLOBAL_QUERY_NAMES.has(f.name) && /\borgId\b/.test(f.rest),
    );
    expect(
      violations,
      `global queries should not include orgId in queryKey: ${violations
        .map((v) => `${v.hookFile}:${v.name}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("org-scoped query name DECLARATIONS include orgId — except known offenders", () => {
    const offendersDetected = new Set<string>();
    for (const f of declarations) {
      if (!ORG_SCOPED_QUERY_NAMES.has(f.name)) continue;
      const hasOrgId = /\borgId\b|\borganizationId\b/.test(f.rest);
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
      const stillBroken = declarations.some(
        (f) => f.name === name && !/\borgId\b|\borganizationId\b/.test(f.rest),
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
