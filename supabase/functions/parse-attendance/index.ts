import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ═══════════════════════════════════════════════════════════════
// GRX10 Books — Biometric Attendance PDF Parser v5
// Secureye ONtime calendar-grid + generic format support
// Uses Gemini Vision for reliable PDF parsing
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Types ────────────────────────────────────────────────────

interface ParsedPunch {
  employee_code: string;
  employee_name: string;
  department?: string;
  card_no?: string;
  punch_datetime: string;
  raw_status?: string;
}

interface ParsedEmployee {
  employee_code: string;
  employee_name: string;
  department?: string;
  card_no?: string;
  shift_name?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  records: EmployeeRecord[];
}

interface EmployeeRecord {
  date: string;
  status?: string;
  in_time?: string | null;
  out_time?: string | null;
  late_minutes?: number | null;
  early_departure?: number | null;
  work_hours?: string | null;
  punches: string[];
}

interface ParseResult {
  punches: ParsedPunch[];
  employees: ParsedEmployee[];
  errors: string[];
  warnings: string[];
  format: string;
  metadata: {
    organization?: string;
    report_period?: string;
    extraction_method: string;
    employees_detected: number;
    validation_passed: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════
// 1️⃣  GEMINI VISION PDF PARSER — Primary for Secureye/biometric PDFs
// ═══════════════════════════════════════════════════════════════

async function parseWithGeminiVision(base64PdfData: string): Promise<ParseResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  console.log("[VISION] Sending PDF to Gemini Vision for structured extraction...");

  const prompt = `You are an expert attendance data extraction engine. You are given a biometric attendance report PDF (typically from Secureye ONtime or similar systems).

CRITICAL: This PDF contains a calendar-grid layout where:
- Each employee section has: Emp Code, Emp Name, Department
- Below that is a calendar grid: columns = days of month (1, 2, 3, ... 31), rows = fields (In Time, Out Time, Late Mins, Early Dep, Work Hrs, Status)
- You must convert this COLUMN-based layout into ROW-based daily records

Extract ALL employee attendance data and return ONLY valid JSON (no markdown, no explanation, no code fences) with this exact schema:

{
  "organization": "company name if visible",
  "report_period": "month and year, e.g. February 2026",
  "employees": [
    {
      "employee_code": "string (the Emp Code value)",
      "employee_name": "string (the Emp Name value)",
      "department": "string or null",
      "records": [
        {
          "date": "YYYY-MM-DD (use the report month/year + day number)",
          "in_time": "HH:mm:ss or null (24-hour format)",
          "out_time": "HH:mm:ss or null (24-hour format)",
          "late_minutes": number or null,
          "early_departure": number or null,
          "work_hours": "H:mm or null",
          "status": "P|A|HD|MIS|WO|WFH|AB|null"
        }
      ]
    }
  ]
}

Rules:
- Convert ALL employees visible in the PDF
- For each day column, create one record with that day's In Time, Out Time, Late Mins, Early Dep, Work Hrs, Status
- Skip days where the employee clearly has no data (empty columns)
- Normalize status codes: P/WO → P if they worked, WO-I → WO, MIS → MIS (Missing Punch), A → A (Absent)
- Dates must use the report's month and year combined with the day number
- Times must be in 24-hour HH:mm:ss format
- If a time shows as "-" or "00:00" with Absent status, set it to null
- Employee code is the numeric/alphanumeric identifier, NOT the serial number
- Include ALL pages of the PDF`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64PdfData}`,
              },
            },
          ],
        },
      ],
      max_tokens: 64000,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[VISION] Gemini API error: ${response.status} — ${errText}`);
    throw new Error(`Gemini Vision returned ${response.status}: ${errText.substring(0, 200)}`);
  }

  const result = await response.json();
  const rawContent = result.choices?.[0]?.message?.content?.trim() || "";
  console.log(`[VISION] Gemini returned ${rawContent.length} chars`);

  // Strip markdown code fences if present
  const cleanJson = rawContent
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?\s*```$/, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (e) {
    console.error(`[VISION] JSON parse failed. Raw content (first 500 chars): ${rawContent.substring(0, 500)}`);
    throw new Error("Could not parse Gemini Vision response as JSON");
  }

  if (!Array.isArray(parsed.employees) || parsed.employees.length === 0) {
    throw new Error("Gemini Vision returned no employee data");
  }

  // Convert to our internal format
  const employees: ParsedEmployee[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const emp of parsed.employees) {
    if (!emp.employee_code) continue;
    const code = String(emp.employee_code).trim();
    const records: EmployeeRecord[] = [];

    for (const rec of (emp.records || [])) {
      if (!rec.date) continue;
      const isoDate = normalizeDate(rec.date);
      if (!isoDate) {
        errors.push(`Invalid date "${rec.date}" for employee ${code}`);
        continue;
      }

      const inTime = rec.in_time ? normalizeTime(rec.in_time) : null;
      const outTime = rec.out_time ? normalizeTime(rec.out_time) : null;
      const status = rec.status ? normalizeStatus(rec.status) || rec.status?.toUpperCase() : undefined;

      // Validation warnings
      if (inTime && outTime && inTime > outTime) {
        warnings.push(`${code} on ${isoDate}: in_time (${inTime}) > out_time (${outTime}) — possible night shift`);
      }
      if (rec.work_hours) {
        const whMatch = rec.work_hours.match?.(/(\d+):(\d+)/);
        if (whMatch && parseInt(whMatch[1]) > 16) {
          warnings.push(`${code} on ${isoDate}: work_hours ${rec.work_hours} exceeds 16 hours`);
        }
      }
      if (rec.late_minutes && rec.late_minutes > 240) {
        warnings.push(`${code} on ${isoDate}: late_minutes ${rec.late_minutes} is extremely high`);
      }
      if (status === "MIS") {
        warnings.push(`${code} on ${isoDate}: Missing punch detected`);
      }

      records.push({
        date: isoDate,
        status,
        in_time: inTime,
        out_time: outTime,
        late_minutes: rec.late_minutes ?? null,
        early_departure: rec.early_departure ?? null,
        work_hours: rec.work_hours ?? null,
        punches: [inTime, outTime].filter((t): t is string => t !== null),
      });
    }

    if (records.length > 0) {
      employees.push({
        employee_code: code,
        employee_name: emp.employee_name || "",
        department: emp.department || undefined,
        records,
      });
    }
  }

  console.log(`[VISION] Extracted ${employees.length} employees with ${employees.reduce((s, e) => s + e.records.length, 0)} records`);

  // Build punches
  const punches = buildPunches(employees);

  return {
    punches,
    employees,
    errors,
    warnings,
    format: "secureye_calendar",
    metadata: {
      organization: parsed.organization || undefined,
      report_period: parsed.report_period || undefined,
      extraction_method: "gemini_vision",
      employees_detected: employees.length,
      validation_passed: employees.length > 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 2️⃣  TEXT-BASED PARSERS — For CSV/TXT and simple PDFs
// ═══════════════════════════════════════════════════════════════

// --- Pure-JS PDF text extraction (kept for non-vision fallback) ---

function lzwDecode(compressed: Uint8Array): Uint8Array {
  const CLEAR_CODE = 256, EOI_CODE = 257;
  const table: Uint8Array[] = [];
  for (let i = 0; i < 256; i++) table.push(new Uint8Array([i]));
  table.push(new Uint8Array(0));
  table.push(new Uint8Array(0));
  const output: number[] = [];
  let bitPos = 0;
  let codeSize = 9;
  const readCode = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byteIdx = Math.floor(bitPos / 8);
      if (byteIdx >= compressed.length) return EOI_CODE;
      const bit = (compressed[byteIdx] >> (7 - (bitPos % 8))) & 1;
      code = (code << 1) | bit;
      bitPos++;
    }
    return code;
  };
  let prevCode: number | null = null;
  while (true) {
    const code = readCode();
    if (code === EOI_CODE) break;
    if (code === CLEAR_CODE) { table.length = 258; codeSize = 9; prevCode = null; continue; }
    let entry: Uint8Array;
    if (code < table.length) { entry = table[code]; }
    else if (prevCode !== null && code === table.length) {
      const prev = table[prevCode];
      entry = new Uint8Array(prev.length + 1);
      entry.set(prev); entry[prev.length] = prev[0];
    } else break;
    for (const b of entry) output.push(b);
    if (prevCode !== null) {
      const prev = table[prevCode];
      const newEntry = new Uint8Array(prev.length + 1);
      newEntry.set(prev); newEntry[prev.length] = entry[0];
      table.push(newEntry);
      if (table.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prevCode = code;
  }
  return new Uint8Array(output);
}

async function extractTextFromPDF(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const raw = new TextDecoder("latin1").decode(data);
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(raw) || /\/Encrypt\s*<</.test(raw)) {
    throw new Error("PDF_ENCRYPTED: This PDF is password-protected.");
  }
  const pageMatches = raw.match(/\/Type\s*\/Page(?!\s*s)/g);
  const pages = pageMatches ? pageMatches.length : 0;

  const streams: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) streams.push(match[1]);

  const decodedStreams: string[] = [];
  for (const stream of streams) {
    try {
      const rawBytes = Uint8Array.from(stream, (c) => c.charCodeAt(0));
      try {
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(rawBytes).catch(() => {});
        writer.close().catch(() => {});
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const totalLen = chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let off = 0;
        for (const chunk of chunks) { merged.set(chunk, off); off += chunk.length; }
        const decoded = new TextDecoder("latin1").decode(merged);
        if (decoded.length > 10) { decodedStreams.push(decoded); continue; }
      } catch { /* fall through */ }
      try {
        const lzwDecoded2 = lzwDecode(rawBytes);
        const decoded = new TextDecoder("latin1").decode(lzwDecoded2);
        if (decoded.length > 10 && /BT|Tj|TJ/.test(decoded)) { decodedStreams.push(decoded); continue; }
      } catch { /* fall through */ }
      decodedStreams.push(stream);
    } catch { decodedStreams.push(stream); }
  }

  // Extract text from BT...ET blocks with positional awareness
  interface TextToken { x: number; y: number; text: string; }
  const allTokens: TextToken[] = [];

  for (const stream of decodedStreams) {
    const btBlocks = stream.match(/BT[\s\S]*?ET/g);
    if (!btBlocks) continue;
    for (const block of btBlocks) {
      let curX = 0, curY = 0;
      const ops = block.split(/\n/);
      for (const op of ops) {
        const tmMatch = op.match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/i);
        if (tmMatch) { curX = parseFloat(tmMatch[5]); curY = parseFloat(tmMatch[6]); }
        const tdMatch = op.match(/([-\d.]+)\s+([-\d.]+)\s+T[dD]/i);
        if (tdMatch) { curX += parseFloat(tdMatch[1]); curY += parseFloat(tdMatch[2]); }
        if (/^T\*\s*$/.test(op.trim())) curY -= 12;
      }
      const extractToken = (txt: string) => {
        if (txt.trim()) allTokens.push({ x: curX, y: curY, text: txt });
      };
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
      if (tjMatches) for (const tj of tjMatches) { const m = tj.match(/\(([^)]*)\)/); if (m) extractToken(decodePDFString(m[1])); }
      const hexTjMatches = block.match(/<([0-9A-Fa-f]+)>\s*Tj/g);
      if (hexTjMatches) for (const htj of hexTjMatches) { const m = htj.match(/<([0-9A-Fa-f]+)>/); if (m) extractToken(decodeHexPDFString(m[1])); }
      const tjArrays = block.match(/\[(.*?)\]\s*TJ/gs);
      if (tjArrays) for (const arr of tjArrays) {
        const parts: string[] = [];
        const tokenRegex = /\(([^)]*)\)|<([0-9A-Fa-f]+)>/g;
        let tokenMatch: RegExpExecArray | null;
        while ((tokenMatch = tokenRegex.exec(arr)) !== null) {
          if (tokenMatch[1] !== undefined) parts.push(decodePDFString(tokenMatch[1]));
          else if (tokenMatch[2] !== undefined) parts.push(decodeHexPDFString(tokenMatch[2]));
        }
        if (parts.length > 0) extractToken(parts.join(""));
      }
    }
  }

  let fullText: string;
  if (allTokens.length > 0) {
    allTokens.sort((a, b) => b.y - a.y);
    const rows: TextToken[][] = [];
    let currentRow: TextToken[] = [];
    let currentY = allTokens[0].y;
    for (const token of allTokens) {
      if (Math.abs(token.y - currentY) <= 3) { currentRow.push(token); }
      else {
        if (currentRow.length > 0) rows.push([...currentRow].sort((a, b) => a.x - b.x));
        currentRow = [token]; currentY = token.y;
      }
    }
    if (currentRow.length > 0) rows.push([...currentRow].sort((a, b) => a.x - b.x));
    fullText = rows.map(row => row.map(t => t.text).join(" ")).join("\n");
  } else {
    fullText = "";
  }

  fullText = fullText.replace(/\s{2,}/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (fullText.length < 100) {
    const rawParts: string[] = [];
    const rawTj = raw.match(/\(([^)]{2,})\)\s*Tj/g);
    if (rawTj) for (const m of rawTj) { const t = m.match(/\(([^)]*)\)/); if (t) rawParts.push(decodePDFString(t[1])); }
    if (rawParts.join(" ").length > fullText.length) fullText = rawParts.join(" ").replace(/\s{2,}/g, " ").trim();
  }

  return { text: fullText, pages };
}

function decodePDFString(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\")
    .replace(/\\(\d{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeHexPDFString(hex: string): string {
  if (hex.length % 2 !== 0) hex += "0";
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substring(i, i + 2), 16));
  return bytes.filter(b => b >= 32 || b === 10 || b === 13 || b === 9).map(b => String.fromCharCode(b)).join("");
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// ═══════════════════════════════════════════════════════════════
// 3️⃣  NORMALIZATION HELPERS
// ═══════════════════════════════════════════════════════════════

const STATUS_MAP: Record<string, string> = {
  P: "P", A: "A", HD: "HD", MIS: "MIS", NA: "NA", WO: "WO",
  WFH: "WFH", CL: "CL", SL: "SL", EL: "EL", PL: "PL",
  OD: "OD", CO: "CO", LWP: "LWP", AB: "AB",
  "1": "P", "0": "A", "2": "HD", "3": "MIS",
  PRESENT: "P", ABSENT: "A",
  "HALF DAY": "HD", HALFDAY: "HD",
  "MISSING PUNCH": "MIS", "MISS PUNCH": "MIS",
  "WEEKLY OFF": "WO", "WEEK OFF": "WO", "WEEK-OFF": "WO",
  HOLIDAY: "WO", "PUBLIC HOLIDAY": "WO",
  LATE: "P", "LATE ARRIVAL": "P", "EARLY OUT": "P",
  "P/WO": "P", "WO-I": "WO",
  "CASUAL LEAVE": "CL", "SICK LEAVE": "SL",
  "EARNED LEAVE": "EL", "PRIVILEGE LEAVE": "PL",
  "LEAVE WITHOUT PAY": "LWP", "UNPAID LEAVE": "LWP",
  "COMP OFF": "CO", "COMP-OFF": "CO",
  "ON DUTY": "OD", "WORK FROM HOME": "WFH",
};

function normalizeStatus(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  return STATUS_MAP[raw.trim().toUpperCase()] || null;
}

function normalizeDate(dateStr: string): string | null {
  if (!dateStr?.trim()) return null;
  const s = dateStr.trim();
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    if (+y >= 2000 && +y <= 2100 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return s;
    return null;
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    if (+y < 2000 || +y > 2100) return null;
    const day = +a > 12 ? +a : +b > 12 ? +b : +a;
    const month = +a > 12 ? +b : +b > 12 ? +a : +b;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/](\d{2})[\/](\d{2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    if (+y >= 2000 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${y}-${m}-${d}`;
  }
  return null;
}

