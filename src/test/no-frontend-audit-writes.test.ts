/**
 * P-8 — No `audit_logs.insert` from frontend code.
 *
 * Per GBC-114: audit log writes from the browser are bypassable via DevTools
 * (the user can skip the code path that writes the audit row). All audit
 * entries must come from DB triggers or SECURITY DEFINER RPCs.
 *
 * STATIC-TEXT scan, multi-line aware. Catches both:
 *   - `supabase.from("audit_logs").insert(...)`
 *   - `(supabase.from("audit_logs") as any).insert(...)`
 *
 * Invariants:
 *   - Zero matches outside the EXPECTED_OFFENDERS allowlist.
 *   - Each allowlist entry must reference its remediation ticket
 *     (DB trigger to add, or DEFINER RPC to call instead).
 *
 * Surfaces: GBC-114 from the 2026-05-18 in-progress backlog audit.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");

/**
 * 13 known offenders across 8 files as of 2026-05-18 (matches GBC-114
 * description exactly).  Each must migrate to a trigger/RPC.
 */
const EXPECTED_OFFENDERS: Array<{ file: string; ticket: string; note: string }> =
  [
    {
      file: "pages/hrms/MyAttendance.tsx",
      ticket: "GBC-114",
      note: "attendance correction submit — convert to submit_attendance_correction RPC",
    },
    {
      file: "pages/hrms/ManagerInbox.tsx",
      ticket: "GBC-114",
      note: "attendance correction approve/reject — convert to review_attendance_correction RPC",
    },
    {
      file: "hooks/useCompensationRevisions.ts",
      ticket: "GBC-114",
      note: "compensation revision — add AFTER UPDATE trigger on compensation_structures",
    },
    {
      file: "hooks/usePayslipDisputes.ts",
      ticket: "GBC-114",
      note: "payslip dispute lifecycle — add AFTER INSERT/UPDATE trigger on payslip_disputes",
    },
    {
      file: "hooks/usePlatformOps.ts",
      ticket: "GBC-114",
      note: "platform ops — wrap in log_platform_action DEFINER RPC",
    },
    {
      file: "hooks/usePayrollApproval.ts",
      ticket: "GBC-114",
      note: "payroll approval — add payroll_runs status trigger",
    },
    {
      file: "hooks/usePayrollExports.ts",
      ticket: "GBC-114",
      note: "payroll export — rewire to record_export() RPC (T5 shipped)",
    },
    {
      file: "hooks/useLeaves.ts",
      ticket: "GBC-114",
      note: "leaves — DB trigger exists per GBC-16; delete this redundant insert",
    },
  ];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

// Catches both bare `.from("audit_logs").insert` and `(... as any).insert` forms.
// Multi-line tolerant — `[\s\S]{0,200}?` between the from() and .insert().
const AUDIT_INSERT_REGEX =
  /from\(\s*["'`]audit_logs["'`]\s*\)(?:\s*as\s+any\s*\))?[\s\S]{0,200}?\.insert\b/g;

describe("P-8 — no audit_logs.insert from src/", () => {
  const offenders: Array<{ file: string }> = [];

  for (const file of walk(SRC_DIR)) {
    if (file.endsWith("no-frontend-audit-writes.test.ts")) continue;
    const src = fs.readFileSync(file, "utf8");
    const matches = src.matchAll(AUDIT_INSERT_REGEX);
    for (const _ of matches) {
      offenders.push({ file: path.relative(SRC_DIR, file) });
    }
  }

  const offenderFiles = new Set(offenders.map((o) => o.file));
  const expectedFiles = new Set(EXPECTED_OFFENDERS.map((e) => e.file));

  it("every offender is on the expected-offenders allowlist", () => {
    const unexpected = [...offenderFiles].filter((f) => !expectedFiles.has(f));
    expect(
      unexpected,
      `Unexpected audit_logs.insert from frontend (must route through DB trigger or SECURITY DEFINER RPC per GBC-114):\n${unexpected.join(
        "\n"
      )}`
    ).toEqual([]);
  });

  it("every allowlist entry still has an offending insert (otherwise remove it)", () => {
    const stale = [...expectedFiles].filter((f) => !offenderFiles.has(f));
    expect(
      stale,
      `Stale EXPECTED_OFFENDERS entries:\n${stale.join("\n")}`
    ).toEqual([]);
  });
});
