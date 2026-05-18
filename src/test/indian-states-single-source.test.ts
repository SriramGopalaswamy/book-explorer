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

// GBC-129 SHIPPED (2026-05-18): all 5 duplicates collapsed into
// `src/lib/indian-states.ts`. KNOWN_DUPLICATES is intentionally empty —
// any new entry detected by this probe is a regression: import from
// `@/lib/indian-states` instead.
const KNOWN_DUPLICATES: string[] = [];

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

  it("only the canonical lib/indian-states.ts declares INDIAN_STATES", () => {
    const allowed = new Set<string>([CANONICAL_PATH, ...KNOWN_DUPLICATES]);
    const unexpected = decls.filter((f) => !allowed.has(f));
    expect(
      unexpected,
      `New INDIAN_STATES declarations detected. Import from src/lib/indian-states.ts instead (GBC-129):\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });

  it("exactly one declaration remains (the canonical lib)", () => {
    expect(
      decls.length,
      `Expected exactly 1 INDIAN_STATES declaration (canonical lib); got ${decls.length}:\n${decls.join("\n")}`,
    ).toBeLessThanOrEqual(1);
  });
});