function normalizeTime(timeStr: string): string | null {
  if (!timeStr?.trim()) return null;
  const s = timeStr.trim();
  // 12-hour: 9:30 AM
  const tw = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)$/i);
  if (tw) {
    let h = parseInt(tw[1]);
    const m = parseInt(tw[2]), sec = parseInt(tw[3] || "0");
    const mer = tw[4].toUpperCase();
    if (mer === "AM" && h === 12) h = 0;
    if (mer === "PM" && h !== 12) h += 12;
    if (h > 23 || m > 59 || sec > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  // 24-hour: HH:mm or HH:mm:ss
  const col = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (col) {
    const h = parseInt(col[1]), m = parseInt(col[2]), sec = parseInt(col[3] || "0");
    if (h > 23 || m > 59 || sec > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 4️⃣  TEXT-BASED PARSERS (CSV/TXT fallback)
// ═══════════════════════════════════════════════════════════════

function parseDetailedFormat(text: string): { employees: ParsedEmployee[]; errors: string[] } {
  const errors: string[] = [];
  const empBlockAnchor = /(?=(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:)/i;
  const empBlockTest = /(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:/i;
  const blocks = text.split(empBlockAnchor).filter(b => empBlockTest.test(b));
  if (blocks.length === 0) return { employees: [], errors: ["No employee blocks found"] };

  const empMap = new Map<string, ParsedEmployee>();

  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    let empCode = "", empName = "", cardNo = "";

    for (const line of lines) {
      const cm = line.match(/(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID))\s*:\s*(\S+)/i);
      if (cm) empCode = cm[1].trim();
      const nm = line.match(/Name\s*:\s*(.+?)(?:\s+Card|\s+Emp|\s*$)/i);
      if (nm) empName = nm[1].trim();
      if (!empName) { const nm2 = line.match(/Name\s*:\s*(.+)/i); if (nm2) empName = nm2[1].replace(/Card\s*No\s*:\s*\S+/i, "").trim(); }
      const cm2 = line.match(/Card\s*No\s*:\s*(\S+)/i);
      if (cm2) cardNo = cm2[1].trim();
    }
    if (!empCode) continue;

    const records: EmployeeRecord[] = [];
    for (const line of lines) {
      const dateMatch = line.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})/) || line.match(/^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
      if (!dateMatch) continue;
      const isoDate = normalizeDate(dateMatch[1]);
      if (!isoDate) continue;
      const timeMatches = line.match(/\d{1,2}:\d{2}(?:[:.]\d{2})?(?:\s*[AaPp][Mm])?/g) || [];
      const normalizedTimes = timeMatches.map(t => normalizeTime(t)).filter((t): t is string => t !== null);
      const statusMatch = line.match(/\b(P|A|HD|MIS|NA|WO|WFH|CL|SL|EL|PL|OD|CO|LWP|AB|PRESENT|ABSENT)\b/i);
      const status = statusMatch ? (normalizeStatus(statusMatch[1]) || statusMatch[1].toUpperCase()) : undefined;
      records.push({
        date: isoDate, status,
        in_time: normalizedTimes[0] || null,
        out_time: normalizedTimes.length > 1 ? normalizedTimes[normalizedTimes.length - 1] : null,
        punches: normalizedTimes,
      });
    }

    if (empMap.has(empCode)) {
      const existing = empMap.get(empCode)!;
      const existingDates = new Set(existing.records.map(r => r.date));
      for (const rec of records) if (!existingDates.has(rec.date)) existing.records.push(rec);
    } else {
      empMap.set(empCode, { employee_code: empCode, employee_name: empName, card_no: cardNo || undefined, records });
    }
  }
  return { employees: Array.from(empMap.values()), errors };
}

function parseSummaryFormat(text: string): { employees: ParsedEmployee[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const empMap = new Map<string, ParsedEmployee>();

  let globalDate: string | null = null;
  for (const line of lines) {
    const dm = line.match(/(?:On\s*Dated?|Date)\s*:\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
    if (dm) { globalDate = normalizeDate(dm[1]); break; }
  }

  for (const line of lines) {
    if (/Company\s*Name|Location\s*:|Attendance\s*Report|S\s*No\s+EMP/i.test(line)) continue;
    if (/EMP\s*Code.*In\s*Time|Employee.*Code.*Clock/i.test(line)) continue;

    const inlineDateMatch = line.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/) || line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
    let rowDate: string | null = null;
    if (inlineDateMatch) rowDate = normalizeDate(inlineDateMatch[1]);
    const effectiveDate = rowDate || globalDate;
    if (!effectiveDate) continue;

    const timeTokens = line.match(/\d{1,2}:\d{2}(?:[:.]\d{2})?(?:\s*[AaPp][Mm])?/g) || [];
    const validTimes = timeTokens.map(t => normalizeTime(t)).filter((t): t is string => t !== null);

    const statusMatch = line.match(/\b(PRESENT|ABSENT|P|A|HD|MIS|NA|WO|WFH|CL|SL|EL|AB)\b/i);
    const status = statusMatch ? (normalizeStatus(statusMatch[1]) || statusMatch[1].toUpperCase()) : undefined;

    // Extract employee code
    let empCode = "";
    const rowMatch = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)(?:\s+General|\s+Shift|\s+\d{1,2}:\d{2})/i);
    if (rowMatch) { empCode = rowMatch[2]; }
    if (!empCode) {
      const em = line.match(/(?:^\d+\s+)?(\d{1,10})\s+(?:\d{2}\/\d{2}\/\d{4}|[A-Z][a-z])/);
      if (em) empCode = em[1];
    }
    if (!empCode) continue;

    if (!empMap.has(empCode)) empMap.set(empCode, { employee_code: empCode, employee_name: "", records: [] });
    const emp = empMap.get(empCode)!;
    if (!emp.records.some(r => r.date === effectiveDate)) {
      emp.records.push({
        date: effectiveDate, status,
        in_time: validTimes[0] || null,
        out_time: validTimes.length > 1 ? validTimes[1] : null,
        punches: validTimes,
      });
    }
  }
  return { employees: Array.from(empMap.values()), errors };
}

function detectFormat(text: string): "detailed" | "summary" | "unknown" {
  const hasEmpCodeHeader = /Employee\s*(?:Code|ID|No)\s*:/i.test(text) || /Emp\.?\s*(?:Code|ID)\s*:/i.test(text);
  const empCodeOccurrences = (text.match(/(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID))\s*:/gi) || []).length;
  const hasInTimeCol = /In\s*Time|Clock\s*In|Entry\s*Time/i.test(text);
  const hasOutTimeCol = /Out\s*Time|Clock\s*Out|Exit\s*Time/i.test(text);
  const hasEmpCodeCol = /EMP\s*Code|Employee\s*(?:Code|ID)/i.test(text);

  if (hasEmpCodeHeader && empCodeOccurrences >= 2) return "detailed";
  if (hasEmpCodeCol && hasInTimeCol && hasOutTimeCol) return "summary";
  if (hasEmpCodeHeader) return "detailed";
  return "unknown";
}

