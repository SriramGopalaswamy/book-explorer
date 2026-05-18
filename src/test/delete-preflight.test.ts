/**
 * P-13 — Page-level delete mutations require a dependency preflight.
 *
 * Per GBC-91: page-level "Delete" buttons that call `supabase.from(T).delete()`
 * without first checking for linked records expose users to raw Postgres FK
 * jargon ("update or delete violates foreign key constraint"). The canonical
 * pattern is `Customers.tsx` — runs parallel `select("id").limit(1)` preflights
 * against every linked table and throws a friendly error before attempting
 * the delete.
 *
 * STATIC-TEXT scan: extracts the body of every top-level
 * `const deleteMutation = useMutation({` block in `src/pages/<area>/<Page>.tsx`
 * and asserts the body contains a preflight signal.
 *
 * Surfaces: GBC-91 (Vendors) plus 5 sibling files (VendorCredits, Quotes,
 * CreditNotes, Expenses, Bills) flagged by the 2026-05-18 Wave-2 probe-
 * validation pass. Each must adopt the Customers.tsx pattern.
 *
 * NOTE: deletes inside hooks (rollback paths, cascade clean-ups) are out of
 * scope — they typically run inside a try/catch and aren't user-facing.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");
const PAGES_DIR = path.join(SRC_DIR, "pages");

/**
 * Known offenders today. Each has a tracking ticket; remove from the list
 * when the file adopts the Customers.tsx preflight pattern (in the same PR).
 */
const EXPECTED_OFFENDERS: Record<string, string> = {
  "pages/financial/Vendors.tsx": "GBC-91",
  "pages/financial/VendorCredits.tsx": "GBC-91-sibling",
  "pages/financial/Quotes.tsx": "GBC-91-sibling",
  "pages/financial/CreditNotes.tsx": "GBC-91-sibling",
  "pages/financial/Expenses.tsx": "GBC-91-sibling",
  "pages/financial/Bills.tsx": "GBC-91-sibling",
};

const DELETE_MUTATION_HEADER = /const deleteMutation = useMutation\(\{/;
const DELETE_MUTATION_BLOCK =
  /const deleteMutation = useMutation\(\{[\s\S]{0,2500}?\n  \}\);/g;

/**
 * A "preflight" is any of:
 *   - Promise.all([...select(...).limit(1)...])
 *   - a chain `.select("id"...).eq(...).limit(1)` (before the .delete())
 *   - `.select("...", { count: "exact", head: true })`
 *   - explicit EXISTS query
 */
const PREFLIGHT_SIGNALS = [
  /Promise\.all\(/,
  /\.select\([^)]{0,40}\)\.eq\([^)]{0,80}\)\.limit\(1\)/,
  /count:\s*["\x27]exact["\x27]/,
  /EXISTS/,
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      yield full;
    }
  }
}

describe("P-13 — page-level delete preflight", () => {
  const filesWithDeleteMutation: string[] = [];
  const naked: string[] = [];

  for (const file of walk(PAGES_DIR)) {
    const src = fs.readFileSync(file, "utf8");
    if (!DELETE_MUTATION_HEADER.test(src)) continue;
    const rel = path.relative(SRC_DIR, file);
    filesWithDeleteMutation.push(rel);
    const blocks = src.match(DELETE_MUTATION_BLOCK) ?? [];
    const hasPreflight = blocks.some((block) =>
      PREFLIGHT_SIGNALS.some((sig) => sig.test(block))
    );
    if (!hasPreflight) naked.push(rel);
  }

  it("every page deleteMutation either has a preflight or is on the allowlist", () => {
    const unexpected = naked.filter((f) => !(f in EXPECTED_OFFENDERS));
    expect(
      unexpected,
      `Page-level deleteMutation without dependency preflight. Mirror the Customers.tsx pattern (Promise.all of select.limit(1) checks) before the .delete():\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("every allowlist entry still has a naked deleteMutation (otherwise remove it)", () => {
    const stale = Object.keys(EXPECTED_OFFENDERS).filter((f) => !naked.includes(f));
    expect(
      stale,
      `Stale EXPECTED_OFFENDERS entries — these files now have a preflight, remove them from the allowlist:\n${stale.join("\n")}`
    ).toEqual([]);
  });
});
