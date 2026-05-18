/**
 * GBC-103 — Future-dated financial entries are rejected by the
 * `trg_reject_future_date` triggers on payment_receipts, vendor_payments,
 * expenses, and journal_entries.
 *
 * Static probe: verifies the migration that wires the triggers exists and
 * attaches to all four target tables. (The runtime trigger behaviour is
 * exercised by the DB linter / integration suite; this test prevents the
 * trigger wiring from regressing.)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const TARGET_TABLES = [
  "payment_receipts",
  "vendor_payments",
  "expenses",
  "journal_entries",
] as const;

describe("GBC-103 — future-date rejection triggers", () => {
  const allSql = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");

  it("defines the trg_reject_future_date function", () => {
    expect(allSql).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trg_reject_future_date/i,
    );
  });

  it.each(TARGET_TABLES)(
    "attaches a future-date trigger to public.%s",
    (table) => {
      const triggerRegex = new RegExp(
        `CREATE\\s+TRIGGER\\s+\\w+_no_future_date[\\s\\S]{0,200}ON\\s+public\\.${table}\\b`,
        "i",
      );
      expect(allSql).toMatch(triggerRegex);
    },
  );
});