// ═══════════════════════════════════════════════════════════════
// 5️⃣  PUNCH BUILDER — Converts employees to flat punches
// ═══════════════════════════════════════════════════════════════

function buildPunches(employees: ParsedEmployee[]): ParsedPunch[] {
  const nextDay = (d: string) => new Date(Date.parse(d) + 86400_000).toISOString().split("T")[0];
  const punches: ParsedPunch[] = [];

  for (const emp of employees) {
    for (const rec of emp.records) {
      const absentStatuses = ["A", "NA", "AB", "WO", "CO"];
      if (rec.status && absentStatuses.includes(rec.status)) continue;

      if (rec.in_time && rec.in_time !== "00:00:00") {
        punches.push({
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          punch_datetime: `${rec.date}T${rec.in_time}`,
          raw_status: rec.status,
        });
      }
      if (rec.out_time && rec.out_time !== "00:00:00") {
        const outDate = rec.in_time && rec.out_time < rec.in_time ? nextDay(rec.date) : rec.date;
        punches.push({
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          punch_datetime: `${outDate}T${rec.out_time}`,
          raw_status: rec.status,
        });
      }
    }
  }
  return punches;
}

// ═══════════════════════════════════════════════════════════════
// 6️⃣  MAIN PARSE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

async function parseAttendanceText(text: string, extractionMethod: string): Promise<ParseResult> {
  const format = detectFormat(text);
  console.log(`[PARSE] Detected format: ${format}`);

  let employees: ParsedEmployee[] = [];
  let errors: string[] = [];

  if (format === "detailed") {
    const r = parseDetailedFormat(text);
    employees = r.employees; errors = r.errors;
  } else if (format === "summary") {
    const r = parseSummaryFormat(text);
    employees = r.employees; errors = r.errors;
  } else {
    // Try both
    const d = parseDetailedFormat(text);
    const s = parseSummaryFormat(text);
    const dc = d.employees.reduce((sum, e) => sum + e.records.length, 0);
    const sc = s.employees.reduce((sum, e) => sum + e.records.length, 0);
    if (dc > sc && d.employees.length > 0) { employees = d.employees; errors = d.errors; }
    else if (s.employees.length > 0) { employees = s.employees; errors = s.errors; }
  }

  if (employees.length === 0) {
    return {
      punches: [], employees: [], errors: ["No attendance records could be parsed from text content"], warnings: [],
      format, metadata: { extraction_method: extractionMethod, employees_detected: 0, validation_passed: false },
    };
  }

  const punches = buildPunches(employees);
  return {
    punches, employees, errors, warnings: [],
    format,
    metadata: { extraction_method: extractionMethod, employees_detected: employees.length, validation_passed: true },
  };
}

