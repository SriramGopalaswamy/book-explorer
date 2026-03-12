import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ═══════════════════════════════════════════════════════════════
// GRX10 Books — Deterministic Attendance PDF Parser
// Production-grade, compliance-critical, no LLM inference
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
  card_no?: string;
  punch_datetime: string;   // ISO: YYYY-MM-DDTHH:mm:ss
  raw_status?: string;
}

interface ParsedEmployee {
  employee_code: string;
  employee_name: string;
  card_no?: string;
  shift_name?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  records: EmployeeRecord[];
}

interface EmployeeRecord {
  date: string;           // YYYY-MM-DD
  status?: string;
  in_time?: string | null;
  out_time?: string | null;
  work_hours?: string | null;
  punches: string[];      // HH:mm:ss[]
}

interface ParseResult {
  punches: ParsedPunch[];
  employees: ParsedEmployee[];
  errors: string[];
  format: "detailed" | "summary" | "unknown";
  metadata: {
    organization?: string;
    date?: string;
    extraction_method: string;
    employees_detected: number;
    validation_passed: boolean;
  };
}

interface DelimiterAnalysis {
  primary_delimiter: string;
  status: "STABLE" | "INCONSISTENT" | "DRIFT_DETECTED" | "NONE";
  candidates: Record<string, { frequency: number; avg_per_line: number; variance: number }>;
}

interface ColumnAnalysis {
  avg_columns: number;
  variance: number;
  consistency: "STABLE" | "UNSTABLE";
  outlier_rows: number;
  total_table_rows: number;
}

interface DiagnosticReport {
  file_name: string;
  pages?: number;
  extraction: {
    total_characters: number;
    first_1000_chars: string;
    last_1000_chars: string;
    line_count: number;
    first_50_lines: string[];
  };
  patterns: {
    date_count: number;
    time_count: number;
    employee_code_count: number;
    status_count: number;
    date_samples: string[];
    time_samples: string[];
  };
  fragmentation: {
    single_token_lines: number;
    numeric_only_lines: number;
    time_only_lines: number;
    avg_line_length: number;
    max_line_length: number;
    min_line_length: number;
    empty_line_count: number;
  };
  classification: {
    guess: "likely_summary" | "likely_punch" | "unknown";
    confidence_signals: string[];
  };
  delimiter_analysis: DelimiterAnalysis;
  column_analysis: ColumnAnalysis;
  encoding_anomalies: string[];
  structural_confidence: number;
}

// ═══════════════════════════════════════════════════════════════
// 1️⃣  EXTRACTION LAYER — Two-stage pipeline
// ═══════════════════════════════════════════════════════════════

/**
 * Stage A: Pure PDF text extraction — zero external dependencies.
 * Parses the raw PDF binary stream to extract text content objects.
 * Works in any Deno/edge runtime without workers, Canvas, or Node APIs.
 */
// ─── Pure-JS LZW Decompressor (PDF LZWDecode filter) ─────────
// Handles early PDF 1.0-1.1 biometric exports that use LZWDecode.
// Deno's DecompressionStream only supports deflate/gzip — LZW needs custom impl.
function lzwDecode(compressed: Uint8Array): Uint8Array {
  const CLEAR_CODE = 256, EOI_CODE = 257;
  const table: Uint8Array[] = [];
  for (let i = 0; i < 256; i++) table.push(new Uint8Array([i]));
  table.push(new Uint8Array(0)); // 256 = clear
  table.push(new Uint8Array(0)); // 257 = EOI

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
    if (code === CLEAR_CODE) {
      table.length = 258;
      codeSize = 9;
      prevCode = null;
      continue;
    }
    let entry: Uint8Array;
    if (code < table.length) {
      entry = table[code];
    } else if (prevCode !== null && code === table.length) {
      const prev = table[prevCode];
      entry = new Uint8Array(prev.length + 1);
      entry.set(prev);
      entry[prev.length] = prev[0];
    } else {
      break; // corrupt stream
    }
    for (const b of entry) output.push(b);
    if (prevCode !== null) {
      const prev = table[prevCode];
      const newEntry = new Uint8Array(prev.length + 1);
      newEntry.set(prev);
      newEntry[prev.length] = entry[0];
      table.push(newEntry);
      if (table.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prevCode = code;
  }
  return new Uint8Array(output);
}

// ─── ASCII85 filter decoder ───────────────────────────────────
function decodeAscii85(data: string): Uint8Array {
  const output: number[] = [];
  let group = "", i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === "~" && data[i] === ">") break;
    if (c === "z") { output.push(0, 0, 0, 0); continue; }
    if (c < "!" || c > "u") continue;
    group += c;
    if (group.length === 5) {
      let b = 0;
      for (const ch of group) b = b * 85 + (ch.charCodeAt(0) - 33);
      output.push((b >> 24) & 0xFF, (b >> 16) & 0xFF, (b >> 8) & 0xFF, b & 0xFF);
      group = "";
    }
  }
  if (group.length > 0) {
    while (group.length < 5) group += "u";
    let b = 0;
    for (const ch of group) b = b * 85 + (ch.charCodeAt(0) - 33);
    const bytes = [(b >> 24) & 0xFF, (b >> 16) & 0xFF, (b >> 8) & 0xFF, b & 0xFF];
    output.push(...bytes.slice(0, group.length - 1));
  }
  return new Uint8Array(output);
}

async function extractTextFromPDF(data: Uint8Array): Promise<{ text: string; pages: number }> {
  // Decode PDF bytes to a raw string for regex-based stream parsing
  const raw = new TextDecoder("latin1").decode(data);

  // ─── Encrypted PDF detection ─────────────────────────────────
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(raw) || /\/Encrypt\s*<</.test(raw)) {
    throw new Error(
      "PDF_ENCRYPTED: This PDF is password-protected. Please export a non-encrypted version from your biometric software."
    );
  }

  // Count pages via /Type /Page (not /Pages which is the tree root)
  const pageMatches = raw.match(/\/Type\s*\/Page(?!\s*s)/g);
  const pages = pageMatches ? pageMatches.length : 0;
  console.log(`[PDF] Detected ${pages} page(s) in ${data.length} bytes`);

  // ─── Extract all content streams with filter metadata ────────
  // Capture the stream dictionary to determine encoding filters
  const streams: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) {
    streams.push(match[1]);
  }
  console.log(`[PDF] Found ${streams.length} content stream(s)`);

  // ─── Decode streams: FlateDecode / LZWDecode / ASCII85 / raw ─
  const decodedStreams: string[] = [];
  for (const stream of streams) {
    try {
      const rawBytes = Uint8Array.from(stream, (c) => c.charCodeAt(0));

      // Try FlateDecode first (most common in modern PDFs)
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
      } catch { /* fall through to LZW */ }

      // Try ASCII85Decode (some vendors wrap FlateDecode with ASCII85)
      if (/^[!-uz\s~>]+$/.test(stream.substring(0, 100))) {
        try {
          const a85Bytes = decodeAscii85(stream);
          const ds2 = new DecompressionStream("deflate");
          const w2 = ds2.writable.getWriter();
          const r2 = ds2.readable.getReader();
          w2.write(a85Bytes).catch(() => {});
          w2.close().catch(() => {});
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await r2.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const totalLen = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const chunk of chunks) { merged.set(chunk, off); off += chunk.length; }
          const decoded = new TextDecoder("latin1").decode(merged);
          if (decoded.length > 10) { decodedStreams.push(decoded); continue; }
        } catch { /* fall through to LZW */ }
      }

      // Try LZWDecode (deprecated but present in legacy biometric PDFs)
      try {
        const lzwDecoded = lzwDecode(rawBytes);
        const decoded = new TextDecoder("latin1").decode(lzwDecoded);
        if (decoded.length > 10 && /BT|Tj|TJ/.test(decoded)) {
          decodedStreams.push(decoded); continue;
        }
      } catch { /* fall through to raw */ }

      // Fallback: use raw stream
      decodedStreams.push(stream);
    } catch {
      decodedStreams.push(stream);
    }
  }

  // ─── Parse BT...ET text blocks with positional awareness ─────
  // Mark IV: track X/Y coordinates via Tm and Td operators.
  // Group text tokens by Y-band (row) then sort by X to reconstruct table columns.
  interface TextToken { x: number; y: number; text: string; }
  const allTokens: TextToken[] = [];

  for (const stream of decodedStreams) {
    const btBlocks = stream.match(/BT[\s\S]*?ET/g);
    if (!btBlocks) continue;

    for (const block of btBlocks) {
      let curX = 0, curY = 0;
      // Process operators line by line
      const ops = block.split(/\n/);
      for (const op of ops) {
        // Tm matrix: a b c d e f Tm — e=X, f=Y absolute position
        const tmMatch = op.match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/i);
        if (tmMatch) { curX = parseFloat(tmMatch[5]); curY = parseFloat(tmMatch[6]); }
        // Td/TD: dx dy Td — relative move
        const tdMatch = op.match(/([-\d.]+)\s+([-\d.]+)\s+T[dD]/i);
        if (tdMatch) { curX += parseFloat(tdMatch[1]); curY += parseFloat(tdMatch[2]); }
        // T* (next line) — approximate Y advance by -12 units
        if (/^T\*\s*$/.test(op.trim())) { curY -= 12; }
      }

      // Extract text and assign to current position
      const extractToken = (txt: string) => {
        if (txt.trim()) allTokens.push({ x: curX, y: curY, text: txt });
      };

      // Tj: (text) Tj
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
      if (tjMatches) {
        for (const tj of tjMatches) {
          const m = tj.match(/\(([^)]*)\)/);
          if (m) extractToken(decodePDFString(m[1]));
        }
      }
      // Tj: <hex> Tj
      const hexTjMatches = block.match(/<([0-9A-Fa-f]+)>\s*Tj/g);
      if (hexTjMatches) {
        for (const htj of hexTjMatches) {
          const m = htj.match(/<([0-9A-Fa-f]+)>/);
          if (m) extractToken(decodeHexPDFString(m[1]));
        }
      }
      // TJ: [(text) num] TJ
      const tjArrays = block.match(/\[(.*?)\]\s*TJ/gs);
      if (tjArrays) {
        for (const arr of tjArrays) {
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
  }

  // ─── Reconstruct text: group by Y-band, sort by X within each row ─
  // Tolerance: tokens within 3 units of Y are on the same line
  let fullText: string;
  if (allTokens.length > 0) {
    allTokens.sort((a, b) => b.y - a.y); // descending Y = top-to-bottom
    const rows: TextToken[][] = [];
    let currentRow: TextToken[] = [];
    let currentY = allTokens[0].y;
    const Y_TOLERANCE = 3;
    for (const token of allTokens) {
      if (Math.abs(token.y - currentY) <= Y_TOLERANCE) {
        currentRow.push(token);
      } else {
        if (currentRow.length > 0) rows.push([...currentRow].sort((a, b) => a.x - b.x));
        currentRow = [token];
        currentY = token.y;
      }
    }
    if (currentRow.length > 0) rows.push([...currentRow].sort((a, b) => a.x - b.x));
    fullText = rows.map(row => row.map(t => t.text).join(" ")).join("\n");
  } else {
    fullText = ""; // no positional tokens found — fall through to raw fallback
  }

  // Legacy path: also extract from non-positional sources (quote operator, etc.)
  const allTextLegacy: string[] = [];
  for (const stream of decodedStreams) {
    const btBlocks = stream.match(/BT[\s\S]*?ET/g);
    if (!btBlocks) continue;
    for (const block of btBlocks) {
      // ' operator: (text) '
      const quoteMatches = block.match(/\(([^)]*)\)\s*'/g);
      if (quoteMatches) {
        for (const qm of quoteMatches) {
          const m = qm.match(/\(([^)]*)\)/);
          if (m) { allTextLegacy.push("\n"); allTextLegacy.push(decodePDFString(m[1])); }
        }
      }
    }
  }

  // Merge positional text with legacy quote-operator text
  const legacyExtra = allTextLegacy.join(" ").replace(/\s{2,}/g, " ").trim();
  if (legacyExtra.length > 0 && fullText.length < 100) {
    fullText = legacyExtra;
  } else if (legacyExtra.length > 0) {
    fullText = fullText + "\n" + legacyExtra;
  }

  fullText = fullText
    .replace(/\s{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Fallback: raw uncompressed Tj extraction (both paren and hex)
  if (fullText.length < 100) {
    console.log(`[PDF] Low yield (${fullText.length} chars), trying raw fallback`);
    const rawParts: string[] = [];
    const rawTj = raw.match(/\(([^)]{2,})\)\s*Tj/g);
    if (rawTj) {
      for (const m of rawTj) {
        const t = m.match(/\(([^)]*)\)/);
        if (t) rawParts.push(decodePDFString(t[1]));
      }
    }
    const rawHexTj = raw.match(/<([0-9A-Fa-f]{4,})>\s*Tj/g);
    if (rawHexTj) {
      for (const m of rawHexTj) {
        const t = m.match(/<([0-9A-Fa-f]+)>/);
        if (t) rawParts.push(decodeHexPDFString(t[1]));
      }
    }
    if (rawParts.join(" ").length > fullText.length) {
      fullText = rawParts.join(" ").replace(/\s{2,}/g, " ").trim();
    }
  }

  console.log(`[PDF] Final text: ${fullText.length} chars`);
  return { text: fullText, pages };
}

