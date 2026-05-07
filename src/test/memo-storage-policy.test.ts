/**
 * GBC-17 — memo-attachments storage policy regression guard
 *
 * The original migration 20260218114058 created an over-permissive SELECT
 * policy (any authenticated user could read any object across all tenants).
 * Migration 20260222035633 replaced it with an org-scoped policy that joins
 * through public.memos to enforce organization_id matching.
 *
 * This file pins both invariants:
 *   1. The active SELECT policy on memo-attachments must include a tenancy
 *      check (organization_id, is_org_admin_or_hr, or auth.uid() folder),
 *      not just `auth.role() = 'authenticated'`.
 *   2. uploadMemoAttachment in src/hooks/useMemos.ts must continue to write
 *      objects under the user's auth.uid() folder, so the
 *      `(storage.foldername(name))[1]` branch of the policy keeps working.
 *
 * If either invariant changes the test fails loudly; the fix should not be
 * to silence the test but to re-evaluate whether cross-tenant reads have
 * been re-opened.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOOK_PATH = path.resolve(__dirname, "../hooks/useMemos.ts");

function readAllMigrations(): { file: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      file: f,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"),
    }));
}

describe("GBC-17: memo-attachments cross-tenant leak regression", () => {
  it("the over-permissive 'Authenticated users can view memo attachments' policy is dropped", () => {
    const migrations = readAllMigrations();
    const drop = migrations.find((m) =>
      /DROP POLICY IF EXISTS\s+"Authenticated users can view memo attachments"/i.test(m.sql),
    );
    expect(drop, "expected a migration that drops the over-permissive policy").toBeDefined();
  });

  it("there is an org-scoped SELECT policy on memo-attachments", () => {
    const migrations = readAllMigrations();
    const orgScoped = migrations.find(
      (m) =>
        /memo-attachments/.test(m.sql) &&
        /CREATE POLICY[\s\S]+?FOR SELECT/i.test(m.sql) &&
        /(organization_id|is_org_admin_or_hr|foldername\(name\))/i.test(m.sql),
    );
    expect(
      orgScoped,
      "expected a migration that creates an org-scoped SELECT policy on memo-attachments",
    ).toBeDefined();
  });

  it("no migration after the original creates a SELECT policy that only checks auth.role()", () => {
    const migrations = readAllMigrations();
    const offending = migrations.filter((m) => {
      // Look for "FOR SELECT" blocks that mention memo-attachments and
      // whose USING clause contains only the bucket check + auth.role().
      const matches = m.sql.match(
        /CREATE POLICY[^;]+?FOR SELECT[\s\S]+?USING\s*\(([^;]+?)\);/gi,
      );
      if (!matches) return false;
      return matches.some((block) => {
        if (!/memo-attachments/.test(block)) return false;
        const using = block.replace(/[\s\S]+USING\s*\(/i, "").replace(/\);$/, "");
        const hasTenancy = /(organization_id|is_org_admin_or_hr|foldername\(name\))/i.test(using);
        const onlyAuthRole = /auth\.role\(\)/i.test(using);
        return onlyAuthRole && !hasTenancy;
      });
    });

    // The original migration 20260218114058 contains the offending policy by
    // history; it is dropped by 20260222035633. Anything else would be a
    // regression.
    const newOffenders = offending.filter((m) => !m.file.startsWith("20260218114058"));
    expect(
      newOffenders,
      `regression: a migration re-introduces a flat authenticated-only SELECT policy on memo-attachments: ${newOffenders
        .map((o) => o.file)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("uploadMemoAttachment writes objects under the user's auth.uid() folder", () => {
    const src = fs.readFileSync(HOOK_PATH, "utf-8");
    // The path template must start with `${userId}/`. We allow any suffix.
    const fnMatch = src.match(/uploadMemoAttachment[\s\S]+?return\s+fileName/);
    expect(fnMatch, "uploadMemoAttachment helper not found").toBeTruthy();
    const fnBody = fnMatch![0];
    expect(
      /const\s+fileName\s*=\s*`\$\{userId\}\//.test(fnBody),
      "uploadMemoAttachment must build a path beginning with `${userId}/` so the folder-based RLS branch keeps working",
    ).toBe(true);
  });
});
