import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportPayrollCSV, type PayrollEntry } from "@/hooks/usePayrollEngine";

// ---------------------------------------------------------------------------
// DOM mocks – exportPayrollCSV creates a Blob, an object URL, and triggers a
// download via an ephemeral <a> element.  We intercept all of that so the
// tests can inspect the generated CSV content without touching the real DOM.
// ---------------------------------------------------------------------------

let lastBlobContent: string | undefined;
let mockAnchor: Record<string, any>;

beforeEach(() => {
  lastBlobContent = undefined;

  // Capture whatever is passed to the Blob constructor
  vi.stubGlobal(
    "Blob",
    class FakeBlob {
      parts: any[];
      constructor(parts: any[], _opts?: any) {
        this.parts = parts;
        lastBlobContent = parts.join("");
      }
    },
  );

  // URL.createObjectURL / revokeObjectURL
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });

  // document.createElement("a") – track href, download, and click
  mockAnchor = { href: "", download: "", click: vi.fn() };
  vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as any);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PayrollEntry with sensible defaults. */
function makeEntry(overrides: Partial<PayrollEntry> = {}): PayrollEntry {
  return {
    id: "entry-1",
    payroll_run_id: "run-1",
    profile_id: "profile-1",
    organization_id: "org-1",
    compensation_structure_id: null,
    annual_ctc: 600000,
    gross_earnings: 50000,
    total_deductions: 5000,
    net_pay: 45000,
    lwp_days: 0,
    lwp_deduction: 0,
    working_days: 22,
    paid_days: 22,
    earnings_breakdown: [],
    deductions_breakdown: [],
    status: "computed",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    profiles: {
      full_name: "Alice Johnson",
      email: "alice@example.com",
      department: "Engineering",
      job_title: "Software Engineer",
    },
    ...overrides,
  };
}

/** Return the CSV string produced by the most recent exportPayrollCSV call. */
function getCsv(): string {
  if (lastBlobContent === undefined) {
    throw new Error("No CSV was generated – did you call exportPayrollCSV?");
  }
  return lastBlobContent;
}

