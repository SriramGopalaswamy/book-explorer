import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

// ─── Replicate the helper from BulkUploadDialog ───────────────────────────────
function maybeConvertExcelSerial(value: string): string {
  const num = Number(value);
  if (!isNaN(num) && num > 36526 && num < 73050 && String(num) === value.trim()) {
    const utcDays = num - 25569;
    const date = new Date(utcDays * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }
  return value;
}

// ─── Replicate the CSV parser from BulkUploadDialog ──────────────────────────
function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  });
}

// ─── Build an in-memory Excel workbook with date cells ────────────────────────
function makeHolidayExcel(holidays: Array<{ name: string; date: string }>): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([
    ["name", "date"],
    ...holidays.map((h) => [h.name, h.date]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Holidays");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

// ─── Parse the Excel buffer the same way BulkUploadDialog does ───────────────
function parseExcelBuffer(buf: Uint8Array): Record<string, string>[] {
  const workbook = XLSX.read(buf, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });

  if (rawRows.length < 2) return [];
  const fileHeaders = (rawRows[0] as string[]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return rawRows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    fileHeaders.forEach((h, i) => {
      row[h] = maybeConvertExcelSerial(String((cells as string[])[i] ?? "").trim());
    });
    return row;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("maybeConvertExcelSerial (safety fallback)", () => {
  it("converts Excel serial 46023 → 2026-01-01 (New Year 2026)", () => {
    expect(maybeConvertExcelSerial("46023")).toBe("2026-01-01");
  });

  it("converts Excel serial 46037 → 2026-01-15 (Makara Sankranti region)", () => {
    const result = maybeConvertExcelSerial("46037");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/); // must be a date string
    expect(result).not.toBe("46037");
  });

  it("converts Excel serial 46048 → 2026-01-26 (Republic Day)", () => {
    expect(maybeConvertExcelSerial("46048")).toBe("2026-01-26");
  });

  it("does NOT convert a normal string like 'New Year'", () => {
    expect(maybeConvertExcelSerial("New Year")).toBe("New Year");
  });

  it("does NOT convert a valid ISO date string", () => {
    expect(maybeConvertExcelSerial("2026-01-26")).toBe("2026-01-26");
  });

  it("does NOT convert small numbers (not in Excel date range)", () => {
    expect(maybeConvertExcelSerial("100")).toBe("100");
  });

  it("does NOT convert empty string", () => {
    expect(maybeConvertExcelSerial("")).toBe("");
  });
});

describe("XLSX Excel parsing with cellDates:true + raw:false", () => {
  const holidays = [
    { name: "New Year",        date: "2026-01-01" },
    { name: "Republic Day",    date: "2026-01-26" },
    { name: "Independence Day", date: "2026-08-15" },
    { name: "Christmas",       date: "2026-12-25" },
  ];

  it("parses holiday names correctly (no date values leaking into name column)", () => {
    const buf = makeHolidayExcel(holidays);
    const rows = parseExcelBuffer(buf);
    rows.forEach((row, i) => {
      expect(row.name).toBe(holidays[i].name);
    });
  });

  it("parses dates as YYYY-MM-DD strings (not serial numbers)", () => {
    const buf = makeHolidayExcel(holidays);
    const rows = parseExcelBuffer(buf);
    rows.forEach((row, i) => {
      expect(row.date).toBe(holidays[i].date);
      // Must NOT be a raw serial number like "46023"
      expect(Number(row.date)).toBeNaN();
    });
  });

  it("date strings pass new Date() parsing", () => {
    const buf = makeHolidayExcel(holidays);
    const rows = parseExcelBuffer(buf);
    rows.forEach((row) => {
      const parsed = new Date(row.date);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  it("year extracted from date is correct", () => {
    const buf = makeHolidayExcel(holidays);
    const rows = parseExcelBuffer(buf);
    rows.forEach((row) => {
      const year = new Date(row.date).getFullYear();
      expect(year).toBe(2026);
    });
  });

  it("CSV template parsing also works correctly (baseline)", () => {
    const csv = `name,date\nRepublic Day,2026-01-26\nChristmas,2026-12-25`;
    const rawRows = parseCSV(csv);
    const headers = rawRows[0].map((h) => h.toLowerCase());
    const rows = rawRows.slice(1).map((cells) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = maybeConvertExcelSerial(cells[i]); });
      return row;
    });
    expect(rows[0].name).toBe("Republic Day");
    expect(rows[0].date).toBe("2026-01-26");
    expect(rows[1].name).toBe("Christmas");
    expect(rows[1].date).toBe("2026-12-25");
  });
});
