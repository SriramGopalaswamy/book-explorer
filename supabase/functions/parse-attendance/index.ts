import { createClient } from "npm:@supabase/supabase-js@2";
import pako from "npm:pako@2.1.0";

// ═══════════════════════════════════════════════════════════════
// GRX10 Books — Biometric Attendance PDF Parser v7
// Strategy: Extract text first → Gemini text structuring → Vision fallback
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
// 1️⃣  GEMINI TEXT-BASED STRUCTURING (lightweight, no vision)
// ═══════════════════════════════════════════════════════════════

async function parseWithGeminiText(rawText: string): Promise<ParseResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  // Truncate to ~60k chars to stay within token limits
  const text = rawText.length > 60000 ? rawText.substring(0, 60000) : rawText;
  console.log(`[GEMINI-TEXT] Sending ${text.length} chars for structuring`);

  const prompt = `You are an attendance data extraction engine. Parse the following raw text extracted from a biometric attendance report (Secureye ONtime or similar).

The text contains employee attendance data in a calendar-grid layout:
- Each employee section has: Emp Code, Emp Name, Department
- Calendar grid: columns = days of month, rows = In Time, Out Time, Late Mins, Early Dep, Work Hrs, Status
- OR it may be a tabular daily format with dates and times

Extract ALL employee attendance records. Call the extract_attendance function with the data.

Rules:
- Dates must be YYYY-MM-DD format
- Times must be 24-hour HH:mm:ss format  
- Status codes: P, A, HD, MIS, WO, WFH, AB, CL, SL, EL, PL, OD, CO, LWP, NA
- P/WO → P, WO-I → WO
- Skip empty/no-data days
- Include ALL employees found

RAW TEXT:
${text}`;

  const toolDef = {
    type: "function" as const,
    function: {
      name: "extract_attendance",
      description: "Extract structured attendance data from text",
      parameters: {
        type: "object",
        properties: {
          organization: { type: "string" },
          report_period: { type: "string" },
          employees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                employee_code: { type: "string" },
                employee_name: { type: "string" },
                department: { type: "string" },
                records: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string" },
                      in_time: { type: "string" },
                      out_time: { type: "string" },
                      late_minutes: { type: "number" },
                      early_departure: { type: "number" },
                      work_hours: { type: "string" },
                      status: { type: "string" },
                    },
                    required: ["date"],
                  },
                },
              },
              required: ["employee_code", "employee_name", "records"],
            },
          },
        },
        required: ["employees"],
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: "extract_attendance" } },
        max_tokens: 64000,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[GEMINI-TEXT] API error: ${response.status} — ${errText.substring(0, 300)}`);
      if (response.status === 429) throw new Error("Rate limited — please try again in a minute");
      if (response.status === 402) throw new Error("AI credits exhausted — please add funds");
      throw new Error(`Gemini returned ${response.status}`);
    }

    const result = await response.json();
    const parsed = extractToolCallResult(result);
    if (!parsed || !Array.isArray(parsed.employees) || parsed.employees.length === 0) {
      throw new Error("Gemini returned no employee data from text");
    }

    return convertGeminiResult(parsed, "gemini_text");
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Text structuring timed out (50s)");
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2️⃣  GEMINI VISION (fallback for image-based/scanned PDFs)
// ═══════════════════════════════════════════════════════════════

async function parseWithGeminiVision(base64PdfData: string): Promise<ParseResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const base64SizeMB = base64PdfData.length / (1024 * 1024);
  console.log(`[VISION] PDF base64 size: ${base64SizeMB.toFixed(2)} MB`);

  if (base64SizeMB > 10) {
    throw new Error(`PDF too large for vision (${base64SizeMB.toFixed(1)}MB). Split into smaller files.`);
  }

  const prompt = `Extract ALL employee attendance data from this biometric PDF report.
