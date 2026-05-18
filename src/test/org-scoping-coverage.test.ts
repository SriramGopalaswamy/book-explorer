/**
 * P-6 — Org-scoping coverage for high-risk tables.
 *
 * Per GBC-115 and GBC-130: many `supabase.from(<table>)` chains in FE code
 * filter by `id` / `user_id` / `manager_id` but skip `organization_id`. RLS
 * usually saves us, but (a) admin/finance roles often bypass RLS via
 * `is_super_admin()` checks, and (b) `auth.uid()` may span multiple orgs.
 * Every access to a tenant-sensitive table from FE code MUST either include
 * `.eq("organization_id", …)` or `organization_id:` (insert body).
 *
 * STATIC-TEXT scan with a 800-char look-ahead window. Per-file ratchet
 * against `src/test/org-scoping-baseline.json` (same shape as the `as any`
 * ratchet). High-risk table list is curated — adding a new table forces a
 * baseline refresh.
 *
 * Invariants:
 *   - No file exceeds its baseline count.
 *   - No new file introduces a high-risk-table access without org scoping.
 *   - Baseline keys that hit 0 must be removed (forces locking in wins).
 *
 * Surfaces: GBC-115 (HR/Payroll), GBC-130 (sparkline, audit-intelligence,
 * employees) — plus the systemic Pattern D from gbc-audit/_SUMMARY.md.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");
const BASELINE_PATH = path.resolve(__dirname, "org-scoping-baseline.json");
const SCAN_ROOTS = ["hooks", "pages"];

/**
 * High-risk tables: any FE access must scope by `organization_id` in the
 * surrounding 800 chars. Curated from the architecture + council findings.
 * Adding a table here requires regenerating the baseline.
 */
const HIGH_RISK_TABLES = [
  // Financial ledger
  "financial_records",
  "journal_lines",
  "journal_entries",
  "gl_accounts",
  // Payroll
  "payroll_runs",
  "payroll_entries",
  "payroll_records",
  // User / HR
  "profiles",
  "compensation_components",
  "compensation_structures",
  "goal_plans",
  // Inventory master
  "items",
  // Audit pipeline (cross-tenant leak via run_id only — GBC-130)
  "audit_compliance_checks",
  "audit_ai_anomalies",
  "audit_risk_themes",
  "audit_ai_samples",
  "audit_ai_narratives",
  "audit_ifc_assessments",
  // Leave / attendance
  "leave_requests",
  "leave_balances",
];

const baseline: Record<string, number> = JSON.parse(
  fs.readFileSync(BASELINE_PATH, "utf8")
);

const tableRe = new RegExp(
  `from\\(\\s*["'\`](${HIGH_RISK_TABLES.join("|")})["'\`]\\s*\\)`,
  "g"
);

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !full.includes("__tests__")
    ) {
      yield full;
    }
  }
}

function currentCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of SCAN_ROOTS) {
    const rootDir = path.join(SRC_DIR, root);
    if (!fs.existsSync(rootDir)) continue;
    for (const file of walk(rootDir)) {
      const src = fs.readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      tableRe.lastIndex = 0;
      let hits = 0;
      while ((m = tableRe.exec(src)) !== null) {
        const window = src.slice(m.index, m.index + 800);
        if (!/organization_id/.test(window)) hits++;
      }
      if (hits > 0) counts[path.relative(SRC_DIR, file)] = hits;
    }
  }
  return counts;
}

describe("P-6 — org-scoping coverage on high-risk tables", () => {
  const current = currentCounts();

  it("no file exceeds its baseline count", () => {
    const regressions: string[] = [];
    for (const [file, count] of Object.entries(current)) {
      const baselineCount = baseline[file] ?? 0;
      if (count > baselineCount) {
        regressions.push(
          `  ${file}: ${baselineCount} → ${count} (+${count - baselineCount})`
        );
      }
    }
    expect(
      regressions,
      `New unscoped high-risk-table access detected. Each access must include \`.eq("organization_id", …)\` (or \`organization_id:\` in an insert body) within 800 chars of the .from() call. See gbc-audit/_SUMMARY.md Pattern D.\n${regressions.join("\n")}`
    ).toEqual([]);
  });

  it("no new file introduces an unscoped high-risk access", () => {
    const newFiles = Object.keys(current).filter((f) => !(f in baseline));
    expect(
      newFiles,
      `New files access high-risk tables without org scoping:\n${newFiles.map((f) => `  ${f}: ${current[f]}`).join("\n")}`
    ).toEqual([]);
  });

  it("baseline entries reference files that still exist", () => {
    const stale: string[] = [];
    for (const file of Object.keys(baseline)) {
      const full = path.join(SRC_DIR, file);
      if (!fs.existsSync(full)) stale.push(file);
    }
    expect(
      stale,
      `Baseline references files that no longer exist — remove these entries from org-scoping-baseline.json:\n${stale.join("\n")}`
    ).toEqual([]);
  });

  it("baseline entries that hit zero have been removed", () => {
    const zeroed: string[] = [];
    for (const [file, baselineCount] of Object.entries(baseline)) {
      const cur = current[file] ?? 0;
      if (baselineCount > 0 && cur === 0) {
        zeroed.push(`${file} (baseline=${baselineCount})`);
      }
    }
    expect(
      zeroed,
      `These files have reached 0 unscoped accesses — congratulations! Remove their entries from org-scoping-baseline.json:\n${zeroed.join("\n")}`
    ).toEqual([]);
  });
});
