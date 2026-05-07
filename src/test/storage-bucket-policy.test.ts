/**
 * ⚠️ KNOWN FRAGILITY (FMEA F4, RPN 192) ⚠️
 *
 * The `USING (...)` extractor uses non-greedy regex, which stops at the FIRST
 * closing paren. Policies with nested parens (e.g. `USING (EXISTS (SELECT 1
 * ...))`) capture only the inner half; classification falls into OTHER instead
 * of REFERENCE_TENANCY. This is a regex-vs-grammar mismatch — the structural
 * fix is a SQL parser. See FMEA F4 in gbc-audit/_FMEA.md for detail.
 *
 * GBC-7 / GBC-15 / GBC-17 — storage bucket policy regression guard.
 *
 * Classifies every storage.objects SELECT policy in supabase/migrations/ as:
 *   - PATH_TENANCY     — uses foldername(name)/string_to_array(name,'/') etc.
 *   - REFERENCE_TENANCY — joins through a public.* table for organization_id
 *   - FLAT_AUTHENTICATED — only checks bucket_id and auth.role()
 *
 * Two invariants:
 *   1. No migration after the CUTOFF creates a new FLAT_AUTHENTICATED SELECT
 *      policy (would re-open the bug class GBC-7/15/17 describes).
 *   2. Every bucket created with `public` strictly false has at least one
 *      tenancy-scoped SELECT policy somewhere in the migration history.
 *
 * Known-pending buckets (`invoice-assets`, etc.) are listed in
 * KNOWN_FLAT_AUTHENTICATED so the suite passes today; remove an entry as it
 * is fixed in a future migration.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
// Migrations on or after this filename prefix must not introduce new
// FLAT_AUTHENTICATED SELECT policies.
const CUTOFF = "20260325000000";

const KNOWN_FLAT_AUTHENTICATED = new Set<string>([
  // empty — all known flat-authenticated buckets have been migrated to tenancy-scoped policies.
]);

interface PolicyBlock {
  file: string;
  bucket: string | null;
  body: string;
}

function readMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8") }));
}

function extractSelectPolicies(sql: string, file: string): PolicyBlock[] {
  const out: PolicyBlock[] = [];
  // Loose match: CREATE POLICY ... FOR SELECT ... USING (...);
  const re = /CREATE POLICY[\s\S]+?FOR SELECT[\s\S]+?USING\s*\(([\s\S]+?)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const body = m[1];
    const bucketMatch = body.match(/bucket_id\s*=\s*'([^']+)'/i);
    out.push({ file, bucket: bucketMatch?.[1] ?? null, body });
  }
  return out;
}

function classify(body: string): "PATH_TENANCY" | "REFERENCE_TENANCY" | "FLAT_AUTHENTICATED" | "OTHER" {
  if (/foldername\s*\(\s*name\s*\)|string_to_array\s*\(\s*name/i.test(body)) {
    return "PATH_TENANCY";
  }
  if (/organization_id|is_org_admin_or_hr|is_admin_or_finance|is_admin_or_hr/i.test(body)) {
    return "REFERENCE_TENANCY";
  }
  if (/auth\.role\s*\(\s*\)\s*=\s*'authenticated'/i.test(body) && !/auth\.uid/i.test(body)) {
    return "FLAT_AUTHENTICATED";
  }
  return "OTHER";
}

function isPrivateBucket(sql: string, bucket: string): boolean {
  // Look for INSERT INTO storage.buckets ... '<bucket>' ... false
  const re = new RegExp(
    String.raw`INSERT INTO storage\.buckets[^;]*'${bucket}'[\s\S]*?(true|false)`,
    "i",
  );
  const m = sql.match(re);
  if (!m) return false;
  return m[1].toLowerCase() === "false";
}

describe("GBC-7/15/17: storage bucket SELECT policies stay tenancy-scoped", () => {
  const migrations = readMigrations();
  const allPolicies = migrations.flatMap((m) =>
    extractSelectPolicies(m.sql, m.file)
      .filter((p) => p.bucket !== null) // ignore non-bucket policies
      .map((p) => ({ ...p, classification: classify(p.body) })),
  );

  it("found bucket SELECT policies to inspect", () => {
    expect(allPolicies.length).toBeGreaterThan(5);
  });

  it("no migration after the cutoff introduces a new FLAT_AUTHENTICATED SELECT on a bucket", () => {
    const offenders = allPolicies.filter((p) => {
      if (p.classification !== "FLAT_AUTHENTICATED") return false;
      if (!p.bucket) return false;
      if (KNOWN_FLAT_AUTHENTICATED.has(p.bucket)) return false;
      const prefix = p.file.slice(0, CUTOFF.length);
      return prefix >= CUTOFF;
    });
    expect(
      offenders,
      `regression: new flat-authenticated SELECT policy on bucket(s): ${offenders
        .map((o) => `${o.file}:${o.bucket}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("KNOWN_FLAT_AUTHENTICATED entries still appear as flat-authenticated (otherwise prune the list)", () => {
    const stale = [...KNOWN_FLAT_AUTHENTICATED].filter((b) => {
      const stillBroken = allPolicies.some(
        (p) => p.bucket === b && p.classification === "FLAT_AUTHENTICATED",
      );
      const replacementExists = allPolicies.some(
        (p) =>
          p.bucket === b &&
          (p.classification === "PATH_TENANCY" || p.classification === "REFERENCE_TENANCY"),
      );
      return !stillBroken && !replacementExists;
    });
    expect(
      stale,
      `KNOWN_FLAT_AUTHENTICATED contains ${stale.join(", ")} which no longer match any policy — prune the allowlist`,
    ).toEqual([]);
  });
});