/** Decode PDF escape sequences in parenthesized strings */
function decodePDFString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

/** Decode hex-encoded PDF strings — handles both single-byte and double-byte (UTF-16BE) */
function decodeHexPDFString(hex: string): string {
  // Pad odd-length hex
  if (hex.length % 2 !== 0) hex += "0";

  // Detect UTF-16BE: if length divisible by 4 and high bytes are 00 for ASCII range
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }

  // Check for BOM (FEFF) or if it looks like UTF-16BE (alternating 00 XX pattern)
  const isUtf16 = (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) ||
    (bytes.length >= 4 && bytes.length % 2 === 0 && bytes.every((b, i) => i % 2 === 0 ? b < 0x01 : true) &&
     bytes.filter((_, i) => i % 2 === 0).every(b => b === 0));

  if (isUtf16) {
    const startIdx = (bytes[0] === 0xFE && bytes[1] === 0xFF) ? 2 : 0;
    let result = "";
    for (let i = startIdx; i < bytes.length - 1; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code === 0) continue; // skip null chars
      result += String.fromCharCode(code);
    }
    return result;
  }

  // Single-byte encoding
  return bytes
    .filter(b => b >= 32 || b === 10 || b === 13 || b === 9)
    .map(b => String.fromCharCode(b))
    .join("");
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ═══════════════════════════════════════════════════════════════
// OCR FALLBACK — Gemini Vision API for scanned/image PDFs
// ═══════════════════════════════════════════════════════════════

