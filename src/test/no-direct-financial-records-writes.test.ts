/**
 * P-9 — No direct writes to `financial_records` from frontend code.
 *
 * Per CLAUDE.md "financial_records write rule (item 23)":
 *   `financial_records` rows with a non-null `journal_entry_id` are owned by the
 *   trigger `trg_sync_financial_records`. Application code must not write to
 *   these rows directly; only the canonical `journal_lines` path is allowed.
 *
 * This is a STATIC-TEXT scan. The Wave-1 baseline probe was a single-line
 * regex that missed chained calls split across lines (e.g. `useAssets.ts:413`
 * formatted `.from("financial_records")\n.insert([...])`). This file uses
 * a multi-line pattern (`[\s\S]{0,400}?`) so chained calls are caught.
 *
 * Invariants:
 *   - No `supabase.from("financial_records").(insert|update|upsert)` chain
 *     anywhere under `src/`.
 *   - Inserts must route through journal_lines; the trigger projects.
 *
 * Surfaces: GBC-124 (asset depreciation) + NEW-1 (Accounting screen create/edit)
 *           from the 2026-05-18 in-progress backlog audit.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");

/**
 * Known offenders as of 2026-05-18 — each must become a Jira ticket OR be
 * migrated to the canonical journal_lines path before its allowlist entry
 * is removed. Format: { file (relative to src/), pattern (line number of
 * the .from call, kept loose to survive small edits), ticket }.
 */
const EXPECTED_OFFENDERS: Array<{ file: string; ticket: string }> = [
  // GBC-124 — asset depreciation, "non-critical" GL post that bypasses journal_lines.
  { file: "hooks/useAssets.ts", ticket: "GBC-124" },
  // NEW-1 — useFinancialData create/update path for the Accounting screen.
  // Surfaced during the 2026-05-18 Wave-1 probe; not yet ticketed.
  { file: "hooks/useFinancialData.ts", ticket: "NEW-1" },
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

// Multi-line: from("financial_records") within 400 chars of .insert/.update/.upsert.
const FR_WRITE_REGEX =
  /from\(\s*["'`]financial_records["'`]\s*\)[\s\S]{0,400}?\.(insert|update|upsert)\b/g;

describe("P-9 — no direct financial_records writes from src/", () => {
  const offenders: Array<{ file: string; index: number }> = [];

  for (const file of walk(SRC_DIR)) {
    // Skip the test itself.
    if (file.endsWith("no-direct-financial-records-writes.test.ts")) continue;
    const src = fs.readFileSync(file, "utf8");
    const matches = src.matchAll(FR_WRITE_REGEX);
    for (const m of matches) {
      offenders.push({
        file: path.relative(SRC_DIR, file),
        index: m.index ?? -1,
      });
    }
  }

  const offenderFiles = new Set(offenders.map((o) => o.file));
  const expectedFiles = new Set(EXPECTED_OFFENDERS.map((e) => e.file));

  it("every offender is on the expected-offenders allowlist", () => {
    const unexpected = [...offenderFiles].filter((f) => !expectedFiles.has(f));
    expect(
      unexpected,
      `Unexpected direct financial_records writes (must route through journal_lines per CLAUDE.md item 23):\n${unexpected.join(
        "\n"
      )}`
    ).toEqual([]);
  });

  it("every allowlist entry still has an offending write (otherwise remove it)", () => {
    const stale = [...expectedFiles].filter((f) => !offenderFiles.has(f));
    expect(
      stale,
      `Stale EXPECTED_OFFENDERS entries (offender no longer present — remove from list):\n${stale.join(
        "\n"
      )}`
    ).toEqual([]);
  });
});
