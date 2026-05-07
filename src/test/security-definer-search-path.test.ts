/**
 * ⚠️ KNOWN FRAGILITY (FMEA F3, RPN 315) ⚠️
 *
 * This file uses regex against SQL text — NOT a real parser. The CREATE
 * FUNCTION matcher stops at the first `;`, which inside `LANGUAGE plpgsql`
 * bodies is usually `END;` *inside* the function body, not the statement
 * terminator. A `Python` audit at FMEA time captured 296 of 412 SECURITY
 * DEFINER occurrences (~28% blind spot). A vulnerable plpgsql function whose
 * `SET search_path` clause sits AFTER its inner `;` will be silently passed.
 *
 * The proper fix is to parse SQL with `pg_query_go` / `pg-query-emscripten`
 * or to enforce the invariant inside Postgres via `pg_proc` introspection
 * (see _LOVABLE_PROMPT.md TASK 12). Until then, this test is a belt-and-
 * suspenders check, not a guarantee.
 *
 * GBC-6 — every SECURITY DEFINER function must pin search_path.
 *
 * In Postgres, a SECURITY DEFINER function runs with the owner's privileges.
 * If it does not pin `search_path`, an attacker who can create a function or
 * table in a schema they control can hijack the function by shadowing names
 * resolved without explicit schema qualification.
 *
 * Migration 20260312200000_fix_search_path_mutable.sql added the missing
 * `SET search_path` to a batch of existing functions. This test fails if any
 * SECURITY DEFINER function created by a migration on or after 20260312 is
 * missing the pin.
 *
 * Implementation: lexical scan over all *.sql in supabase/migrations/. For
 * each `CREATE [OR REPLACE] FUNCTION ... [arg list] [RETURNS x]
 * [LANGUAGE x] ... SECURITY DEFINER ...` block we look for a
 * `SET search_path = ...` clause within the same statement.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const CUTOFF = "20260312200000"; // the fix-search-path-mutable migration

interface FnDecl {
  file: string;
  name: string;
  pinned: boolean;
}

function readMigrations(): { file: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8") }));
}

function extractFunctions(sql: string, file: string): FnDecl[] {
  const out: FnDecl[] = [];
  // CREATE [OR REPLACE] FUNCTION <schema>.<name>(...) ... SECURITY DEFINER ... ($$|AS\s) ... ($$|;)
  // We capture from CREATE FUNCTION until the first $$ or ; (statement end, or PL/pgSQL body start).
  // To allow detection of `SET search_path` either before the body OR in the body header, scan to the
  // first occurrence of `LANGUAGE` plus the next ;. This is a heuristic that matches Postgres
  // function definitions in this repo.
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\([^)]*\)([\s\S]*?);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const fullMatch = m[0];
    const name = m[1];
    if (!/SECURITY\s+DEFINER/i.test(fullMatch)) continue;
    const pinned = /SET\s+search_path/i.test(fullMatch);
    out.push({ file, name, pinned });
  }
  return out;
}

describe("GBC-6: SECURITY DEFINER functions pin search_path", () => {
  const migrations = readMigrations();
  const fns = migrations.flatMap((m) => extractFunctions(m.sql, m.file));

  it("found SECURITY DEFINER functions to inspect", () => {
    expect(fns.length).toBeGreaterThan(5);
  });

  it("every SECURITY DEFINER function created on or after the cutoff pins search_path", () => {
    const offenders = fns.filter((f) => {
      const prefix = f.file.slice(0, CUTOFF.length);
      return prefix >= CUTOFF && !f.pinned;
    });
    expect(
      offenders,
      `SECURITY DEFINER functions missing 'SET search_path =' (post-${CUTOFF}): ${offenders
        .map((o) => `${o.file}:${o.name}`)
        .join(", ")}`,
    ).toEqual([]);
  });
});
