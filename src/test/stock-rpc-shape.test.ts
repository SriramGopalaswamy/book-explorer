/**
 * P-12 — Stock RPC shape: SECURITY DEFINER + pinned search_path.
 *
 * Per the audit methodology Phase 5: every stock-mutating RPC must be
 * SECURITY DEFINER with `SET search_path` pinned to `public`. Without
 * search_path pinning, a search-path-injection attack via shadowed
 * functions can hijack the call (the historical GBC-6 class).
 *
 * STATIC-TEXT scan over `supabase/migrations/*.sql`. For each RPC, locate
 * its latest definition (last file in chronological order whose body
 * matches `CREATE FUNCTION <name>`) and assert:
 *   - the body contains `SECURITY DEFINER`
 *   - the body contains `SET search_path = public` (or `= public, ...`)
 *
 * Surfaces: GBC-69, 106, 108, 109, 111, 113 — all the stock-related
 * tickets in the 2026-05-18 in-progress backlog. Some RPCs in the list
 * don't exist yet (`process_stock_transfer_batch`, `post_inventory_count`,
 * `create_inventory_count`, `accept_goods_receipt`). The test SKIPs those
 * with an informational message — when the migration lands, the gate
 * activates automatically.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const STOCK_RPCS = [
  "process_stock_transfer",
  "process_stock_transfer_batch",
  "confirm_pick",
  "post_inventory_count",
  "create_inventory_count",
  "accept_goods_receipt",
];

interface Latest {
  file: string;
  body: string;
}

function findLatest(fnName: string): Latest | null {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const fnRegex = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION[\\s\\S]{0,80}?\\b${fnName}\\b\\s*\\(`,
    "i"
  );
  let latest: Latest | null = null;
  for (const f of files) {
    const full = path.join(MIGRATIONS_DIR, f);
    const src = fs.readFileSync(full, "utf8");
    if (fnRegex.test(src)) latest = { file: f, body: src };
  }
  return latest;
}

/**
 * Carve out the body of a single function definition from a migration that
 * may contain multiple. Naive heuristic: from the matched header to the
 * next `$$;` on its own line.
 */
function carveBody(src: string, fnName: string): string {
  const headerRegex = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION[\\s\\S]{0,80}?\\b${fnName}\\b\\s*\\(`,
    "g"
  );
  const m = headerRegex.exec(src);
  if (!m) return src;
  const start = m.index;
  const endMatch = src.slice(start).match(/\$\$\s*;\s*\n/);
  const end = endMatch
    ? start + (endMatch.index ?? src.length) + endMatch[0].length
    : src.length;
  return src.slice(start, end);
}

describe("P-12 — stock RPC shape", () => {
  for (const fn of STOCK_RPCS) {
    const latest = findLatest(fn);
    if (!latest) {
      it.skip(`${fn} — RPC not yet implemented; gate will activate when migration lands`, () => {});
      continue;
    }
    const body = carveBody(latest.body, fn);

    it(`${fn} is SECURITY DEFINER`, () => {
      expect(
        /SECURITY\s+DEFINER/i.test(body),
        `${fn} defined in ${latest.file} is missing SECURITY DEFINER`
      ).toBe(true);
    });

    it(`${fn} pins search_path = public`, () => {
      expect(
        /SET\s+search_path\s*=\s*(public|'public')/i.test(body),
        `${fn} defined in ${latest.file} is missing 'SET search_path = public' (search-path-injection risk; see GBC-6)`
      ).toBe(true);
    });
  }
});