/** Parse the CSV string into an array of rows (each row is an array of raw cell strings). */
function parseCsvRows(csv: string): string[][] {
  return csv.split("\n").map((line) => {
    // Naive split that respects quoted fields containing commas
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportPayrollCSV", () => {
  // ── 1. Correct CSV headers ──────────────────────────────────────────────
  it("generates correct CSV headers", () => {
    const entry = makeEntry();
    exportPayrollCSV([entry], "2026-03");

    const csv = getCsv();
    const headerLine = csv.split("\n")[0];

    expect(headerLine).toBe(
      "Employee Name,Department,Job Title,Annual CTC," +
        "Gross Earnings,Total Deductions,LWP Days,LWP Deduction," +
        "Working Days,Paid Days,Net Pay",
    );
  });

  // ── 2. Commas in employee names are escaped ─────────────────────────────
  it("escapes commas in employee names", () => {
    const entry = makeEntry({
      profiles: {
        full_name: "Doe, Jane",
        email: "jane@example.com",
        department: "HR",
        job_title: "Manager",
      },
    });

    exportPayrollCSV([entry], "2026-03");

    const rows = parseCsvRows(getCsv());
    // Row 1 (index 1) is the data row; first cell should be the unescaped name
    expect(rows[1][0]).toBe("Doe, Jane");

    // The raw CSV line must wrap the name in double-quotes
    const rawDataLine = getCsv().split("\n")[1];
    expect(rawDataLine).toMatch(/^"Doe, Jane"/);
  });

  // ── 3. Quotes in field values are escaped ───────────────────────────────
  it('escapes double-quotes in field values', () => {
    const entry = makeEntry({
      profiles: {
        full_name: 'Bob "The Builder" Smith',
        email: "bob@example.com",
        department: "Construction",
        job_title: "Builder",
      },
    });

    exportPayrollCSV([entry], "2026-03");

    const csv = getCsv();
    // CSV RFC 4180: a field containing quotes must be enclosed in quotes,
    // and each internal quote is doubled.
    expect(csv).toContain('"Bob ""The Builder"" Smith"');

    // Verify round-trip through our parser
    const rows = parseCsvRows(csv);
    expect(rows[1][0]).toBe('Bob "The Builder" Smith');
  });

  // ── 4. Empty entries array ──────────────────────────────────────────────
  it("handles empty entries array (header-only CSV)", () => {
    exportPayrollCSV([], "2026-03");

    const csv = getCsv();
    const lines = csv.split("\n");

    // Should only contain the header row
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Employee Name");
  });

  // ── 5. Entries with null profile data ───────────────────────────────────
  it("handles entries with null profile data gracefully", () => {
    const entry = makeEntry({ profiles: null });

    exportPayrollCSV([entry], "2026-03");

    const rows = parseCsvRows(getCsv());
    const dataRow = rows[1];

    // Name, Department, and Job Title should all fall back to empty strings
    expect(dataRow[0]).toBe("");
    expect(dataRow[1]).toBe("");
    expect(dataRow[2]).toBe("");

    // Numeric columns should still be present
    expect(dataRow[3]).toBe("600000"); // annual_ctc
    expect(dataRow[10]).toBe("45000"); // net_pay
  });

  // ── 6. Correct download filename ───────────────────────────────────────
  it("triggers download with the correct filename", () => {
    exportPayrollCSV([makeEntry()], "2026-03");

    expect(mockAnchor.download).toBe("payroll_2026-03.csv");
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });

  // ── 7. Object URL lifecycle ─────────────────────────────────────────────
  it("creates and revokes the object URL", () => {
    exportPayrollCSV([makeEntry()], "2026-03");

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  // ── 8. Multiple entries produce correct number of rows ──────────────────
  it("generates one CSV row per entry", () => {
    const entries = [
      makeEntry({ id: "e1", profiles: { full_name: "Alice", email: null, department: null, job_title: null } }),
      makeEntry({ id: "e2", profiles: { full_name: "Bob", email: null, department: null, job_title: null } }),
      makeEntry({ id: "e3", profiles: { full_name: "Charlie", email: null, department: null, job_title: null } }),
    ];

    exportPayrollCSV(entries, "2026-03");

    const lines = getCsv().split("\n");
    // 1 header + 3 data rows
    expect(lines).toHaveLength(4);
  });

  // ── 9. Newline characters in fields are escaped ─────────────────────────
  it("escapes newline characters in field values", () => {
    const entry = makeEntry({
      profiles: {
        full_name: "Line1\nLine2",
        email: "test@example.com",
        department: "Dept",
        job_title: "Title",
      },
    });

    exportPayrollCSV([entry], "2026-03");

    const csv = getCsv();
    // The field with the newline should be wrapped in quotes
    expect(csv).toContain('"Line1\nLine2"');
  });

  // ── 10. Numeric values are rendered without quoting ─────────────────────
  it("does not quote plain numeric values", () => {
    const entry = makeEntry({
      annual_ctc: 1200000,
      gross_earnings: 100000,
      net_pay: 90000,
    });

    exportPayrollCSV([entry], "2026-03");

    const rawDataLine = getCsv().split("\n")[1];
    // Numbers should appear as-is, not wrapped in quotes
    expect(rawDataLine).toContain(",1200000,");
    expect(rawDataLine).toContain(",100000,");
    expect(rawDataLine).toMatch(/,90000$/);
  });

  // ── 11. Zero LWP and edge-case numeric values ──────────────────────────
  it("correctly renders zero values for LWP fields", () => {
    const entry = makeEntry({
      lwp_days: 0,
      lwp_deduction: 0,
      working_days: 0,
      paid_days: 0,
    });

    exportPayrollCSV([entry], "2026-03");

    const rows = parseCsvRows(getCsv());
    const dataRow = rows[1];

    expect(dataRow[6]).toBe("0"); // lwp_days
    expect(dataRow[7]).toBe("0"); // lwp_deduction
    expect(dataRow[8]).toBe("0"); // working_days
    expect(dataRow[9]).toBe("0"); // paid_days
  });

  // ── 12. Profiles with partial null fields ───────────────────────────────
  it("handles profiles where some fields are null", () => {
    const entry = makeEntry({
      profiles: {
        full_name: "Partial User",
        email: null,
        department: null,
        job_title: null,
      },
    });

    exportPayrollCSV([entry], "2026-03");

    const rows = parseCsvRows(getCsv());
    const dataRow = rows[1];

    expect(dataRow[0]).toBe("Partial User");
    expect(dataRow[1]).toBe(""); // department
    expect(dataRow[2]).toBe(""); // job_title
  });
});