async function ocrWithGemini(base64PdfData: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("OCR_UNAVAILABLE: LOVABLE_API_KEY not configured");

  console.log("[OCR] Sending scanned PDF to Gemini Vision for OCR...");

  const prompt = `You are an OCR engine extracting attendance data from a scanned PDF image.

CRITICAL RULES:
- Extract ALL text visible in the document exactly as it appears
- Preserve the tabular structure using consistent spacing or pipe delimiters
- Include ALL employee codes, names, dates, times, and status values
- Preserve column headers exactly as shown
- Each row should be on its own line
- Do NOT add any commentary, explanations, or formatting — output ONLY the raw extracted text
- If there are multiple pages, combine them into one continuous text output
- For dates, preserve the original format (DD/MM/YYYY)
- For times, preserve the original format (HH:mm or HH:mm:ss)

Output the extracted text now:`;

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
      max_tokens: 16000,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[OCR] Gemini API error: ${response.status} — ${errText}`);
    throw new Error(`OCR_API_ERROR: Gemini returned ${response.status}`);
  }

  const result = await response.json();
  const ocrText = result.choices?.[0]?.message?.content?.trim() || "";
  console.log(`[OCR] Gemini returned ${ocrText.length} chars of OCR text`);

  if (ocrText.length < 50) {
    throw new Error("OCR_LOW_YIELD: Gemini could not extract meaningful text from this PDF");
  }

  return ocrText;
}

/** Resolve text content from request body — handles PDF base64, plain text */
async function resolveTextContent(body: any): Promise<{ text: string; pages?: number; extractionMethod: string }> {
  // Case 1: Plain text (TXT/CSV)
  if (body.text_content && !body.text_content.startsWith("%PDF")) {
    return { text: body.text_content, extractionMethod: "plain_text" };
  }

  // Case 2: Base64-encoded PDF binary
  if (body.file_data) {
    console.log(`[EXTRACT] Decoding base64 PDF (${body.file_data.length} chars)`);
    const pdfBytes = base64ToUint8Array(body.file_data);
    console.log(`[EXTRACT] PDF binary: ${pdfBytes.length} bytes`);

    const { text: rawText, pages } = await extractTextFromPDF(pdfBytes);
    const normalized = normalizeText(rawText);

    console.log(`[EXTRACT] Extracted ${normalized.length} chars from ${pages} pages`);

    // Stage B threshold — Mark IV: smarter multi-signal check
    // Trigger OCR when: text is sparse OR date density is far below page-count expectation
    const dateCount = [
      ...(normalized.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/g) || []),
      ...(normalized.match(/\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/g) || []),
    ].length;
    const timeCount = (normalized.match(/\d{1,2}:\d{2}/g) || []).length;
    const expectedDatesPerPage = 25; // daily attendance: ~25 dates per page
    const dateDensityInsufficient = pages > 0 && dateCount < pages * expectedDatesPerPage * 0.3;

    if (normalized.length < 500 || (dateDensityInsufficient && dateCount < 5)) {
      if (dateCount === 0 && timeCount === 0) {
        // Definitively a scanned/image PDF — use Gemini OCR
        console.log("[EXTRACT] Zero dates/times — triggering AI OCR fallback...");
        try {
          const ocrText = await ocrWithGemini(body.file_data);
          const ocrNormalized = normalizeText(ocrText);
          return { text: ocrNormalized, pages, extractionMethod: "gemini_ocr" };
        } catch (ocrErr: any) {
          console.error(`[EXTRACT] OCR fallback also failed: ${ocrErr.message}`);
          throw new Error(
            "PDF_EXTRACTION_FAILED: This appears to be a scanned image PDF. " +
            "Text extraction found " + normalized.length + " chars and AI OCR also failed: " + ocrErr.message
          );
        }
      }
      if (dateDensityInsufficient && normalized.length < 500) {
        // Partially extracted but suspiciously sparse — try OCR to supplement
        console.log(`[EXTRACT] Sparse extraction (${normalized.length} chars, ${dateCount} dates, ${pages} pages) — trying OCR...`);
        try {
          const ocrText = await ocrWithGemini(body.file_data);
          const ocrNormalized = normalizeText(ocrText);
          // Use whichever produced more data
          if (ocrNormalized.length > normalized.length * 1.5) {
            return { text: ocrNormalized, pages, extractionMethod: "gemini_ocr" };
          }
        } catch {
          // OCR failed — proceed with what we have
          console.log("[EXTRACT] OCR failed on sparse PDF, proceeding with partial extraction");
        }
      }
    }

    return { text: normalized, pages, extractionMethod: "pdfjs" };
  }

  // Case 3: Raw PDF sent as text (client error)
  if (body.text_content?.startsWith("%PDF")) {
    throw new Error(
      "PDF file was sent as raw text instead of binary. " +
      "Client must send PDF files as base64-encoded file_data."
    );
  }

  throw new Error("No valid file content provided. Send text_content (TXT/CSV) or file_data (PDF base64).");
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// 2️⃣  FORMAT DETECTION — Anchor keyword analysis
// ═══════════════════════════════════════════════════════════════

type AttendanceFormat = "detailed" | "summary" | "unknown";

function detectFormat(text: string): AttendanceFormat {
  const lines = text.split("\n");

  // ── Detailed format indicators (per-employee punch blocks) ──────────────────
  // Mark IV: expanded vocabulary for "Employee Code :" variants
  const hasEmployeeCodeHeader =
    /Employee\s*(?:Code|ID|No)\s*:/i.test(text) ||
    /Emp\.?\s*(?:Code|ID)\s*:/i.test(text) ||
    /Staff\s*(?:Code|ID)\s*:/i.test(text) ||
    /Badge\s*No\s*:/i.test(text);
  const hasShiftIndicator = /Shift\s*:/i.test(text);
  const hasPunchRows = lines.some(l => {
    // Lines with a date (any supported format) + time entries
    const dateMatch =
      /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(l) ||
      /\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(l);
    const timeMatches = (l.match(/\d{1,2}:\d{2}/g) || []).length;
    return dateMatch && timeMatches >= 1;
  });

  // ── Summary format indicators (tabular with status columns) ─────────────────
  // Mark IV: expanded column keyword vocabulary
  const hasEmpCodeColumn =
    /EMP\s*Code|Emp\.?\s*Code|Employee\s*(?:Code|ID)|Staff\s*(?:Code|ID)/i.test(text);
  const hasInTimeColumn =
    /In\s*Time|Clock\s*In|Punch\s*In|Entry\s*Time|First\s*Punch|Check[\s\-]?In/i.test(text);
  const hasOutTimeColumn =
    /Out\s*Time|Clock\s*Out|Punch\s*Out|Exit\s*Time|Last\s*Punch|Check[\s\-]?Out/i.test(text);
  const hasWorkHrsColumn = /Work\s*(?:Hrs?|Hours?)|Duration/i.test(text);
  const hasStatusColumn = /\b(Status|Att|Attendance|Remark)\b/i.test(text);

  // Score-based detection
  let detailedScore = 0;
  let summaryScore = 0;

  if (hasEmployeeCodeHeader) detailedScore += 3;
  if (hasShiftIndicator) detailedScore += 2;
  if (hasPunchRows && hasEmployeeCodeHeader) detailedScore += 2;

  if (hasEmpCodeColumn) summaryScore += 2;
  if (hasInTimeColumn) summaryScore += 2;
  if (hasOutTimeColumn) summaryScore += 2;
  if (hasWorkHrsColumn) summaryScore += 1;
  if (hasStatusColumn) summaryScore += 1;

  // Additional: count per-employee header occurrences (detailed has many, one per employee)
  const empCodeOccurrences = (text.match(/(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:/gi) || []).length;
  if (empCodeOccurrences >= 3) detailedScore += 3;

  console.log(`[FORMAT] Detailed score: ${detailedScore}, Summary score: ${summaryScore}`);
  console.log(`[FORMAT] Indicators: empCodeHeader=${hasEmployeeCodeHeader}, shift=${hasShiftIndicator}, empCodeCol=${hasEmpCodeColumn}, inTime=${hasInTimeColumn}`);

  if (detailedScore >= 5) return "detailed";
  if (summaryScore >= 4) return "summary";

  // Fallback heuristics
  if (hasEmployeeCodeHeader && hasPunchRows) return "detailed";
  if (empCodeOccurrences >= 2) return "detailed";

  // Check for tabular rows with status codes and times
  const statusRows = lines.filter(l =>
    /\b(P|A|HD|MIS|NA|WO|PRESENT|ABSENT|HOLIDAY)\b/i.test(l) && /\d{1,2}:\d{2}/.test(l)
  );
  if (statusRows.length >= 5) return "summary";

  return "unknown";
}

// ═══════════════════════════════════════════════════════════════
// 3️⃣  NORMALIZATION HELPERS — Mark IV
// ═══════════════════════════════════════════════════════════════

// Month name → number mapping for named-month date formats
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Intelligent multi-format date parser → YYYY-MM-DD
 * Supports: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY (US),
 *           DD-MMM-YYYY, DD MMM YYYY, DD-MMM-YY, MMMM DD YYYY, Excel serials
 */
function parseDateIntelligent(dateStr: string, forceFormat?: "dmy" | "mdy" | "ymd"): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();

  // ── ISO/YMD: YYYY-MM-DD or YYYY/MM/DD ──────────────────────
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const y = parseInt(yyyy), m = parseInt(mm), d = parseInt(dd);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  // ── Numeric DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY ─
  const numericMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (numericMatch) {
    const [, a, b, yyyy] = numericMatch;
    const y = parseInt(yyyy);
    if (y < 2000 || y > 2100) return null;
    const aInt = parseInt(a), bInt = parseInt(b);
    let day: number, month: number;
    if (forceFormat === "mdy") {
      month = aInt; day = bInt;
    } else if (forceFormat === "dmy" || aInt > 12) {
      day = aInt; month = bInt;
    } else if (bInt > 12) {
      month = aInt; day = bInt;
    } else {
      // Ambiguous — default to DD/MM/YYYY (Indian standard)
      day = aInt; month = bInt;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // ── 2-digit year: DD/MM/YY ──────────────────────────────────
  const twoYearMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (twoYearMatch) {
    const [, a, b, yy] = twoYearMatch;
    const year = 2000 + parseInt(yy);
    if (year > 2100) return null;
    const aInt = parseInt(a), bInt = parseInt(b);
    const day = aInt > 12 ? aInt : bInt > 12 ? bInt : aInt;
    const month = aInt > 12 ? bInt : bInt > 12 ? aInt : bInt;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // ── Named month: DD-MMM-YYYY, DD MMM YYYY, DD-MMM-YY ───────
  const namedMatch = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-](\d{2,4})$/);
  if (namedMatch) {
    const [, dd, monthStr, yearStr] = namedMatch;
    const month = MONTH_NAMES[monthStr.toLowerCase()];
    if (!month) return null;
    const day = parseInt(dd);
    const year = parseInt(yearStr) < 100 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
    if (year < 2000 || year > 2100 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // ── Named month long: "January 15, 2026" or "15 January 2026" ─
  const longMonthFirst = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longMonthFirst) {
    const month = MONTH_NAMES[longMonthFirst[1].toLowerCase()];
    if (month) {
      const day = parseInt(longMonthFirst[2]);
      const year = parseInt(longMonthFirst[3]);
      if (year >= 2000 && year <= 2100 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  const longDayFirst = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (longDayFirst) {
    const month = MONTH_NAMES[longDayFirst[2].toLowerCase()];
    if (month) {
      const day = parseInt(longDayFirst[1]);
      const year = parseInt(longDayFirst[3]);
      if (year >= 2000 && year <= 2100 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  // ── Excel date serial embedded as plain number ──────────────
  if (/^\d{5}$/.test(s)) {
    const num = parseInt(s);
    if (num >= 36526 && num <= 73050) {
      const utcDays = num - 25569;
      const date = new Date(utcDays * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
  }

  return null;
}

/**
 * Detect the dominant date format from a document's text.
 * Returns "dmy", "mdy", or "ymd" — used to lock interpretation for ambiguous dates.
 */
function detectDocumentDateFormat(text: string): "dmy" | "mdy" | "ymd" {
  const isoCount = (text.match(/\b\d{4}[-\/]\d{2}[-\/]\d{2}\b/g) || []).length;
  if (isoCount >= 5) return "ymd";
  const allNumericDates = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.]\d{4}\b/g) || [];
  const sample = allNumericDates.slice(0, 20);
  let dmyVotes = 0, mdyVotes = 0;
  for (const d of sample) {
    const m = d.match(/^(\d{1,2})[\/\-\.](\d{1,2})/);
    if (!m) continue;
    const a = parseInt(m[1]), b = parseInt(m[2]);
    if (a > 12 && b <= 12) dmyVotes++;
    else if (b > 12 && a <= 12) mdyVotes++;
  }
  if (mdyVotes > dmyVotes * 2) return "mdy";
  return "dmy"; // default: Indian standard DD/MM/YYYY
}

/**
 * Intelligent multi-format time parser → HH:mm:ss
 * Supports: HH:mm, HH:mm:ss, H:mm AM/PM, HH:mm AM/PM, HH.mm, HH.mm.ss, HHmm (military)
 */
function parseTimeIntelligent(timeStr: string): string | null {
  if (!timeStr || timeStr.trim() === "") return null;
  const s = timeStr.trim();

  // 12-hour format: 9:30 AM, 02:15 PM, 9:30:00 AM
  const twelveHourMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)$/i);
  if (twelveHourMatch) {
    let hours = parseInt(twelveHourMatch[1]);
    const minutes = parseInt(twelveHourMatch[2]);
    const seconds = parseInt(twelveHourMatch[3] || "0");
    const meridiem = twelveHourMatch[4].toUpperCase();
    if (meridiem === "AM" && hours === 12) hours = 0;
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  // 24-hour colon-separated: H:mm, HH:mm, H:mm:ss, HH:mm:ss
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1]);
    const minutes = parseInt(colonMatch[2]);
    const seconds = parseInt(colonMatch[3] || "0");
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  // Dot-separated: HH.mm or HH.mm.ss (not ISO decimal)
  const dotMatch = s.match(/^(\d{1,2})\.(\d{2})(?:\.(\d{2}))?$/);
  if (dotMatch) {
    const hours = parseInt(dotMatch[1]);
    const minutes = parseInt(dotMatch[2]);
    const seconds = parseInt(dotMatch[3] || "0");
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  // Military 4-digit: 0930, 2315 (no separator)
  if (/^\d{4}$/.test(s)) {
    const hours = parseInt(s.substring(0, 2));
    const minutes = parseInt(s.substring(2, 4));
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
    }
  }

  return null;
}

// Backward-compatible wrappers — all existing call sites preserved
function normalizeDate(dateStr: string): string | null {
  return parseDateIntelligent(dateStr);
}
function normalizeTime(timeStr: string): string | null {
  return parseTimeIntelligent(timeStr);
}

/** Expanded status code normalization — maps vendor codes to standard set */
const STATUS_MAP: Record<string, string> = {
  // Standard codes (pass-through)
  P: "P", A: "A", HD: "HD", MIS: "MIS", NA: "NA", WO: "WO",
  WFH: "WFH", CL: "CL", SL: "SL", EL: "EL", PL: "PL",
  OD: "OD", CO: "CO", LWP: "LWP", AB: "AB",
  // Numeric (ZKTeco / generic biometric systems)
  "1": "P", "0": "A", "2": "HD", "3": "MIS",
  // Boolean text
  TRUE: "P", FALSE: "A", YES: "P", NO: "A",
  // Verbose English (eSSL / Honeywell / others)
  PRESENT: "P", ABSENT: "A",
  "HALF DAY": "HD", HALFDAY: "HD",
  "MISSING PUNCH": "MIS", "MISS PUNCH": "MIS",
  "WEEKLY OFF": "WO", "WEEK OFF": "WO", "WEEK-OFF": "WO",
  HOLIDAY: "WO", "PUBLIC HOLIDAY": "WO",
  LATE: "P", "LATE ARRIVAL": "P", "EARLY OUT": "P",
  "CASUAL LEAVE": "CL", "SICK LEAVE": "SL", "MEDICAL LEAVE": "SL",
  "EARNED LEAVE": "EL", "PRIVILEGE LEAVE": "PL",
  "LEAVE WITHOUT PAY": "LWP", "UNPAID LEAVE": "LWP",
  "COMP OFF": "CO", "COMP-OFF": "CO",
  "ON DUTY": "OD", "OUT DUTY": "OD",
  "WORK FROM HOME": "WFH",
};

function normalizeStatus(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const key = raw.trim().toUpperCase();
  return STATUS_MAP[key] || null;
}

/** Parse shift string like "General (09:00 To 18:00)" */
function parseShift(shiftStr: string): { name: string | null; start: string | null; end: string | null } {
  if (!shiftStr || shiftStr.trim() === "") return { name: null, start: null, end: null };

  const match = shiftStr.match(/^(.+?)\s*\(?\s*(\d{1,2}:\d{2})\s*(?:To|to|-)\s*(\d{1,2}:\d{2})\s*\)?$/);
  if (match) {
    return {
      name: match[1].trim(),
      start: normalizeTime(match[2]),
      end: normalizeTime(match[3]),
    };
  }

  // Just a name, no times
  return { name: shiftStr.trim(), start: null, end: null };
}

// ═══════════════════════════════════════════════════════════════
// 4️⃣  DETAILED FORMAT PARSER (Punch-based blocks)
// ═══════════════════════════════════════════════════════════════

function parseDetailedFormat(text: string): { employees: ParsedEmployee[]; errors: string[] } {
  const errors: string[] = [];

  // Mark IV: detect document date format once for the whole text
  const docDateFormat = detectDocumentDateFormat(text);
  console.log(`[DETAILED] Document date format detected: ${docDateFormat}`);

  // Split text into per-employee blocks using "Employee Code :" anchor
  // Mark IV: also handle "Employee ID:", "Emp Code:", "Staff Code:", "Badge No:"
  const empBlockAnchor = /(?=(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:)/i;
  const empBlockTest = /(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:/i;
  const blocks = text.split(empBlockAnchor).filter(b => empBlockTest.test(b));

  if (blocks.length === 0) {
    errors.push("No employee blocks found despite detailed format detection");
    return { employees: [], errors };
  }

  console.log(`[DETAILED] Found ${blocks.length} employee block(s)`);

  // Use a Map to merge employees with the same code (multi-page PDFs)
  const empMap = new Map<string, ParsedEmployee>();

  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);

    // Extract employee code — anchored to "Employee Code :"
    let empCode = "";
    let empName = "";
    let cardNo = "";
    let shiftStr = "";

    for (const line of lines) {
      // Employee Code / ID / No : 1234  Name : John Doe  Card No : 5678
      const codeMatch = line.match(/(?:Employee\s*(?:Code|ID|No)|Emp\.?\s*(?:Code|ID)|Staff\s*(?:Code|ID)|Badge\s*No)\s*:\s*(\S+)/i);
      if (codeMatch) empCode = codeMatch[1].trim();

      const nameMatch = line.match(/Name\s*:\s*(.+?)(?:\s+Card|\s+Emp|\s*$)/i);
      if (nameMatch) empName = nameMatch[1].trim();

      // Sometimes name is after "Name :" with card on same or next line
      if (!empName) {
        const nameMatch2 = line.match(/Name\s*:\s*(.+)/i);
        if (nameMatch2) empName = nameMatch2[1].replace(/Card\s*No\s*:\s*\S+/i, "").trim();
      }

      const cardMatch = line.match(/Card\s*No\s*:\s*(\S+)/i);
      if (cardMatch) cardNo = cardMatch[1].trim();

      const shiftMatch = line.match(/Shift\s*:\s*(.+)/i);
      if (shiftMatch) shiftStr = shiftMatch[1].trim();
    }

    if (!empCode) {
      errors.push(`Block skipped: could not extract employee code`);
      continue;
    }

    const shift = parseShift(shiftStr);

    // Parse date rows — Mark IV: support DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY
    const records: EmployeeRecord[] = [];

    for (const line of lines) {
      // Multi-format date detection at start of line
      const dateMatch = line.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})/) ||
                        line.match(/^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
      if (!dateMatch) continue;

      const isoDate = parseDateIntelligent(dateMatch[1], docDateFormat);
      if (!isoDate) {
        errors.push(`Invalid date "${dateMatch[1]}" for employee ${empCode}`);
        continue;
      }

      // Extract all time values from the line (including AM/PM variants)
      const timeMatches = line.match(/\d{1,2}:\d{2}(?:[:.]\d{2})?(?:\s*[AaPp][Mm])?/g) || [];
      const normalizedTimes = timeMatches
        .map(t => parseTimeIntelligent(t))
        .filter((t): t is string => t !== null);

      // Extract status — Mark IV: use normalizeStatus for vendor code mapping
      const statusMatch = line.match(/\b(P|A|HD|MIS|NA|WO|WFH|CL|SL|EL|PL|OD|CO|LWP|AB|PRESENT|ABSENT|HOLIDAY|HALFDAY|LWP|LATE)\b/i);
      const status = statusMatch ? (normalizeStatus(statusMatch[1]) || statusMatch[1].toUpperCase()) : undefined;

      records.push({
        date: isoDate,
        status,
        in_time: normalizedTimes[0] || null,
        out_time: normalizedTimes.length > 1 ? normalizedTimes[normalizedTimes.length - 1] : null,
        punches: normalizedTimes,
      });
    }

    // Merge with existing employee entry if same code (multi-page PDF)
    if (empMap.has(empCode)) {
      const existing = empMap.get(empCode)!;
      // Merge records, avoiding duplicate dates
      const existingDates = new Set(existing.records.map(r => r.date));
      for (const rec of records) {
        if (!existingDates.has(rec.date)) {
          existing.records.push(rec);
        }
      }
      // Fill in missing metadata
      if (!existing.employee_name && empName) existing.employee_name = empName;
      if (!existing.card_no && cardNo) existing.card_no = cardNo;
      if (!existing.shift_name && shift.name) existing.shift_name = shift.name;
      if (!existing.shift_start && shift.start) existing.shift_start = shift.start;
      if (!existing.shift_end && shift.end) existing.shift_end = shift.end;
      console.log(`[DETAILED] Merged duplicate employee code ${empCode} (now ${existing.records.length} records)`);
    } else {
      empMap.set(empCode, {
        employee_code: empCode,
        employee_name: empName,
        card_no: cardNo || undefined,
        shift_name: shift.name,
        shift_start: shift.start,
        shift_end: shift.end,
        records,
      });
    }
  }

  return { employees: Array.from(empMap.values()), errors };
}

// ═══════════════════════════════════════════════════════════════
// 5️⃣  SUMMARY FORMAT PARSER (Tabular rows)
// ═══════════════════════════════════════════════════════════════

function parseSummaryFormat(text: string): { employees: ParsedEmployee[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Mark IV: detect document date format once
  const docDateFormat = detectDocumentDateFormat(text);
  console.log(`[SUMMARY] Document date format detected: ${docDateFormat}`);

  // Detect header line — Mark IV: expanded column keywords
  const headerIdx = lines.findIndex(l =>
    (/EMP\s*Code|Emp\.?\s*Code|Employee\s*(?:Code|ID)|Staff\s*(?:Code|ID)/i.test(l)) &&
    /In\s*Time|Clock\s*In|Entry\s*Time|Punch\s*In|First\s*Punch/i.test(l)
  );

  // ── Multi-format global date extraction ──────────────────────
  // Supports: "On Dated: 19/02/2026", "Date: 2026-02-19", "Date: 19-Feb-2026"
  const DATE_TOKEN_PATTERN = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/;
  let globalDate: string | null = null;
  for (const line of lines) {
    const onDatedMatch = line.match(new RegExp(`On\\s*Dated?\\s*:\\s*${DATE_TOKEN_PATTERN.source}`, "i")) ||
                         line.match(new RegExp(`Date\\s*:\\s*${DATE_TOKEN_PATTERN.source}`, "i"));
    if (onDatedMatch) {
      globalDate = parseDateIntelligent(onDatedMatch[1], docDateFormat);
      break;
    }
  }

  // Accumulate records by employee code
  const empMap = new Map<string, ParsedEmployee>();

  for (let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < lines.length; i++) {
    const line = lines[i];

    // Skip header/title lines that repeat on page 2+
    if (/Company\s*Name\s*:/i.test(line)) continue;
    if (/Location\s*:/i.test(line)) continue;
    if (/Attendance\s*Report/i.test(line)) continue;
    if (/On\s*Dated\s*:/i.test(line) || /^\s*Date\s*:\s*[\d\/\-\.]+\s*$/.test(line)) {
      // Update globalDate if a new page has a different date
      const m = line.match(DATE_TOKEN_PATTERN);
      if (m) globalDate = parseDateIntelligent(m[1], docDateFormat);
      continue;
    }
    if (/^\s*Date\s*:\s*$/i.test(line)) continue;
    if (/S\s*No\s+EMP\s*Code/i.test(line)) continue; // repeated header
    if (/EMP\s*Code.*In\s*Time|Employee.*Code.*Clock\s*In/i.test(line)) continue; // repeated header

    // ── Strategy 1: Row contains its own date (multi-format) ──
    const inlineDateMatch = line.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/) ||
                            line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
    let rowDate: string | null = null;

    if (inlineDateMatch) {
      rowDate = parseDateIntelligent(inlineDateMatch[1], docDateFormat);
      // If this line is just a standalone date, treat it as a header date
      const stripped = line.replace(inlineDateMatch[0], '').trim();
      if (stripped.length < 3) {
        if (!globalDate) globalDate = rowDate;
        continue;
      }
    }

    const effectiveDate = rowDate || globalDate;
    if (!effectiveDate) continue; // No date context yet

    // Extract all time-like tokens (Mark IV: include AM/PM variants)
    const timeTokens = line.match(/\d{1,2}:\d{2}(?:[:.]\d{2})?(?:\s*[AaPp][Mm])?/g) || [];
    const validTimes = timeTokens.map(t => parseTimeIntelligent(t)).filter((t): t is string => t !== null);

    // Extract status code — handle Greek lookalikes + Mark IV: normalizeStatus
    const normalizedLine = line
      .replace(/\u039D/g, 'N')  // Greek Ν → N
      .replace(/\u0391/g, 'A'); // Greek Α → A
    const statusMatch = normalizedLine.match(/\b(PRESENT|ABSENT|HALF\s*DAY|HALFDAY|MISSING\s*PUNCH|WEEKLY\s*OFF|WEEK\s*OFF|HOLIDAY|P|A|HD|MIS|NA|WO|WFH|CL|SL|EL|PL|OD|CO|LWP|AB|[01])\b/i);
    const status = statusMatch ? (normalizeStatus(statusMatch[1]) || statusMatch[1].toUpperCase()) : undefined;

    // ── Extract employee code and name ──
    let empCode = "";
    let empName = "";

    // Tab-separated path
    const parts = line.split(/\t/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 4) {
      const datePartIdx = parts.findIndex(p =>
        /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(p) || /\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(p)
      );
      if (datePartIdx >= 0) {
        for (let pi = 0; pi < parts.length; pi++) {
          if (pi === datePartIdx) continue;
          const p = parts[pi];
          if (/^\d{1,10}$/.test(p) && !/\d{2}\/\d{2}\/\d{4}/.test(p) && !/\d{1,2}:\d{2}/.test(p)) {
            if (!empCode) empCode = p;
            continue;
          }
          if (p.length > 3 && !/\d{2}\/\d{2}\/\d{4}/.test(p) && !/\d{1,2}:\d{2}/.test(p) &&
              !/^(P|A|HD|MIS|NA|WO|WFH|AB)$/.test(p) && !/^\d+$/.test(p) && !empName) {
            empName = p;
          }
        }
      }
    }

    // Space-separated path: "SNo EmpCode CardNo EmpName Shift InTime ..."
    // Rows start with a serial number followed by emp code
    if (!empCode) {
      // Pattern: "1 2 2 Laxmi Sai Prasad General 12:20 17:48 ..."
      // SNo(digits) EmpCode(digits) CardNo(digits) Name(text+) Shift(word) Times...
      const rowMatch = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)(?:\s+General|\s+Shift|\s+\d{1,2}:\d{2})/i);
      if (rowMatch) {
        empCode = rowMatch[2]; // second number is emp code
        empName = rowMatch[4].trim();
      }
    }

    // Fallback: regex-based extraction
    if (!empCode) {
      const empMatch = line.match(/(?:^\d+\s+)?(\d{1,10})\s+(?:\d{2}\/\d{2}\/\d{4}|[A-Z][a-z])/);
      if (empMatch) empCode = empMatch[1];
    }

    if (!empCode) {
      if (inlineDateMatch) {
        // After any date format, try to find a code
        const afterDate = line.match(/(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\s+(\w+)\s+/);
        if (afterDate && /^[A-Za-z0-9]{1,10}$/.test(afterDate[1])) {
          empCode = afterDate[1];
        }
      }
    }

    if (!empCode) continue; // Can't parse this row

    // Build or update employee record
    if (!empMap.has(empCode)) {
      empMap.set(empCode, {
        employee_code: empCode,
        employee_name: empName,
        records: [],
      });
    }

    const emp = empMap.get(empCode)!;
    if (!emp.employee_name && empName) emp.employee_name = empName;

    // Avoid duplicate date entries for same employee
    if (!emp.records.some(r => r.date === effectiveDate)) {
      // Determine in_time and out_time based on status and number of time tokens.
      // Column order: In Time | Out Time | Shift Hrs | Work Hrs | OT Hrs
      // Absent/NA: only have Shift Hrs, Work Hrs, OT Hrs (no in/out)
      // MIS (missing punch): only have one real punch (in_time), rest are shift/work/OT
      // Present: have In Time + Out Time + Shift Hrs + Work Hrs + OT Hrs (5 times)
      const absentStatuses = ["A", "NA", "AB", "WO", "CO"];
      const isAbsent = status && absentStatuses.includes(status);
      const isMIS = status === "MIS";

      let inTime: string | null = null;
      let outTime: string | null = null;
      let workHours: string | null = null;

      if (isAbsent) {
        // No actual check-in/out for absent employees
        inTime = null;
        outTime = null;
      } else if (isMIS) {
        // MIS: only one real punch, no out_time
        inTime = validTimes[0] || null;
        outTime = null;
        workHours = validTimes.length > 2 ? validTimes[2] : null;
      } else {
        // Present/HD/etc: first two times are in/out
        inTime = validTimes[0] || null;
        outTime = validTimes.length > 1 ? validTimes[1] : null;
        workHours = validTimes.length > 3 ? validTimes[3] : (validTimes.length > 2 ? validTimes[2] : null);
      }

      emp.records.push({
        date: effectiveDate,
        status,
        in_time: inTime,
        out_time: outTime,
        work_hours: workHours,
        punches: validTimes,
      });
    }
  }

  console.log(`[SUMMARY] Parsed ${empMap.size} employees from summary format`);
  return { employees: Array.from(empMap.values()), errors };
}

// ═══════════════════════════════════════════════════════════════
// 6️⃣  AUTHENTICITY & VALIDATION CHECKS
// ═══════════════════════════════════════════════════════════════

interface ValidationResult {
  valid: boolean;
  error?: string;
  reason?: string;
}

/** Check if this is a legitimate attendance file */
function checkAuthenticity(text: string, employees: ParsedEmployee[]): ValidationResult {
  const timeTokens = (text.match(/\d{1,2}:\d{2}/g) || []).length;
  // Count date tokens across all supported formats (Mark IV: format-agnostic)
  const dateTokens = [
    ...(text.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/g) || []),
    ...(text.match(/\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/g) || []),
    ...(text.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/g) || []),
  ].length;

  // Must have meaningful time/date content
  if (timeTokens < 5 && dateTokens < 3) {
    return {
      valid: false,
      error: "INVALID_ATTENDANCE_FILE",
      reason: `Insufficient attendance markers: ${timeTokens} time tokens, ${dateTokens} date tokens. Minimum: 5 times, 3 dates.`,
    };
  }

  // Must have detected employees
  if (employees.length === 0) {
    return {
      valid: false,
      error: "INVALID_ATTENDANCE_FILE",
      reason: "No employee records could be extracted from the file.",
    };
  }

  return { valid: true };
}

/** Validate parsed data for logical consistency */
function validateParsedData(employees: ParsedEmployee[], format: AttendanceFormat): ValidationResult {
  // Must have employees
  if (employees.length === 0) {
    return {
      valid: false,
      error: "ATTENDANCE_VALIDATION_FAILED",
      reason: "No employees detected in parsed data.",
    };
  }

  // Check for duplicate employee codes — merge them instead of failing
  const codes = employees.map(e => e.employee_code);
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
    console.log(`[VALIDATE] Merging ${dupes.length} duplicate employee code(s): ${[...new Set(dupes)].join(", ")}`);
    
    // Merge duplicates in-place
    const mergedMap = new Map<string, ParsedEmployee>();
    for (const emp of employees) {
      if (mergedMap.has(emp.employee_code)) {
        const existing = mergedMap.get(emp.employee_code)!;
        const existingDates = new Set(existing.records.map(r => r.date));
        for (const rec of emp.records) {
          if (!existingDates.has(rec.date)) {
            existing.records.push(rec);
          }
        }
        if (!existing.employee_name && emp.employee_name) existing.employee_name = emp.employee_name;
        if (!existing.card_no && emp.card_no) existing.card_no = emp.card_no;
      } else {
        mergedMap.set(emp.employee_code, { ...emp, records: [...emp.records] });
      }
    }
    // Replace the employees array in-place
    employees.length = 0;
    employees.push(...mergedMap.values());
    console.log(`[VALIDATE] After merge: ${employees.length} unique employees`);
  }

  // Validate each employee
  for (const emp of employees) {
    if (!emp.employee_code) {
      return {
        valid: false,
        error: "ATTENDANCE_VALIDATION_FAILED",
        reason: `Employee missing code (name: ${emp.employee_name || "unknown"})`,
      };
    }

    // Detailed format: each employee should have at least one record with punches
    if (format === "detailed") {
      const hasPunches = emp.records.some(r => r.punches.length >= 1);
      if (!hasPunches && emp.records.length > 0) {
        // Warn but don't fail — employee may have all absent days
        console.log(`[VALIDATE] Warning: Employee ${emp.employee_code} has records but no punches`);
      }
    }

    // Validate time values in records
    for (const rec of emp.records) {
      for (const punch of rec.punches) {
        if (!/^\d{2}:\d{2}:\d{2}$/.test(punch)) {
          return {
            valid: false,
            error: "ATTENDANCE_VALIDATION_FAILED",
            reason: `Invalid time value "${punch}" for employee ${emp.employee_code} on ${rec.date}`,
          };
        }
      }

      // Summary format: in_time should be <= out_time (unless absent with 00:00)
      if (format === "summary" && rec.in_time && rec.out_time) {
        if (rec.out_time !== "00:00:00" && rec.in_time > rec.out_time) {
          // Night shift edge case — allow it with a warning
          console.log(`[VALIDATE] Night shift detected: ${emp.employee_code} on ${rec.date}: ${rec.in_time} → ${rec.out_time}`);
        }
      }
    }
  }

  // Validate shift times if present
  for (const emp of employees) {
    if (emp.shift_start && emp.shift_end) {
      if (emp.shift_start >= emp.shift_end) {
        // Night shift — allow but log
        console.log(`[VALIDATE] Night shift config: ${emp.employee_code}: ${emp.shift_start} → ${emp.shift_end}`);
      }
    }
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// 7A️⃣  AI-ASSISTED FALLBACK — For truly unknown/unstructured formats
// ═══════════════════════════════════════════════════════════════

/**
 * Mark IV: parseWithAI — calls Gemini to interpret unstructured attendance text.
 * Only triggered when both deterministic parsers return 0 records.
 * Splits large texts into ≤40K char chunks to avoid token overflow.
 */
async function parseWithAI(text: string, extractionMethod: string): Promise<ParseResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return {
      punches: [], employees: [], errors: ["AI_UNAVAILABLE: LOVABLE_API_KEY not configured"],
      format: "unknown",
      metadata: { extraction_method: extractionMethod, employees_detected: 0, validation_passed: false },
    };
  }

  console.log(`[AI] parseWithAI: text length ${text.length}, chunking at 40K chars`);

  const CHUNK_SIZE = 40_000;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  const allEmployees = new Map<string, ParsedEmployee>();
  const allErrors: string[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const prompt = `You are an attendance data extraction engine. Extract attendance records from the following document text.

Return ONLY valid JSON (no markdown, no explanation) with this exact schema:
{
  "format_detected": "brief description of the format",
  "employees": [
    {
      "employee_code": "string",
      "employee_name": "string",
      "records": [
        {
          "date": "YYYY-MM-DD",
          "in_time": "HH:mm:ss or null",
          "out_time": "HH:mm:ss or null",
          "status": "P|A|HD|MIS|WO|null"
        }
      ]
    }
  ],
  "confidence": 0.85,
  "notes": "any ambiguities or issues found"
}

Rules:
- Dates must be ISO YYYY-MM-DD format
- Times must be 24-hour HH:mm:ss format or null
- Employee code is the numeric/alphanumeric ID, not the serial number
- Skip rows that are clearly headers or totals

Document text (chunk ${ci + 1} of ${chunks.length}):
${chunk}`;

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 16000,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        allErrors.push(`AI chunk ${ci + 1} failed: HTTP ${response.status}`);
        continue;
      }

      const result = await response.json();
      const rawJson = result.choices?.[0]?.message?.content?.trim() || "";

      // Strip markdown code fences if present
      const cleanJson = rawJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        allErrors.push(`AI chunk ${ci + 1}: could not parse JSON response`);
        continue;
      }

      if (!Array.isArray(parsed.employees)) {
        allErrors.push(`AI chunk ${ci + 1}: response missing employees array`);
        continue;
      }

      for (const emp of parsed.employees) {
        if (!emp.employee_code) continue;
        const code = String(emp.employee_code).trim();
        if (!allEmployees.has(code)) {
          allEmployees.set(code, {
            employee_code: code,
            employee_name: emp.employee_name || "",
            records: [],
          });
        }
        const existing = allEmployees.get(code)!;
        if (!existing.employee_name && emp.employee_name) existing.employee_name = emp.employee_name;

        for (const rec of (emp.records || [])) {
          if (!rec.date) continue;
          const isoDate = parseDateIntelligent(rec.date) || rec.date;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue;
          if (existing.records.some(r => r.date === isoDate)) continue;
          const inTime = rec.in_time ? parseTimeIntelligent(rec.in_time) : null;
          const outTime = rec.out_time ? parseTimeIntelligent(rec.out_time) : null;
          const status = rec.status ? (normalizeStatus(rec.status) || rec.status) : undefined;
          existing.records.push({
            date: isoDate,
            status,
            in_time: inTime,
            out_time: outTime,
            punches: [inTime, outTime].filter((t): t is string => t !== null),
          });
        }
      }

      console.log(`[AI] Chunk ${ci + 1}/${chunks.length}: extracted ${parsed.employees?.length || 0} employees`);
    } catch (err: any) {
      allErrors.push(`AI chunk ${ci + 1} exception: ${err.message}`);
    }
  }

  const employees = Array.from(allEmployees.values());
  console.log(`[AI] Total after merge: ${employees.length} employees`);

  if (employees.length === 0) {
    return {
      punches: [], employees: [], errors: ["AI_NO_DATA: AI could not extract attendance data from this document", ...allErrors],
      format: "unknown",
      metadata: { extraction_method: "ai_assisted", employees_detected: 0, validation_passed: false },
    };
  }

  return buildResult(employees, allErrors, "summary", text, "ai_assisted");
}

// ═══════════════════════════════════════════════════════════════
// 7️⃣  MAIN PARSE FUNCTION — Orchestrates all layers
// ═══════════════════════════════════════════════════════════════

async function parseAttendanceText(text: string, extractionMethod: string): Promise<ParseResult> {
  const errors: string[] = [];

  // Step 1: Detect format
  const format = detectFormat(text);
  console.log(`[PARSE] Detected format: ${format}`);

  if (format === "unknown") {
    // Try both deterministic parsers first
    console.log(`[PARSE] Unknown format, trying both parsers...`);

    const detailedResult = parseDetailedFormat(text);
    const summaryResult = parseSummaryFormat(text);

    const detailedCount = detailedResult.employees.reduce((s, e) => s + e.records.length, 0);
    const summaryCount = summaryResult.employees.reduce((s, e) => s + e.records.length, 0);

    console.log(`[PARSE] Detailed yielded ${detailedResult.employees.length} employees (${detailedCount} records), Summary yielded ${summaryResult.employees.length} employees (${summaryCount} records)`);

    if (detailedCount > summaryCount && detailedResult.employees.length > 0) {
      return buildResult(detailedResult.employees, detailedResult.errors, "detailed", text, extractionMethod);
    } else if (summaryResult.employees.length > 0) {
      return buildResult(summaryResult.employees, summaryResult.errors, "summary", text, extractionMethod);
    }

    // Both deterministic parsers failed — escalate to AI (Mark IV)
    console.log(`[PARSE] Both parsers returned 0 records — escalating to AI fallback...`);
    try {
      const aiResult = await parseWithAI(text, extractionMethod);
      if (aiResult.punches.length > 0) {
        return aiResult;
      }
    } catch (aiErr: any) {
      console.error(`[PARSE] AI fallback failed: ${aiErr.message}`);
    }

    // Everything failed
    return {
      punches: [],
      employees: [],
      errors: ["UNKNOWN_ATTENDANCE_FORMAT: Could not detect or parse attendance format from the file content."],
      format: "unknown",
      metadata: {
        extraction_method: extractionMethod,
        employees_detected: 0,
        validation_passed: false,
      },
    };
  }

  // Step 2: Parse with detected format
  const { employees, errors: parseErrors } =
    format === "detailed" ? parseDetailedFormat(text) : parseSummaryFormat(text);

  errors.push(...parseErrors);

  return buildResult(employees, errors, format, text, extractionMethod);
}

function buildResult(
  employees: ParsedEmployee[],
  errors: string[],
  format: AttendanceFormat,
  text: string,
  extractionMethod: string
): ParseResult {
  // Step 3: Authenticity check
  const authCheck = checkAuthenticity(text, employees);
  if (!authCheck.valid) {
    return {
      punches: [],
      employees: [],
      errors: [`${authCheck.error}: ${authCheck.reason}`],
      format,
      metadata: {
        extraction_method: extractionMethod,
        employees_detected: 0,
        validation_passed: false,
      },
    };
  }

  // Step 4: Logical validation
  const validation = validateParsedData(employees, format);
  if (!validation.valid) {
    return {
      punches: [],
      employees,
      errors: [`${validation.error}: ${validation.reason}`, ...errors],
      format,
      metadata: {
        extraction_method: extractionMethod,
        employees_detected: employees.length,
        validation_passed: false,
      },
    };
  }

  // Extract organization name from text (if present)
  const orgMatch = text.match(/Company\s*(?:Name)?\s*:\s*(.+?)(?:\n|$)/i) ||
                   text.match(/Organization\s*:\s*(.+?)(?:\n|$)/i);
  const organization = orgMatch ? orgMatch[1].trim() : undefined;

  // Extract report date — Mark IV: format-agnostic matching
  const dateContextMatch = text.match(
    /(?:On\s*Dated?|Report\s*Date|Date)\s*:\s*([\d]{1,2}[\/\-\.][A-Za-z\d]{1,9}[\/\-\.][A-Za-z\d]{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|[\d]{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i
  );
  const reportDate = dateContextMatch ? parseDateIntelligent(dateContextMatch[1]) || undefined : undefined;

  // Step 5: Convert employees to flat punches for DB insertion
  // Mark IV: overnight shift fix — advance out_date by 1 day when out_time < in_time
  const nextDay = (dateStr: string): string =>
    new Date(Date.parse(dateStr) + 86400_000).toISOString().split("T")[0];

  const punches: ParsedPunch[] = [];
  for (const emp of employees) {
    for (const rec of emp.records) {
      if (format === "summary") {
        // Summary format: only use in_time and out_time as punches.
        // Skip absent/NA employees — their time tokens are shift/work/OT hours, not real punches.
        const absentStatuses = ["A", "NA", "AB", "WO", "CO"];
        if (rec.status && absentStatuses.includes(rec.status)) {
          continue; // No actual punches for absent employees
        }
        if (rec.in_time && rec.in_time !== "00:00:00") {
          punches.push({
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            card_no: emp.card_no,
            punch_datetime: `${rec.date}T${rec.in_time}`,
            raw_status: rec.status,
          });
        }
        if (rec.out_time && rec.out_time !== "00:00:00") {
          // Overnight shift: if out_time < in_time, out belongs to next calendar day
          const outDate = rec.in_time && rec.out_time < rec.in_time
            ? nextDay(rec.date)
            : rec.date;
          punches.push({
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            card_no: emp.card_no,
            punch_datetime: `${outDate}T${rec.out_time}`,
            raw_status: rec.status,
          });
        }
      } else if (rec.punches.length > 0) {
        // Detailed format: each punch is an actual biometric tap
        // Detect overnight: if any punch time is less than the first punch, it crossed midnight
        let prevTime = "";
        let dateOffset = 0;
        for (const punchTime of rec.punches) {
          if (prevTime && punchTime < prevTime) {
            // Time went backwards — crossed midnight
            dateOffset++;
          }
          const punchDate = dateOffset > 0
            ? new Date(Date.parse(rec.date) + dateOffset * 86400_000).toISOString().split("T")[0]
            : rec.date;
          punches.push({
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            card_no: emp.card_no,
            punch_datetime: `${punchDate}T${punchTime}`,
            raw_status: rec.status,
          });
          prevTime = punchTime;
        }
      } else if (rec.in_time) {
        // Fallback: use in_time/out_time
        punches.push({
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          card_no: emp.card_no,
          punch_datetime: `${rec.date}T${rec.in_time}`,
          raw_status: rec.status,
        });
        if (rec.out_time && rec.out_time !== "00:00:00") {
          const outDate = rec.out_time < rec.in_time ? nextDay(rec.date) : rec.date;
          punches.push({
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            card_no: emp.card_no,
            punch_datetime: `${outDate}T${rec.out_time}`,
            raw_status: rec.status,
          });
        }
      }
    }
  }

  return {
    punches,
    employees,
    errors,
    format: format as "detailed" | "summary",
    metadata: {
      organization,
      date: reportDate,
      extraction_method: extractionMethod,
      employees_detected: employees.length,
      validation_passed: true,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 8️⃣  DIAGNOSTIC ANALYSIS (non-mutating debug tool)
// ═══════════════════════════════════════════════════════════════

// ─── 8A: Delimiter Detection ─────────────────────────────────

function delimiterDetection(lines: string[]): DelimiterAnalysis {
  const candidateDelimiters: Record<string, string> = {
    pipe: "|",
    comma: ",",
    tab: "\t",
    semicolon: ";",
    multi_space: "  ", // 2+ consecutive spaces
  };

  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return { primary_delimiter: "none", status: "NONE", candidates: {} };
  }

  // Count occurrences per line for each candidate
  const counts: Record<string, number[]> = {};
  for (const key of Object.keys(candidateDelimiters)) {
    counts[key] = [];
  }

  for (const line of nonEmptyLines) {
    counts.pipe.push((line.match(/\|/g) || []).length);
    counts.comma.push((line.match(/,/g) || []).length);
    counts.tab.push((line.match(/\t/g) || []).length);
    counts.semicolon.push((line.match(/;/g) || []).length);
    counts.multi_space.push((line.match(/ {2,}/g) || []).length);
  }

  const stats: Record<string, { frequency: number; avg_per_line: number; variance: number }> = {};
  let bestKey = "none";
  let bestScore = -1;

  for (const [key, arr] of Object.entries(counts)) {
    const linesWithDelim = arr.filter(c => c > 0).length;
    const frequency = linesWithDelim / nonEmptyLines.length;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.length > 1
      ? arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length
      : 0;

    stats[key] = {
      frequency: Math.round(frequency * 1000) / 1000,
      avg_per_line: Math.round(avg * 100) / 100,
      variance: Math.round(variance * 100) / 100,
    };

    // Score: high frequency, high avg, low variance
    if (frequency > 0.6 && avg > 0.5) {
      const score = frequency * 100 + avg * 10 - variance;
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
  }

  // Determine status
  let status: DelimiterAnalysis["status"] = "STABLE";

  if (bestKey === "none") {
    status = "INCONSISTENT";
  } else {
    // Check for drift: split lines into halves and compare dominant delimiter
    const half = Math.floor(nonEmptyLines.length / 2);
    if (half > 10) {
      const firstHalfAvg = counts[bestKey].slice(0, half).reduce((a, b) => a + b, 0) / half;
      const secondHalfAvg = counts[bestKey].slice(half).reduce((a, b) => a + b, 0) / (nonEmptyLines.length - half);
      // If the average count changes by more than 50%, it's drift
      if (firstHalfAvg > 0 && secondHalfAvg > 0) {
        const ratio = Math.max(firstHalfAvg, secondHalfAvg) / Math.min(firstHalfAvg, secondHalfAvg);
        if (ratio > 1.5) {
          status = "DRIFT_DETECTED";
        }
      } else if ((firstHalfAvg === 0) !== (secondHalfAvg === 0)) {
        status = "DRIFT_DETECTED";
      }
    }

    // Check variance threshold for inconsistency
    if (stats[bestKey].variance > stats[bestKey].avg_per_line * 2 && status === "STABLE") {
      status = "INCONSISTENT";
    }
  }

  return {
    primary_delimiter: bestKey === "none" ? "none" : candidateDelimiters[bestKey] || bestKey,
    status,
    candidates: stats,
  };
}

// ─── 8B: Column Analysis ────────────────────────────────────

function columnAnalysis(lines: string[], delimiter: string): ColumnAnalysis {
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);

  // Identify table rows: lines containing the delimiter
  const tableRows = delimiter === "none"
    ? nonEmptyLines.filter(l => / {2,}/.test(l)) // fallback to multi-space
    : nonEmptyLines.filter(l => l.includes(delimiter));

  if (tableRows.length === 0) {
    return { avg_columns: 0, variance: 0, consistency: "STABLE", outlier_rows: 0, total_table_rows: 0 };
  }

  const splitRegex = delimiter === "  "
    ? / {2,}/
    : delimiter === "none"
      ? / {2,}/
      : new RegExp(delimiter.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"));

  const columnCounts = tableRows.map(l => l.split(splitRegex).filter(c => c.trim().length > 0).length);
  const avg = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
  const variance = columnCounts.length > 1
    ? columnCounts.reduce((s, v) => s + (v - avg) ** 2, 0) / columnCounts.length
    : 0;

  // Outlier: differs from average by more than 1 column
  const outlierRows = columnCounts.filter(c => Math.abs(c - avg) > 1).length;
  const outlierRatio = outlierRows / columnCounts.length;

  return {
    avg_columns: Math.round(avg * 10) / 10,
    variance: Math.round(variance * 100) / 100,
    consistency: outlierRatio > 0.1 ? "UNSTABLE" : "STABLE",
    outlier_rows: outlierRows,
    total_table_rows: tableRows.length,
  };
}

// ─── 8C: Encoding & Token Drift Analysis ────────────────────

function encodingAnalysis(lines: string[]): string[] {
  const anomalies: string[] = [];

  // Greek character lookalikes
  const greekMap: Record<string, string> = {
    "\u03A4\u03BF": "Greek 'Το' instead of 'To'",          // Τo
    "\u0391": "Greek 'Α' instead of 'A'",
    "\u0395": "Greek 'Ε' instead of 'E'",
    "\u039F": "Greek 'Ο' instead of 'O'",
    "\u0392": "Greek 'Β' instead of 'B'",
  };

  // Unicode colon variants
  const colonVariants = ["\uFF1A", "\u02D0", "\uFE55"]; // ：ˑ﹕

  const headerLines = lines.slice(0, Math.min(lines.length, 20));
  const allLines = lines;

  // Check for Greek lookalikes
  for (const [pattern, desc] of Object.entries(greekMap)) {
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].includes(pattern)) {
        anomalies.push(`${desc} (line ${i + 1})`);
        break; // report once per pattern
      }
    }
  }

  // Check for unicode colon variants
  for (const variant of colonVariants) {
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].includes(variant)) {
        anomalies.push(`Unicode colon variant U+${variant.charCodeAt(0).toString(16).toUpperCase()} detected (line ${i + 1})`);
        break;
      }
    }
  }

  // Non-breaking spaces (U+00A0)
  const nbspLines = allLines.filter(l => l.includes("\u00A0"));
  if (nbspLines.length > 0) {
    anomalies.push(`Non-breaking spaces detected in ${nbspLines.length} line(s)`);
  }

  // Non-ASCII in header rows
  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i];
    // eslint-disable-next-line no-control-regex
    const nonAscii = line.match(/[^\x00-\x7F]/g);
    if (nonAscii && nonAscii.length > 0) {
      const unique = [...new Set(nonAscii)];
      anomalies.push(`Non-ASCII characters in header line ${i + 1}: ${unique.map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`).join(", ")}`);
      break; // report once
    }
  }

  return anomalies;
}

