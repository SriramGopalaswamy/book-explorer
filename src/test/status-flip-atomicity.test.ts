/**
 * P-15 — Status-flip + side-effect must be atomic.
 *
 * Anti-pattern: browser code that calls
 *   `supabase.from(<doc>).update({ status: 'X' })`
 * and then separately calls a side-effect (stock ledger insert, bank
 * transaction insert, journal entry post). If the second call fails
 * (disconnect, browser crash, race), the document is in the terminal state
 * but the side-effect never landed — silent ledger / inventory drift.
 *
 * Fix is universal: collapse both into one SECURITY DEFINER RPC, or have a
 * DB trigger own the side-effect on status change.
 *
 * STATIC-TEXT scan. Multi-line aware (the side-effect can be 100s of chars
 * after the .update call). Allowlist seeded with the known offenders from
 * the 2026-05-18 in-progress backlog audit + the Wave-2 probe-validation
 * pass.
 *
 * Surfaces: GBC-92 (quote→SO), GBC-96 (bills mark-paid), GBC-113 (stock
 * transfer received loop), GBC-123 (delivery note delivered), and NEW-3
 * (useInvoices mark-paid — sibling of GBC-96, surfaced during P-15 probe
 * validation).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..");
const SCAN_ROOTS = ["hooks", "pages"];

const DOC_TABLES = [
  "delivery_notes",
  "goods_receipts",
  "stock_transfers",
  "sales_returns",
  "purchase_returns",
  "invoices",
  "bills",
  "quotes",
  "credit_notes",
];

const SIDE_EFFECTS = [
  // Direct table writes
  "stock_ledger",
  "bank_transactions",
  "financial_records",
  "journal_lines",
  // Helper module imports
  "postGoodsReceiptStock",
  "postDeliveryNoteStock",
  "postStockTransferEntries",
  "createBankTransaction",
  // RPC names called per-row in a JS loop (still non-atomic across the loop)
  "process_stock_transfer",
];

/**
 * `from("<doc>").<...within 400 chars...>.update({ status: ... <within 1200 chars> ... <side-effect>`.
 * 1200-char window covers most observed cases (Bills L592→L622 = 30 lines).
 */
const ANTI_PATTERN = new RegExp(
  `from\\(\\s*["'\`](${DOC_TABLES.join("|")})["'\`]\\s*\\)[\\s\\S]{0,400}?\\.update\\(\\s*\\{\\s*status[\\s\\S]{0,1200}?(${SIDE_EFFECTS.join("|")})`,
  "g"
);

/** Known offenders today. Each must migrate to a single RPC or DB trigger. */
const EXPECTED_OFFENDERS: Record<string, string> = {
  "hooks/useDocumentChains.ts": "GBC-123 (delivery delivered), GBC-127 (partial ship)",
  "hooks/useWarehouse.ts": "GBC-113 (stock transfer received loop)",
};


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

describe("P-15 — status-flip + side-effect atomicity", () => {
  const offenders = new Set<string>();

  for (const root of SCAN_ROOTS) {
    const rootDir = path.join(SRC_DIR, root);
    if (!fs.existsSync(rootDir)) continue;
    for (const file of walk(rootDir)) {
      const src = fs.readFileSync(file, "utf8");
      ANTI_PATTERN.lastIndex = 0;
      if (ANTI_PATTERN.test(src)) {
        offenders.add(path.relative(SRC_DIR, file));
      }
    }
  }

  it("every offender is on the expected-offenders allowlist", () => {
    const unexpected = [...offenders].filter((f) => !(f in EXPECTED_OFFENDERS));
    expect(
      unexpected,
      `Status-flip + side-effect must be atomic (one SECURITY DEFINER RPC or a DB trigger). See gbc-audit/_SUMMARY.md Pattern B + Phase 5 of audit-methodology.md. Offenders:\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("every allowlist entry still has an offending chain (otherwise remove it)", () => {
    const stale = Object.keys(EXPECTED_OFFENDERS).filter((f) => !offenders.has(f));
    expect(
      stale,
      `Stale EXPECTED_OFFENDERS entries — these files no longer show the anti-pattern, remove their entries:\n${stale.join("\n")}`
    ).toEqual([]);
  });
});