// ═══════════════════════════════════════════════════════════════
// 7️⃣  HTTP HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    let user: { id: string } | null = null;
    try {
      const { data, error: authError } = await adminClient.auth.getUser(token);
      if (authError || !data?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = data.user;
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { organization_id, file_name, preview_only } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentSize = (body.text_content?.length || 0) + (body.file_data?.length || 0);
    if (contentSize > 15_000_000) {
      return new Response(JSON.stringify({ error: "File too large (max 10MB)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PARSE ───────────────────────────────────────────
    let result: ParseResult;

    if (body.file_data) {
      // PDF file — use Gemini Vision as primary parser
      console.log(`[MAIN] PDF upload detected, using Gemini Vision primary parser`);

      try {
        result = await parseWithGeminiVision(body.file_data);
        console.log(`[MAIN] Vision parsed: ${result.employees.length} employees, ${result.punches.length} punches`);
      } catch (visionErr: any) {
        console.error(`[MAIN] Vision failed: ${visionErr.message}`);

        // Fallback to text extraction + deterministic parsing
        console.log(`[MAIN] Falling back to text extraction...`);
        try {
          const pdfBytes = base64ToUint8Array(body.file_data);
          const { text: rawText } = await extractTextFromPDF(pdfBytes);
          const normalized = rawText.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

          if (normalized.length < 50) {
            return new Response(JSON.stringify({
              success: false,
              error: `Vision parsing failed (${visionErr.message}) and text extraction yielded insufficient content (${normalized.length} chars). This PDF may be scanned/image-based.`,
              parse_errors: [visionErr.message],
              total_parsed: 0, inserted: 0, duplicates_skipped: 0, matched_employees: 0, unmatched_codes: [],
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          result = await parseAttendanceText(normalized, "text_fallback");
        } catch (textErr: any) {
          return new Response(JSON.stringify({
            success: false,
            error: `Both Vision and text parsing failed. Vision: ${visionErr.message}. Text: ${textErr.message}`,
            parse_errors: [visionErr.message, textErr.message],
            total_parsed: 0, inserted: 0, duplicates_skipped: 0, matched_employees: 0, unmatched_codes: [],
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    } else if (body.text_content) {
      // TXT/CSV — use text-based parsing
      result = await parseAttendanceText(body.text_content, "plain_text");
    } else {
      return new Response(JSON.stringify({ error: "No file content. Send file_data (PDF base64) or text_content (TXT/CSV)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[MAIN] Parse result: format=${result.format}, employees=${result.metadata.employees_detected}, punches=${result.punches.length}`);

    // ─── PREVIEW MODE — return parsed data without inserting ──
    if (preview_only) {
      return new Response(JSON.stringify({
        success: result.punches.length > 0,
        preview: true,
        employees: result.employees.map(e => ({
          employee_code: e.employee_code,
          employee_name: e.employee_name,
          department: e.department,
          records: e.records.map(r => ({
            date: r.date,
            in_time: r.in_time,
            out_time: r.out_time,
            late_minutes: r.late_minutes,
            early_departure: r.early_departure,
            work_hours: r.work_hours,
            status: r.status,
          })),
        })),
        total_records: result.employees.reduce((s, e) => s + e.records.length, 0),
        total_employees: result.employees.length,
        format: result.format,
        warnings: result.warnings,
        errors: result.errors,
        extraction_method: result.metadata.extraction_method,
        report_period: result.metadata.report_period,
        organization: result.metadata.organization,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (result.punches.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: result.errors.length > 0 ? result.errors[0] : "No attendance records could be parsed from the file",
        parse_errors: result.errors,
        format: result.format,
        extraction_method: result.metadata.extraction_method,
        total_parsed: 0, inserted: 0, duplicates_skipped: 0, matched_employees: 0, unmatched_codes: [],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── RESOLVE EMPLOYEE CODES → PROFILE IDs ────────────
    const uniqueCodes = [...new Set(result.punches.map(p => p.employee_code))];

    const { data: empDetails } = await adminClient
      .from("employee_details")
      .select("profile_id, employee_id_number")
      .eq("organization_id", organization_id)
      .in("employee_id_number", uniqueCodes);

    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", organization_id);

    const codeToProfileId = new Map<string, string>();
    const unmatchedCodes: string[] = [];

    for (const code of uniqueCodes) {
      const match = empDetails?.find((e: any) => e.employee_id_number === code);
      if (match) { codeToProfileId.set(code, match.profile_id); continue; }

      const punchName = result.punches.find(p => p.employee_code === code)?.employee_name;
      if (punchName) {
        const profileMatch = profiles?.find((p: any) => p.full_name?.toLowerCase() === punchName.toLowerCase());
        if (profileMatch) { codeToProfileId.set(code, profileMatch.id); continue; }
      }
      unmatchedCodes.push(code);
    }

    // ─── INSERT PUNCHES ──────────────────────────────────
    const batchId = crypto.randomUUID();
    const insertRows = result.punches
      .filter(p => codeToProfileId.has(p.employee_code))
      .map(p => ({
        organization_id,
        profile_id: codeToProfileId.get(p.employee_code)!,
        employee_code: p.employee_code,
        card_no: p.card_no || null,
        punch_datetime: p.punch_datetime,
        punch_source: "upload",
        raw_status: p.raw_status || null,
        upload_batch_id: batchId,
      }));

    let insertedCount = 0;
    let duplicateCount = 0;

    // Batch insert with duplicate detection
    for (const row of insertRows) {
      const { data: existing } = await adminClient
        .from("attendance_punches")
        .select("id")
        .eq("organization_id", row.organization_id)
        .eq("profile_id", row.profile_id)
        .eq("punch_datetime", row.punch_datetime)
        .limit(1);

      if (existing && existing.length > 0) { duplicateCount++; continue; }

      const { error: insertErr } = await adminClient.from("attendance_punches").insert(row);
      if (insertErr) { result.errors.push(`Insert error for ${row.employee_code}: ${insertErr.message}`); }
      else { insertedCount++; }
    }

    // ─── LOG THE UPLOAD ──────────────────────────────────
    await adminClient.from("attendance_upload_logs").insert({
      organization_id,
      uploaded_by: user!.id,
      file_name: file_name || "unknown",
      file_type: file_name?.split(".").pop()?.toLowerCase() || "pdf",
      total_punches: insertedCount,
      matched_employees: codeToProfileId.size,
      unmatched_codes: unmatchedCodes,
      duplicate_punches: duplicateCount,
      parse_errors: result.errors,
      status: "completed",
    });

    // ─── AUTO-AGGREGATE ──────────────────────────────────
    if (insertedCount > 0) {
      const punchDates = result.punches
        .filter(p => codeToProfileId.has(p.employee_code))
        .map(p => p.punch_datetime.split("T")[0])
        .filter(Boolean);
      const uniqueDates = [...new Set(punchDates)].sort();
      if (uniqueDates.length > 0) {
        try {
          await adminClient.rpc("recalculate_attendance_internal", {
            _org_id: organization_id,
            _start_date: uniqueDates[0],
            _end_date: uniqueDates[uniqueDates.length - 1],
          });
        } catch (e: any) {
          console.error(`[AGGREGATE] ${e.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      format: result.format,
      batch_id: batchId,
      total_parsed: result.punches.length,
      inserted: insertedCount,
      duplicates_skipped: duplicateCount,
      matched_employees: codeToProfileId.size,
      matched_employee_codes: Array.from(codeToProfileId.keys()),
      unmatched_codes: unmatchedCodes,
      parse_errors: result.errors,
      warnings: result.warnings,
      extraction_method: result.metadata.extraction_method,
      report_period: result.metadata.report_period,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error(`[MAIN] Unhandled error:`, err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || "Internal server error",
      parse_errors: [err.message],
      total_parsed: 0, inserted: 0, duplicates_skipped: 0, matched_employees: 0, unmatched_codes: [],
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