Calendar-grid layout: columns = days, rows = In/Out/Late/Early/WorkHrs/Status.
Convert columns into daily rows. Dates: YYYY-MM-DD. Times: HH:mm:ss.
Status codes: P, A, HD, MIS, WO, WFH, AB, CL, SL, EL, PL, OD, CO, LWP, NA.
Call extract_attendance with the data.`;

  const toolDef = {
    type: "function" as const,
    function: {
      name: "extract_attendance",
      description: "Extract structured attendance data from PDF",
      parameters: {
        type: "object",
        properties: {
          organization: { type: "string" },
          report_period: { type: "string" },
          employees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                employee_code: { type: "string" },
                employee_name: { type: "string" },
                department: { type: "string" },
                records: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string" },
                      in_time: { type: "string" },
                      out_time: { type: "string" },
                      late_minutes: { type: "number" },
                      early_departure: { type: "number" },
                      work_hours: { type: "string" },
                      status: { type: "string" },
                    },
                    required: ["date"],
                  },
                },
              },
              required: ["employee_code", "employee_name", "records"],
            },
          },
        },
        required: ["employees"],
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64PdfData}` } },
          ],
        }],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: "extract_attendance" } },
        max_tokens: 64000,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VISION] API error: ${response.status} — ${errText.substring(0, 300)}`);
      if (response.status === 429) throw new Error("Rate limited — please try again in a minute");
      if (response.status === 402) throw new Error("AI credits exhausted — please add funds");
      throw new Error(`Vision API returned ${response.status}`);
    }

    const result = await response.json();
    const parsed = extractToolCallResult(result);
    if (parsed && Array.isArray(parsed.employees) && parsed.employees.length > 0) {
      return convertGeminiResult(parsed, "gemini_vision");
    }

    // Fallback: if model returned plain text instead of tool call, re-run through text parser.
    const assistantText = extractAssistantText(result);
    if (assistantText.length > 80) {
      console.log(`[VISION] Tool call missing; retrying via text parser (${assistantText.length} chars)`);
      try {
        return await parseWithGeminiText(assistantText);
      } catch (e: any) {
        console.error(`[VISION] Text-parser fallback failed: ${e.message}`);
      }
    }

    throw new Error("Vision returned no employee data");
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Vision timed out (50s). Try a smaller PDF.");
    throw err;
  }
}

function extractAssistantText(result: any): string {
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

async function extractTextWithGeminiVision(base64PdfData: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `OCR this attendance PDF and return ONLY extracted text in plain lines.
Keep employee headers and attendance rows exactly as visible (Emp Code, Emp Name, Department, In Time, Out Time, Late Mins, Early Dep, Work Hrs, Status).
Do not summarize. Do not explain.`,
            },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64PdfData}` } },
          ],
        }],
        temperature: 0,
        max_tokens: 32000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VISION-OCR] API error: ${response.status} — ${errText.substring(0, 300)}`);
      if (response.status === 429) throw new Error("Rate limited — please try again in a minute");
      if (response.status === 402) throw new Error("AI credits exhausted — please add funds");
      throw new Error(`Vision OCR API returned ${response.status}`);
    }

    const result = await response.json();
    const text = extractAssistantText(result).replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 80) {
      throw new Error("Vision OCR returned insufficient text");
    }
    return text;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Vision OCR timed out (50s)");
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3️⃣  SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

function extractToolCallResult(result: any): any | null {
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch (e) {
      console.error(`[PARSE] Tool call JSON parse failed: ${e}`);
    }
  }
  // Fallback: try content
  const rawContent = result.choices?.[0]?.message?.content?.trim() || "";
  if (rawContent.length > 10) {
    const clean = rawContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "").trim();
    try { return JSON.parse(clean); } catch { /* ignore */ }
  }
  return null;
}

function convertGeminiResult(parsed: any, method: string): ParseResult {
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
      if (!isoDate) { errors.push(`Invalid date "${rec.date}" for ${code}`); continue; }

      const inTime = rec.in_time ? normalizeTime(rec.in_time) : null;
      const outTime = rec.out_time ? normalizeTime(rec.out_time) : null;
      const status = rec.status ? normalizeStatus(rec.status) || rec.status?.toUpperCase() : undefined;

      if (inTime && outTime && inTime > outTime) {
        warnings.push(`${code} on ${isoDate}: in > out (possible night shift)`);
      }
      if (rec.work_hours) {
        const whMatch = rec.work_hours.match?.(/(\d+):(\d+)/);
        if (whMatch && parseInt(whMatch[1]) > 16) {
          warnings.push(`${code} on ${isoDate}: work_hours ${rec.work_hours} > 16h`);
        }
      }
      if (rec.late_minutes && rec.late_minutes > 240) {
        warnings.push(`${code} on ${isoDate}: late ${rec.late_minutes}min extremely high`);
      }
      if (status === "MIS") warnings.push(`${code} on ${isoDate}: Missing punch`);

      records.push({
        date: isoDate, status,
        in_time: inTime, out_time: outTime,
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

  console.log(`[${method}] Extracted ${employees.length} employees, ${employees.reduce((s, e) => s + e.records.length, 0)} records`);

  return {
    punches: buildPunches(employees),
    employees, errors, warnings,
    format: "secureye_calendar",
    metadata: {
      organization: parsed.organization || undefined,
      report_period: parsed.report_period || undefined,
      extraction_method: method,
      employees_detected: employees.length,
      validation_passed: employees.length > 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 4️⃣  PDF TEXT EXTRACTION (no external deps)
// ═══════════════════════════════════════════════════════════════

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

  interface PdfStreamEntry {
    dict: string;
    bytes: Uint8Array;
  }

  const streamEntries: PdfStreamEntry[] = [];

  // Primary strategy: length-based extraction (robust against binary "endstream" bytes inside payload)
  const streamObjRegex = /(<<[\s\S]*?>>)\s*stream\r?\n/g;
  let streamObjMatch: RegExpExecArray | null;
  while ((streamObjMatch = streamObjRegex.exec(raw)) !== null) {
    const dict = streamObjMatch[1];
    const lengthMatch = dict.match(/\/Length\s+(\d+)/i);
    if (!lengthMatch) continue;

    const length = Number(lengthMatch[1]);
    if (!Number.isFinite(length) || length <= 0) continue;

    const streamStart = streamObjRegex.lastIndex;
    const streamEnd = streamStart + length;
    if (streamEnd > raw.length) continue;

    const rawSlice = raw.slice(streamStart, streamEnd);
    const bytes = Uint8Array.from(rawSlice, (c) => c.charCodeAt(0) & 0xff);
    streamEntries.push({ dict, bytes });

    // Skip to end of this stream payload to avoid nested/duplicate captures
    streamObjRegex.lastIndex = streamEnd;
  }

  // Fallback strategy: delimiter-based extraction
  if (streamEntries.length === 0) {
    const fallbackRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let fallbackMatch: RegExpExecArray | null;
    while ((fallbackMatch = fallbackRegex.exec(raw)) !== null) {
      const bytes = Uint8Array.from(fallbackMatch[1], (c) => c.charCodeAt(0) & 0xff);
      streamEntries.push({ dict: "", bytes });
    }
  }

  const decodedStreams: string[] = [];

  const decodeBytes = (input: Uint8Array) => new TextDecoder("latin1").decode(input);

  const inflate = async (bytes: Uint8Array): Promise<string | null> => {
    // Primary: pako (most reliable for PDF Flate streams)
    try {
      const inflated = pako.inflate(bytes);
      if (inflated?.length) return decodeBytes(inflated);
    } catch {
      // ignore and try next strategy
    }

    try {
      const inflatedRaw = pako.inflateRaw(bytes);
      if (inflatedRaw?.length) return decodeBytes(inflatedRaw);
    } catch {
      // ignore and try next strategy
    }

    // Secondary: native DecompressionStream fallback
    for (const format of ["deflate", "deflate-raw"] as const) {
      try {
        const ds = new DecompressionStream(format);
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(bytes).catch(() => {});
        writer.close().catch(() => {});

        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const totalLen = chunks.reduce((s, c) => s + c.length, 0);
        if (totalLen === 0) continue;

        const merged = new Uint8Array(totalLen);
        let off = 0;
        for (const chunk of chunks) {
          merged.set(chunk, off);
          off += chunk.length;
        }

        return decodeBytes(merged);
      } catch {
        // try next format
      }
    }

    return null;
  };

  for (const entry of streamEntries) {
    const { dict, bytes } = entry;
    const hasFlate = /\/FlateDecode/i.test(dict);
    const hasLzw = /\/LZWDecode/i.test(dict);

    let decoded: string | null = null;

    if (hasFlate || !dict) {
      decoded = await inflate(bytes);
    }

    if (!decoded && hasLzw) {
      try {
        const lzwDecoded = lzwDecode(bytes);
        decoded = new TextDecoder("latin1").decode(lzwDecoded);
      } catch {
        decoded = null;
      }
    }

    if (!decoded) {
      decoded = new TextDecoder("latin1").decode(bytes);
    }

    if (decoded.length > 10) {
      decodedStreams.push(decoded);
    }
  }

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
// 5️⃣  NORMALIZATION HELPERS
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
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    if (+y >= 2000 && +y <= 2100 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return s;
    return null;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    if (+y < 2000 || +y > 2100) return null;
    const day = +a > 12 ? +a : +b > 12 ? +b : +a;
    const month = +a > 12 ? +b : +b > 12 ? +a : +b;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
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
  if (s === "-" || s === "--" || s === "00:00" || s === "00:00:00") return null;
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
  const col = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (col) {
    const h = parseInt(col[1]), m = parseInt(col[2]), sec = parseInt(col[3] || "0");
    if (h > 23 || m > 59 || sec > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 6️⃣  PUNCH BUILDER
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
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = authData.user;

    const body = await req.json();
    const { organization_id, file_name, preview_only } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PARSE STRATEGY ──────────────────────────────────
    // 1. Extract text from PDF
    // 2. If text found (>80 chars), parse via text-first path (Gemini + regex)
    // 3. If text still unusable, send PDF to Gemini Vision fallback
    let result!: ParseResult;

    if (body.file_data) {
      const base64Size = body.file_data.length;
      console.log(`[MAIN] PDF upload: ${(base64Size / 1024 / 1024).toFixed(2)} MB base64, file: ${file_name}`);

      // Step 1: Extract text from PDF
      let extractedText = "";
      try {
        const pdfBytes = base64ToUint8Array(body.file_data);
        const { text } = await extractTextFromPDF(pdfBytes);
        extractedText = text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        console.log(`[MAIN] Text extracted: ${extractedText.length} chars`);
      } catch (e: any) {
        console.error(`[MAIN] Text extraction failed: ${e.message}`);
      }

      // Step 1b: If local extraction is weak, run vision OCR-to-text first
      if (extractedText.length <= 80) {
        console.log(`[MAIN] Local extraction too low (${extractedText.length} chars). Trying vision OCR text...`);
        try {
          const visionText = await extractTextWithGeminiVision(body.file_data);
          if (visionText.length > extractedText.length) {
            extractedText = visionText;
          }
          console.log(`[MAIN] Vision OCR text extracted: ${visionText.length} chars`);
        } catch (ocrErr: any) {
          console.error(`[MAIN] Vision OCR text failed: ${ocrErr.message}`);
        }
      }

      // Step 2: If we have meaningful text, use Gemini TEXT mode (much smaller payload)
      if (extractedText.length > 80) {
        console.log(`[MAIN] Using Gemini TEXT mode (${extractedText.length} chars)`);
        try {
          result = await parseWithGeminiText(extractedText);
          console.log(`[MAIN] Gemini text parsed: ${result.employees.length} employees`);
        } catch (textErr: any) {
          console.error(`[MAIN] Gemini text failed: ${textErr.message}`);
          // Fall through to local regex and then vision
        }
      }

      // Step 2b: Local regex fallback when we have some text but Gemini text failed
      if ((!result || result.employees.length === 0) && extractedText.length > 0) {
        try {
          const format = detectFormat(extractedText);
          const parsed = format === "detailed"
            ? parseDetailedFormat(extractedText)
            : parseSummaryFormat(extractedText);

          if (parsed.employees.length > 0) {
            result = {
              punches: buildPunches(parsed.employees),
              employees: parsed.employees,
              errors: parsed.errors,
              warnings: [],
              format,
              metadata: {
                extraction_method: "regex_fallback",
                employees_detected: parsed.employees.length,
                validation_passed: true,
              },
            };
            console.log(`[MAIN] Regex fallback parsed: ${result.employees.length} employees`);
          }
        } catch (regexErr: any) {
          console.error(`[MAIN] Regex fallback failed: ${regexErr.message}`);
        }
      }

      // Step 3: If text mode + regex failed or no text, try Vision
      if (!result || result.employees.length === 0) {
        console.log(`[MAIN] Falling back to Gemini Vision...`);
        try {
          result = await parseWithGeminiVision(body.file_data);
          console.log(`[MAIN] Vision parsed: ${result.employees.length} employees`);
        } catch (visionErr: any) {
          console.error(`[MAIN] Vision also failed: ${visionErr.message}`);

          // Both failed
          return new Response(JSON.stringify({
            success: false,
            error: `Could not parse this PDF. ${visionErr.message}`,
            parse_errors: [visionErr.message],
            suggestions: [
              "Try exporting as Excel/CSV from the biometric software",
              "Split large PDFs into smaller files (10-15 pages)",
              "Ensure the PDF is not password-protected",
              "Re-export from Secureye ONtime software",
            ],
            total_parsed: 0, inserted: 0, duplicates_skipped: 0, matched_employees: 0, unmatched_codes: [],
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

    } else if (body.text_content) {
      // Direct text/CSV input
      try {
        result = await parseWithGeminiText(body.text_content);
      } catch {
        // Fallback to regex parsers
        const format = detectFormat(body.text_content);
        let employees: ParsedEmployee[] = [];
        let errors: string[] = [];
        if (format === "detailed") {
          const r = parseDetailedFormat(body.text_content);
          employees = r.employees; errors = r.errors;
        } else {
          const r = parseSummaryFormat(body.text_content);
          employees = r.employees; errors = r.errors;
        }
        result = {
          punches: buildPunches(employees), employees, errors, warnings: [],
          format, metadata: { extraction_method: "regex", employees_detected: employees.length, validation_passed: employees.length > 0 },
        };
      }
    } else {
      return new Response(JSON.stringify({ error: "No file content. Send file_data (PDF base64) or text_content." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[MAIN] Final: ${result.employees.length} employees, ${result.punches.length} punches, method=${result.metadata.extraction_method}`);

    // ─── PREVIEW MODE ────────────────────────────────────
    if (preview_only) {
      return new Response(JSON.stringify({
        success: result.employees.length > 0,
        preview: true,
        employees: result.employees.map(e => ({
          employee_code: e.employee_code,
          employee_name: e.employee_name,
          department: e.department,
          records: e.records.map(r => ({
            date: r.date, in_time: r.in_time, out_time: r.out_time,
            late_minutes: r.late_minutes, early_departure: r.early_departure,
            work_hours: r.work_hours, status: r.status,
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
        error: result.errors[0] || "No attendance records could be parsed",
        parse_errors: result.errors,
        total_parsed: 0, inserted: 0, duplicates_skipped: 0, matched_employees: 0, unmatched_codes: [],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── RESOLVE EMPLOYEE CODES → PROFILE IDs ────────────
    const uniqueCodes = [...new Set(result.punches.map(p => p.employee_code))];

    // 1. Check saved mappings first
    const { data: savedMappings } = await adminClient
      .from("employee_code_mappings")
      .select("employee_code, profile_id")
      .eq("organization_id", organization_id)
      .in("employee_code", uniqueCodes);

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
      // Priority: saved mapping > employee_details code > name match
      const saved = savedMappings?.find((m: any) => m.employee_code === code);
      if (saved) { codeToProfileId.set(code, saved.profile_id); continue; }
      const match = empDetails?.find((e: any) => e.employee_id_number === code);
      if (match) { codeToProfileId.set(code, match.profile_id); continue; }
      const punchName = result.punches.find(p => p.employee_code === code)?.employee_name;
      if (punchName) {
        const profileMatch = profiles?.find((p: any) => p.full_name?.toLowerCase() === punchName.toLowerCase());
        if (profileMatch) { codeToProfileId.set(code, profileMatch.id); continue; }
      }
      unmatchedCodes.push(code);
    }

    if (savedMappings?.length) {
      console.log(`[MAIN] ${savedMappings.length} saved mappings applied from employee_code_mappings`);
    }

    // ─── APPLY MANUAL MAPPINGS (from match step) ─────────
    if (body.manual_mappings && Array.isArray(body.manual_mappings)) {
      for (const mapping of body.manual_mappings) {
        if (mapping.employee_code && mapping.profile_id) {
          codeToProfileId.set(mapping.employee_code, mapping.profile_id);
          const idx = unmatchedCodes.indexOf(mapping.employee_code);
          if (idx >= 0) unmatchedCodes.splice(idx, 1);
        }
      }
      console.log(`[MAIN] Applied ${body.manual_mappings.length} manual mappings`);

      // Persist manual mappings for future uploads (upsert)
      const upsertRows = body.manual_mappings
        .filter((m: any) => m.employee_code && m.profile_id)
        .map((m: any) => ({
          organization_id,
          employee_code: m.employee_code,
          profile_id: m.profile_id,
          source_device: 'biometric',
          employee_name_hint: result.punches.find(p => p.employee_code === m.employee_code)?.employee_name || null,
          updated_at: new Date().toISOString(),
        }));

      if (upsertRows.length > 0) {
        const { error: upsertErr } = await adminClient
          .from("employee_code_mappings")
          .upsert(upsertRows, { onConflict: "organization_id,employee_code" });
        if (upsertErr) {
          console.error(`[MAIN] Failed to save mappings: ${upsertErr.message}`);
        } else {
          console.log(`[MAIN] Persisted ${upsertRows.length} code mappings for future use`);
        }
      }
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
      uploaded_by: user.id,
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

// ─── Legacy regex parsers (fallback for text_content) ────────

function parseDetailedFormat(text: string): { employees: ParsedEmployee[]; errors: string[] } {
  const errors: string[] = [];
  const empBlockAnchor = /(?=(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:)/i;
  const empBlockTest = /(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:/i;
  const blocks = text.split(empBlockAnchor).filter(b => empBlockTest.test(b));
  if (blocks.length === 0) return { employees: [], errors: ["No employee blocks found"] };

  const empMap = new Map<string, ParsedEmployee>();
  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    let empCode = "", empName = "";
    for (const line of lines) {
      const cm = line.match(/(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID))\s*:\s*(\S+)/i);
      if (cm) empCode = cm[1].trim();
      const nm = line.match(/Name\s*:\s*(.+?)(?:\s+Card|\s+Emp|\s*$)/i);
      if (nm) empName = nm[1].trim();
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
    if (!empMap.has(empCode)) empMap.set(empCode, { employee_code: empCode, employee_name: empName, records });
    else {
      const existing = empMap.get(empCode)!;
      const existingDates = new Set(existing.records.map(r => r.date));
      for (const rec of records) if (!existingDates.has(rec.date)) existing.records.push(rec);
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
    const inlineDateMatch = line.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/) || line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
    let rowDate: string | null = null;
    if (inlineDateMatch) rowDate = normalizeDate(inlineDateMatch[1]);
    const effectiveDate = rowDate || globalDate;
    if (!effectiveDate) continue;
    const timeTokens = line.match(/\d{1,2}:\d{2}(?:[:.]\d{2})?(?:\s*[AaPp][Mm])?/g) || [];
    const validTimes = timeTokens.map(t => normalizeTime(t)).filter((t): t is string => t !== null);
    const statusMatch = line.match(/\b(PRESENT|ABSENT|P|A|HD|MIS|NA|WO|WFH|CL|SL|EL|AB)\b/i);
    const status = statusMatch ? (normalizeStatus(statusMatch[1]) || statusMatch[1].toUpperCase()) : undefined;
    let empCode = "";
    const rowMatch = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)(?:\s+General|\s+Shift|\s+\d{1,2}:\d{2})/i);
    if (rowMatch) empCode = rowMatch[2];
    if (!empCode) { const em = line.match(/(?:^\d+\s+)?(\d{1,10})\s+(?:\d{2}\/\d{2}\/\d{4}|[A-Z][a-z])/); if (em) empCode = em[1]; }
    if (!empCode) continue;
    if (!empMap.has(empCode)) empMap.set(empCode, { employee_code: empCode, employee_name: "", records: [] });
    const emp = empMap.get(empCode)!;
    if (!emp.records.some(r => r.date === effectiveDate)) {
      emp.records.push({ date: effectiveDate, status, in_time: validTimes[0] || null, out_time: validTimes[1] || null, punches: validTimes });
    }
  }
  return { employees: Array.from(empMap.values()), errors };
}

function detectFormat(text: string): string {
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