// ─── 8D: Structural Confidence Score ────────────────────────

function structuralScoring(
  delimAnalysis: DelimiterAnalysis,
  colAnalysis: ColumnAnalysis,
  encAnomalies: string[],
  totalRecords: number,
  employeeHeaderCount: number,
  format: string,
): number {
  let score = 100;

  // Delimiter penalties
  if (delimAnalysis.status === "INCONSISTENT") score -= 20;
  else if (delimAnalysis.status === "DRIFT_DETECTED") score -= 15;
  else if (delimAnalysis.status === "NONE") score -= 10;

  // Column variance penalty
  if (colAnalysis.consistency === "UNSTABLE") score -= 15;
  else if (colAnalysis.variance > 1.0) score -= 5;

  // Encoding anomalies
  if (encAnomalies.length > 0) score -= Math.min(encAnomalies.length * 5, 10);

  // Zero records
  if (totalRecords === 0) score -= 25;

  // Employee header inconsistency (for detailed format)
  if (format === "detailed" && employeeHeaderCount === 0) score -= 10;

  // Unknown format
  if (format === "unknown") score -= 10;

  return Math.max(score, 0);
}

// ─── 8E: Main Diagnostic Runner ─────────────────────────────

function runDiagnosticAnalysis(text: string, fileName: string, pages?: number): DiagnosticReport {
  const rawLines = text.split("\n");
  const nonEmptyLines = rawLines.filter(l => l.trim().length > 0);

  const dateMatches = text.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const timeMatches = text.match(/\d{1,2}:\d{2}/g) || [];
  const employeeWordMatches = text.match(/Employee\s+Code/gi) || [];
  const statusMatches = text.match(/\b(P|A|NA|MIS|HD|WO)\b/g) || [];

  const lineLengths = nonEmptyLines.map(l => l.trim().length);
  const singleTokenLines = nonEmptyLines.filter(l => l.trim().split(/\s+/).length === 1).length;
  const numericOnlyLines = nonEmptyLines.filter(l => /^\d+$/.test(l.trim())).length;
  const timeOnlyLines = nonEmptyLines.filter(l => /^\d{1,2}:\d{2}(:\d{2})?$/.test(l.trim())).length;

  const signals: string[] = [];
  let guess: "likely_summary" | "likely_punch" | "unknown" = "unknown";

  if (employeeWordMatches.length >= 3) {
    guess = "likely_punch";
    signals.push(`Employee Code headers found: ${employeeWordMatches.length}`);
  } else if (dateMatches.length > 20 && timeMatches.length > 40) {
    guess = "likely_summary";
    signals.push(`High date/time density`);
  }

  if (statusMatches.length > 10) signals.push(`Status tokens: ${statusMatches.length}`);
  if (singleTokenLines > nonEmptyLines.length * 0.5) signals.push(`HIGH FRAGMENTATION`);

  // Try actual parsing to report what would happen
  const format = detectFormat(text);
  signals.push(`Detected format: ${format}`);

  let totalRecords = 0;
  if (format !== "unknown") {
    const result = format === "detailed" ? parseDetailedFormat(text) : parseSummaryFormat(text);
    signals.push(`Parsed ${result.employees.length} employees`);
    totalRecords = result.employees.reduce((s, e) => s + e.records.length, 0);
    signals.push(`Total records: ${totalRecords}`);
    if (result.errors.length > 0) signals.push(`Parse errors: ${result.errors.length}`);
  }

  // ─── New: Structural diagnostics ───────────────────────
  const delimAnalysis = delimiterDetection(rawLines);
  const colAnalysis = columnAnalysis(rawLines, delimAnalysis.primary_delimiter);
  const encAnomalies = encodingAnalysis(rawLines);
  const confidence = structuralScoring(
    delimAnalysis, colAnalysis, encAnomalies,
    totalRecords, employeeWordMatches.length, format,
  );

  signals.push(`Structural confidence: ${confidence}/100`);
  if (delimAnalysis.status !== "STABLE") signals.push(`Delimiter: ${delimAnalysis.status}`);
  if (colAnalysis.consistency !== "STABLE") signals.push(`Columns: ${colAnalysis.consistency}`);
  if (encAnomalies.length > 0) signals.push(`Encoding anomalies: ${encAnomalies.length}`);

  return {
    file_name: fileName,
    pages,
    extraction: {
      total_characters: text.length,
      first_1000_chars: text.slice(0, 1000),
      last_1000_chars: text.slice(-1000),
      line_count: rawLines.length,
      first_50_lines: rawLines.slice(0, 50),
    },
    patterns: {
      date_count: dateMatches.length,
      time_count: timeMatches.length,
      employee_code_count: employeeWordMatches.length,
      status_count: statusMatches.length,
      date_samples: dateMatches.slice(0, 10),
      time_samples: timeMatches.slice(0, 10),
    },
    fragmentation: {
      single_token_lines: singleTokenLines,
      numeric_only_lines: numericOnlyLines,
      time_only_lines: timeOnlyLines,
      avg_line_length: lineLengths.length > 0 ? Math.round(lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length) : 0,
      max_line_length: lineLengths.length > 0 ? Math.max(...lineLengths) : 0,
      min_line_length: lineLengths.length > 0 ? Math.min(...lineLengths) : 0,
      empty_line_count: rawLines.length - nonEmptyLines.length,
    },
    classification: { guess, confidence_signals: signals },
    delimiter_analysis: delimAnalysis,
    column_analysis: colAnalysis,
    encoding_anomalies: encAnomalies,
    structural_confidence: confidence,
  };
}

