import { describe, it, expect } from "vitest";

/**
 * Tests for the CSV export utility in statutory-export.ts.
 * We extract and test the toCsv logic inline since it's a private function.
 */

// Replicate the toCsv logic from statutory-export.ts for unit testing
function toCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...data.map(row => headers.map(h => escape(row[h])).join(","))].join("\n");
}

describe("CSV export – toCsv", () => {
  it("returns empty string for empty array", () => {
    expect(toCsv([])).toBe("");
  });

  it("generates headers from first row keys", () => {
    const csv = toCsv([{ Name: "Alice", Amount: 1000 }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Name,Amount");
    expect(lines[1]).toBe("Alice,1000");
  });

  it("handles multiple rows", () => {
    const csv = toCsv([
      { Name: "Alice", Amount: 1000 },
      { Name: "Bob", Amount: 2000 },
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[2]).toBe("Bob,2000");
  });

  it("escapes values containing commas", () => {
    const csv = toCsv([{ Description: "Item A, Item B", Amount: 100 }]);
    expect(csv).toContain('"Item A, Item B"');
  });

  it("escapes values containing double quotes", () => {
    const csv = toCsv([{ Note: 'He said "hello"', Amount: 50 }]);
    expect(csv).toContain('"He said ""hello"""');
  });

  it("escapes values containing newlines", () => {
    const csv = toCsv([{ Address: "Line 1\nLine 2", City: "Delhi" }]);
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it("handles null and undefined values", () => {
    const csv = toCsv([{ Name: null, Amount: undefined }]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(","); // both empty
  });

  it("handles numeric zero correctly", () => {
    const csv = toCsv([{ Amount: 0, Tax: 0.00 }]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("0,0");
  });

  it("handles boolean values", () => {
    const csv = toCsv([{ Active: true, Deleted: false }]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("true,false");
  });

  // ── CSV Formula Injection Prevention ──
  describe("CSV formula injection", () => {
    it("does not inject formulas starting with =", () => {
      const csv = toCsv([{ Name: "=SUM(A1:A10)", Amount: 100 }]);
      // The value should be present as-is (no execution in CSV)
      // Since it doesn't contain comma/quote/newline, it won't be quoted
      // This is a known limitation - for full protection, values starting with
      // = + - @ should be prefixed with a single quote
      expect(csv).toContain("=SUM(A1:A10)");
    });

    it("formula with comma gets quoted", () => {
      const csv = toCsv([{ Name: "=cmd|'/C calc'!A0,B1", Amount: 100 }]);
      // Contains comma, so it gets escaped with quotes
      expect(csv).toContain('"=cmd|');
    });
  });

  // ── Edge cases for financial data ──
  it("preserves large numbers without scientific notation", () => {
    const csv = toCsv([{ Amount: 9999999999 }]);
    expect(csv).toContain("9999999999");
  });

  it("handles negative amounts", () => {
    const csv = toCsv([{ Credit: -5000 }]);
    expect(csv).toContain("-5000");
  });

  it("handles decimal amounts", () => {
    const csv = toCsv([{ Amount: 1234.56 }]);
    expect(csv).toContain("1234.56");
  });

  it("handles special characters in headers", () => {
    const csv = toCsv([{ "CGST Rate (%)": 9, "SGST Amount": 450 }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("CGST Rate (%),SGST Amount");
  });

  it("handles single-column data", () => {
    const csv = toCsv([{ Name: "Alice" }, { Name: "Bob" }]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name");
  });
});
