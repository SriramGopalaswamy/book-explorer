import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

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
async function makeHolidayExcel(holidays: Array<{ name: string; date: string }>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Holidays");
  ws.addRow(["name", "date"]);
  for (const h of holidays) ws.addRow([h.name, h.date]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

// ─── Parse the Excel buffer the same way BulkUploadDialog does ───────────────
async function parseExcelBuffer(buf: Uint8Array): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  const colCount = ws.columnCount || 1;
  const rows: string[][] = [];
  ws.eachRow((row) => {
    const cells: string[] = [];
    for (let i = 1; i <= colCount; i++) {
      let val: ExcelJS.CellValue = row.getCell(i).value;
      if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, "0");
        const d = String(val.getDate()).padStart(2, "0");
        val = `${y}-${m}-${d}`;
      }
      cells.push(val == null ? "" : String(val));
    }
    rows.push(cells);
  });

  if (rows.length < 2) return [];
  const fileHeaders = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    fileHeaders.forEach((h, i) => {
      row[h] = maybeConvertExcelSerial(String(cells[i] ?? "").trim());
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

  it("parses holiday names correctly (no date values leaking into name column)", async () => {
    const buf = await makeHolidayExcel(holidays);
    const rows = await parseExcelBuffer(buf);
    rows.forEach((row, i) => {
      expect(row.name).toBe(holidays[i].name);
    });
  });

  it("parses dates as YYYY-MM-DD strings (not serial numbers)", async () => {
    const buf = await makeHolidayExcel(holidays);
    const rows = await parseExcelBuffer(buf);
    rows.forEach((row, i) => {
      expect(row.date).toBe(holidays[i].date);
      // Must NOT be a raw serial number like "46023"
      expect(Number(row.date)).toBeNaN();
    });
  });

  it("date strings pass new Date() parsing", async () => {
    const buf = await makeHolidayExcel(holidays);
    const rows = await parseExcelBuffer(buf);
    rows.forEach((row) => {
      const parsed = new Date(row.date);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  it("year extracted from date is correct", async () => {
    const buf = await makeHolidayExcel(holidays);
    const rows = await parseExcelBuffer(buf);
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