// ═══════════════════════════════════════════════════════════════
// 9️⃣  HTTP HANDLER — Edge function entry point
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Verify JWT via getUser
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { organization_id, file_name, diagnostic_mode } = body;

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Size guard (~10MB in base64)
    const contentSize = (body.text_content?.length || 0) + (body.file_data?.length || 0);
    if (contentSize > 15_000_000) {
      return new Response(
        JSON.stringify({ error: "File content too large (max 10MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── EXTRACT TEXT ────────────────────────────────────
    let extractedText: string;
    let extractionMethod: string;
    let pdfPages: number | undefined;

    try {
      const resolved = await resolveTextContent(body);
      extractedText = resolved.text;
      extractionMethod = resolved.extractionMethod;
      pdfPages = resolved.pages;
      console.log(`[MAIN] Resolved via ${extractionMethod}: ${extractedText.length} chars, ${pdfPages ?? "?"} pages`);
    } catch (extractErr: any) {
      console.error(`[MAIN] Extraction failed:`, extractErr.message);

      if (diagnostic_mode) {
        const errorDiagnostic: DiagnosticReport = {
          file_name: file_name || "unknown",
          extraction: { total_characters: 0, first_1000_chars: "", last_1000_chars: "", line_count: 0, first_50_lines: [] },
          patterns: { date_count: 0, time_count: 0, employee_code_count: 0, status_count: 0, date_samples: [], time_samples: [] },
          fragmentation: { single_token_lines: 0, numeric_only_lines: 0, time_only_lines: 0, avg_line_length: 0, max_line_length: 0, min_line_length: 0, empty_line_count: 0 },
          classification: { guess: "unknown", confidence_signals: [`EXTRACTION FAILED: ${extractErr.message}`] },
          delimiter_analysis: { primary_delimiter: "unknown", status: "NONE" as const, candidates: {} },
          column_analysis: { avg_columns: 0, variance: 0, consistency: "UNSTABLE" as const, outlier_rows: 0, total_table_rows: 0 },
          encoding_anomalies: [],
          structural_confidence: 0,
        };
        return new Response(
          JSON.stringify({ success: false, diagnostic_mode: true, diagnostic: errorDiagnostic, error: extractErr.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: extractErr.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DIAGNOSTIC MODE ─────────────────────────────────
    if (diagnostic_mode) {
      console.log(`[DIAGNOSTIC] Running analysis on: ${file_name}`);
      const diagnostic = runDiagnosticAnalysis(extractedText, file_name || "unknown", pdfPages);

      await adminClient.from("attendance_parse_diagnostics").insert({
        organization_id,
        file_name: file_name || "unknown",
        raw_excerpt: extractedText.slice(0, 5000),
        metrics: {
          extraction_method: extractionMethod,
          extraction: { total_characters: diagnostic.extraction.total_characters, line_count: diagnostic.extraction.line_count },
          patterns: diagnostic.patterns,
          fragmentation: diagnostic.fragmentation,
          classification: diagnostic.classification,
          delimiter_analysis: diagnostic.delimiter_analysis,
          column_analysis: diagnostic.column_analysis,
          encoding_anomalies: diagnostic.encoding_anomalies,
          structural_confidence: diagnostic.structural_confidence,
        },
      });

      return new Response(
        JSON.stringify({ success: true, diagnostic_mode: true, diagnostic }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── PARSE ───────────────────────────────────────────
    const result = await parseAttendanceText(extractedText, extractionMethod);

    console.log(`[MAIN] Parse result: format=${result.format}, employees=${result.metadata.employees_detected}, punches=${result.punches.length}, valid=${result.metadata.validation_passed}`);

    if (result.punches.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.errors.length > 0
            ? result.errors[0]
            : "No attendance records could be parsed from the file",
          parse_errors: result.errors,
          format: result.format,
          extraction_method: extractionMethod,
          employees_detected: result.metadata.employees_detected,
          total_parsed: 0,
          inserted: 0,
          duplicates_skipped: 0,
          matched_employees: 0,
          unmatched_codes: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      // Match by employee_id_number first (primary key)
      const match = empDetails?.find((e: any) => e.employee_id_number === code);
      if (match) {
        codeToProfileId.set(code, match.profile_id);
        continue;
      }

      // Fallback: match by name from parsed data
      const punchName = result.punches.find(p => p.employee_code === code)?.employee_name;
      if (punchName) {
        const profileMatch = profiles?.find(
          (p: any) =>
            p.full_name?.toLowerCase() === punchName.toLowerCase() ||
            p.email?.toLowerCase().startsWith(code.toLowerCase())
        );
        if (profileMatch) {
          codeToProfileId.set(code, profileMatch.id);
          continue;
        }
      }

      // Fallback: match by email prefix
      const emailMatch = profiles?.find((p: any) =>
        p.email?.toLowerCase().startsWith(code.toLowerCase())
      );
      if (emailMatch) {
        codeToProfileId.set(code, emailMatch.id);
        continue;
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

    if (insertRows.length > 0) {
      // Batch duplicate check for efficiency
      for (const row of insertRows) {
        const { data: existing } = await adminClient
          .from("attendance_punches")
          .select("id")
          .eq("organization_id", row.organization_id)
          .eq("profile_id", row.profile_id)
          .eq("punch_datetime", row.punch_datetime)
          .limit(1);

        if (existing && existing.length > 0) {
          duplicateCount++;
          continue;
        }

        const { error: insertErr } = await adminClient
          .from("attendance_punches")
          .insert(row);

        if (insertErr) {
          result.errors.push(`Insert error for ${row.employee_code}: ${insertErr.message}`);
        } else {
          insertedCount++;
        }
      }
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

    // ─── AUTO-AGGREGATE: Calculate attendance_daily from punches ──
    // Determine date range from inserted punches
    if (insertedCount > 0) {
      const punchDates = result.punches
        .filter(p => codeToProfileId.has(p.employee_code))
        .map(p => p.punch_datetime.split("T")[0])
        .filter(Boolean);
      const uniqueDates = [...new Set(punchDates)].sort();
      if (uniqueDates.length > 0) {
        const startDate = uniqueDates[0];
        const endDate = uniqueDates[uniqueDates.length - 1];
        console.log(`[AGGREGATE] Auto-recalculating attendance_daily for ${startDate} to ${endDate}`);
        try {
          const { data: recalcResult, error: recalcError } = await adminClient.rpc(
            "recalculate_attendance_internal",
            {
              _org_id: organization_id,
              _start_date: startDate,
              _end_date: endDate,
            }
          );
          if (recalcError) {
            console.error(`[AGGREGATE] Recalculation RPC error:`, recalcError.message);
            result.errors.push(`Auto-aggregation failed: ${recalcError.message}`);
          } else {
            console.log(`[AGGREGATE] Recalculation result:`, JSON.stringify(recalcResult));
          }
        } catch (recalcErr: any) {
          console.error(`[AGGREGATE] Recalculation exception:`, recalcErr.message);
          result.errors.push(`Auto-aggregation exception: ${recalcErr.message}`);
        }
      }
    }

    // ─── RESPONSE ────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        format: result.format,
        batch_id: batchId,
        total_parsed: result.punches.length,
        inserted: insertedCount,
        duplicates_skipped: duplicateCount,
        matched_employees: codeToProfileId.size,
        // Mark IV: return matched codes so frontend can de-duplicate across ZIP files
        matched_employee_codes: Array.from(codeToProfileId.keys()),
        unmatched_codes: unmatchedCodes,
        parse_errors: result.errors,
        extraction_method: extractionMethod,
        metadata: result.metadata,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[FATAL] parse-attendance error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
