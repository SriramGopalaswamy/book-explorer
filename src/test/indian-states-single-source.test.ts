/**
 * P-14 — INDIAN_STATES must have a single source of truth.
 *
 * Per GBC-129: place-of-supply tax classification compares user-typed state
 * names against the org's state. The Wave-1 audit found four independent
 * declarations of `INDIAN_STATES` across the codebase, two with different
 * shapes (`string[]` vs `{code, name}[]`). When GBC-129 ships the canonical
 * enum (`src/lib/indian-states.ts`), this test guarantees the duplicates
 * do not silently regrow.
 *
 * NOTE on regex: the Wave-1 baseline used `INDIAN_STATES\s*=` which misses
 * TypeScript-typed declarations like `const INDIAN_STATES: {code; name}[] = [...]`
 * (because `: { ... }[]` separates the identifier from `=`). This test uses
 * `INDIAN_STATES\b[^=\n]*=` which tolerates type annotations.
 *
 * Surfaces: GBC-129 from the 2026-05-18 in-progress backlog audit.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");

const CANONICAL_PATH = "lib/indian-states.ts";

const KNOWN_DUPLICATES = [
  "components/onboarding/steps/EntityIdentityStep.tsx",
  "hooks/useStateLeaveRules.ts",
  "pages/financial/EInvoices.tsx",
  "pages/financial/EwayBills.tsx",
  "pages/inventory/Warehouses.tsx",
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

// Matches `const INDIAN_STATES …=` regardless of TypeScript type annotation
// between the identifier and `=`.
const DECL_REGEX = /\bINDIAN_STATES\b[^=\n]*=/;

describe("P-14 — INDIAN_STATES single source", () => {
  const decls: string[] = [];

  for (const file of walk(SRC_DIR)) {
    if (file.endsWith("indian-states-single-source.test.ts")) continue;
    const src = fs.readFileSync(file, "utf8");
    if (DECL_REGEX.test(src)) decls.push(path.relative(SRC_DIR, file));
  }

  it("exactly one module declares INDIAN_STATES (or, until GBC-129 ships, only the known duplicates)", () => {
    // Goal state: only `lib/indian-states.ts`.
    // Today's state: the four known duplicates. Loosen the test only as much
    // as today's reality demands — anything new must be rejected.
    const knownAndCanonical = new Set<string>([CANONICAL_PATH, ...KNOWN_DUPLICATES]);
    const unexpected = decls.filter((f) => !knownAndCanonical.has(f));
    expect(
      unexpected,
      `New INDIAN_STATES declarations detected. Import from src/lib/indian-states.ts instead (GBC-129):\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("at most 5 known declarations remain until GBC-129 fix lands", () => {
    expect(
      decls.length,
      `Expected ≤ 5 INDIAN_STATES declarations (GBC-129 duplicates); got ${decls.length}:\n${decls.join("\n")}`
    ).toBeLessThanOrEqual(5);
  });
});
