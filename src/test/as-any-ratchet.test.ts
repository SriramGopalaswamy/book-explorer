/**
 * P-10 — `as any` ratchet.
 *
 * The codebase has 621 `as any` escape hatches across 109 files in src/hooks
 * + src/pages (2026-05-18 baseline). Most are workarounds for the un-typed
 * Supabase client (GBC-19/26 foundation). Until the client is parameterised
 * with `Database` types, the population can only decrease, never grow.
 *
 * This test enforces a per-file ratchet against `as-any-baseline.json`:
 *   - A file's count MUST be ≤ its baseline.
 *   - A file's count CAN be < its baseline (good — ratchet down).
 *   - A new file (not in baseline) MUST have 0 occurrences (no new `as any`).
 *
 * To intentionally ratchet down: update `as-any-baseline.json` to the new
 * lower value as part of the same PR that removed the casts. To remove a
 * file entirely: drop the key when its count hits 0.
 *
 * Surfaces: GBC-94 (Banking bulk upload) + the systemic GBC-19/26 typed-
 * client gap. Top offenders: useDocumentChains.ts (48), Invoicing.tsx (42),
 * useWarehouse.ts (40), useReturns.ts (32) — all primary sites for the
 * 2026-05-18 in-progress backlog.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");
const BASELINE_PATH = path.resolve(__dirname, "as-any-baseline.json");
const SCAN_ROOTS = ["hooks", "pages"];

const baseline: Record<string, number> = JSON.parse(
  fs.readFileSync(BASELINE_PATH, "utf8")
);

const AS_ANY_REGEX = /\bas\s+any\b/g;

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
      const matches = src.match(AS_ANY_REGEX);
      if (matches && matches.length > 0) {
        counts[path.relative(SRC_DIR, file)] = matches.length;
      }
    }
  }
  return counts;
}

describe("P-10 — `as any` ratchet", () => {
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
      `New \`as any\` usage detected. Use the typed Supabase client (Database["public"]["Tables"][T]["Insert"]) instead. Files that grew vs baseline:\n${regressions.join("\n")}`
    ).toEqual([]);
  });

  it("no new file introduces `as any`", () => {
    const newFiles = Object.keys(current).filter((f) => !(f in baseline));
    expect(
      newFiles,
      `New files contain \`as any\` casts. Add typed alternatives or use generated Supabase types:\n${newFiles.map((f) => `  ${f}: ${current[f]}`).join("\n")}`
    ).toEqual([]);
  });

  it("baseline entries are not stale (file removed but key remains)", () => {
    const stale: string[] = [];
    for (const file of Object.keys(baseline)) {
      const full = path.join(SRC_DIR, file);
      if (!fs.existsSync(full)) stale.push(file);
    }
    expect(
      stale,
      `Baseline references files that no longer exist — remove these entries from as-any-baseline.json:\n${stale.join("\n")}`
    ).toEqual([]);
  });

  it("baseline entries that hit zero have been removed", () => {
    const zeroed: string[] = [];
    for (const [file, baselineCount] of Object.entries(baseline)) {
      const cur = current[file] ?? 0;
      if (baselineCount > 0 && cur === 0) zeroed.push(`${file} (baseline=${baselineCount})`);
    }
    expect(
      zeroed,
      `These files have reached 0 \`as any\` — congratulations! Remove their entries from as-any-baseline.json to lock in the win:\n${zeroed.join("\n")}`
    ).toEqual([]);
  });
});
