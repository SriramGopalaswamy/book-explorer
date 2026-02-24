import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ParsedPunch {
  employee_code: string;
  card_no?: string;
  punch_datetime: string;
  raw_status?: string;
  name?: string;
}

interface ParseResult {
  punches: ParsedPunch[];
  errors: string[];
  format: "punch" | "summary" | "unknown";
}

// ─── PDF TEXT EXTRACTION ──────────────────────────
async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  try {
    // Use pdfjs-dist legacy build (no worker needed, Deno-compatible)
    const pdfjsLib = await import("https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs");

    // Disable worker (not available in edge functions)
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;

    console.log(`[PDF] Loaded PDF with ${pdf.numPages} page(s)`);

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Reconstruct text with spatial awareness
      // Sort items by y position (top to bottom), then x (left to right)
      const items = content.items
        .filter((item: any) => item.str && item.str.trim().length > 0)
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        }));

      // Group items by approximate y position (same row)
      const rows: Map<number, any[]> = new Map();
      const ROW_TOLERANCE = 3; // pixels

      for (const item of items) {
        let foundRow = false;
        for (const [rowY, rowItems] of rows) {
          if (Math.abs(item.y - rowY) <= ROW_TOLERANCE) {
            rowItems.push(item);
            foundRow = true;
            break;
          }
        }
        if (!foundRow) {
          rows.set(item.y, [item]);
        }
      }

      // Sort rows top-to-bottom (higher y = higher on page in PDF coords)
      const sortedRows = Array.from(rows.entries())
        .sort((a, b) => b[0] - a[0]);

      for (const [, rowItems] of sortedRows) {
        // Sort items left to right within each row
        rowItems.sort((a: any, b: any) => a.x - b.x);

        // Join with appropriate spacing
        let rowText = "";
        for (let j = 0; j < rowItems.length; j++) {
          const item = rowItems[j];
          if (j > 0) {
            const prev = rowItems[j - 1];
            const gap = item.x - (prev.x + prev.width);
            // Large gap = tab/column separator, use tab; small gap = space
            rowText += gap > 15 ? "\t" : gap > 2 ? " " : "";
          }
          rowText += item.str;
        }
        fullText += rowText + "\n";
      }
    }

    return fullText;
  } catch (err: any) {
    console.error(`[PDF] Extraction error:`, err);
    throw new Error(`PDF text extraction failed: ${err.message}`);
  }
}

// ─── BASE64 DECODING ─────────────────────────────
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ─── DIAGNOSTIC ANALYSIS (Steps 1-4) ─────────────────
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
}

function runDiagnosticAnalysis(text: string, fileName: string, pages?: number): DiagnosticReport {
  const rawLines = text.split("\n");
  const nonEmptyLines = rawLines.filter(l => l.trim().length > 0);

  const extraction = {
    total_characters: text.length,
    first_1000_chars: text.slice(0, 1000),
    last_1000_chars: text.slice(-1000),
    line_count: rawLines.length,
    first_50_lines: rawLines.slice(0, 50),
  };

  const dateMatches = text.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const timeMatches = text.match(/\d{1,2}:\d{2}/g) || [];
  const employeeWordMatches = text.match(/Employee\s+Code/gi) || [];
  const statusMatches = text.match(/\b(P|A|NA|MIS|HD)\b/g) || [];

  const patterns = {
    date_count: dateMatches.length,
    time_count: timeMatches.length,
    employee_code_count: employeeWordMatches.length,
    status_count: statusMatches.length,
    date_samples: dateMatches.slice(0, 10),
    time_samples: timeMatches.slice(0, 10),
  };

  const lineLengths = nonEmptyLines.map(l => l.trim().length);
  const singleTokenLines = nonEmptyLines.filter(l => l.trim().split(/\s+/).length === 1).length;
  const numericOnlyLines = nonEmptyLines.filter(l => /^\d+$/.test(l.trim())).length;
  const timeOnlyLines = nonEmptyLines.filter(l => /^\d{1,2}:\d{2}(:\d{2})?$/.test(l.trim())).length;

  const fragmentation = {
    single_token_lines: singleTokenLines,
    numeric_only_lines: numericOnlyLines,
    time_only_lines: timeOnlyLines,
    avg_line_length: lineLengths.length > 0 ? Math.round(lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length) : 0,
    max_line_length: lineLengths.length > 0 ? Math.max(...lineLengths) : 0,
    min_line_length: lineLengths.length > 0 ? Math.min(...lineLengths) : 0,
    empty_line_count: rawLines.length - nonEmptyLines.length,
  };

  const signals: string[] = [];
  let guess: "likely_summary" | "likely_punch" | "unknown" = "unknown";

  if (dateMatches.length > 20 && timeMatches.length > 40) {
    guess = "likely_summary";
    signals.push(`High date density (${dateMatches.length}) + time density (${timeMatches.length})`);
  }
  if (employeeWordMatches.length > 5 && timeMatches.length > 20) {
    guess = "likely_punch";
    signals.push(`Employee Code headers (${employeeWordMatches.length}) + times (${timeMatches.length})`);
  }
  if (statusMatches.length > 10) {
    signals.push(`Status tokens found (${statusMatches.length}): P/A/NA/MIS/HD`);
  }
  if (singleTokenLines > nonEmptyLines.length * 0.5) {
    signals.push(`HIGH FRAGMENTATION: ${singleTokenLines}/${nonEmptyLines.length} lines are single-token`);
  }
  if (timeOnlyLines > 5) {
    signals.push(`Isolated time values detected: ${timeOnlyLines} lines`);
  }
  if (numericOnlyLines > 10) {
    signals.push(`Numeric-only lines: ${numericOnlyLines}`);
  }
  if (fragmentation.avg_line_length < 10) {
    signals.push(`Very short avg line length (${fragmentation.avg_line_length}) - likely column-fragmented PDF`);
  }

  return {
    file_name: fileName,
    pages,
    extraction,
    patterns,
    fragmentation,
    classification: { guess, confidence_signals: signals },
  };
}

// ─── TEXT NORMALIZATION ──────────────────────────
function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── RESOLVE TEXT CONTENT ────────────────────────
// Handles: text_content (plain text), file_data (base64 PDF)
async function resolveTextContent(body: any): Promise<{ text: string; pages?: number; extractionMethod: string }> {
  // Case 1: Already have plain text (TXT/CSV uploads)
  if (body.text_content && !body.text_content.startsWith("%PDF")) {
    return { text: body.text_content, extractionMethod: "plain_text" };
  }

  // Case 2: base64-encoded PDF data
  if (body.file_data) {
    console.log(`[EXTRACT] Decoding base64 PDF data (${body.file_data.length} chars)`);
    const pdfBytes = base64ToUint8Array(body.file_data);
    console.log(`[EXTRACT] PDF binary size: ${pdfBytes.length} bytes`);

    const rawText = await extractTextFromPDF(pdfBytes);
    const normalized = normalizeExtractedText(rawText);

    // Validate extraction produced real text
    const dateCount = (normalized.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length;
    const timeCount = (normalized.match(/\d{1,2}:\d{2}/g) || []).length;

    console.log(`[EXTRACT] Extracted ${normalized.length} chars, ${dateCount} dates, ${timeCount} times`);

    if (normalized.length < 200 && dateCount === 0 && timeCount === 0) {
      throw new Error("PDF contains no extractable text. Likely a scanned image — OCR required.");
    }

    return { text: normalized, extractionMethod: "pdfjs" };
  }

  // Case 3: text_content that starts with %PDF (was incorrectly read as text on frontend)
  if (body.text_content && body.text_content.startsWith("%PDF")) {
    throw new Error(
      "PDF file was sent as raw text instead of binary. " +
      "Please update your client to send PDF files as base64-encoded file_data."
    );
  }

  throw new Error("No valid file content provided. Send text_content (for TXT/CSV) or file_data (for PDF base64).");
}

/**
 * Parse biometric attendance text content.
 * Detects format (punch-based vs summary) and extracts records.
 */
function parseAttendanceText(text: string): ParseResult {
  const punches: ParsedPunch[] = [];
  const errors: string[] = [];

  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, "\n").replace(/\t+/g, " ");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  // Detect format
  const hasPunchFormat = lines.some(
    (l) => /Employee\s*Code/i.test(l) || /Punch\s*Records/i.test(l)
  );
  const hasSummaryFormat = lines.some(
    (l) =>
      /^\d{2}\/\d{2}\/\d{4}/.test(l) &&
      /\b(P|A|NA|MIS|HD)\b/.test(l) &&
      /\d{1,2}:\d{2}/.test(l)
  );

  if (hasPunchFormat) {
    return parsePunchFormat(lines);
  } else if (hasSummaryFormat) {
    return parseSummaryFormat(lines);
  }

  // Fallback: try both
  const summaryResult = parseSummaryFormat(lines);
  if (summaryResult.punches.length > 0) return summaryResult;

  const punchResult = parsePunchFormat(lines);
  if (punchResult.punches.length > 0) return punchResult;

  return { punches: [], errors: ["Could not detect attendance format"], format: "unknown" };
}

function parsePunchFormat(lines: string[]): ParseResult {
  const punches: ParsedPunch[] = [];
  const errors: string[] = [];
  let currentEmpCode = "";
  let currentName = "";
  let currentCardNo = "";

  for (const line of lines) {
    const empMatch = line.match(
      /Employee\s*Code\s*[:\-]\s*(\w+).*?Name\s*[:\-]\s*(.+?)(?:\s+Card\s*No\s*[:\-]\s*(\w+))?$/i
    );
    if (empMatch) {
      currentEmpCode = empMatch[1].trim();
      currentName = empMatch[2].trim();
      currentCardNo = empMatch[3]?.trim() || "";
      continue;
    }

    const simpleEmpMatch = line.match(/Employee\s*Code\s*[:\-]\s*(\w+)/i);
    if (simpleEmpMatch && !empMatch) {
      currentEmpCode = simpleEmpMatch[1].trim();
      const nameMatch = line.match(/Name\s*[:\-]\s*(.+?)(?:\s+Card|$)/i);
      if (nameMatch) currentName = nameMatch[1].trim();
      continue;
    }

    if (!currentEmpCode) continue;

    const punchMatch = line.match(
      /(\d{2}[\/-]\d{2}[\/-]\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/
    );
    if (punchMatch) {
      const dateStr = punchMatch[1].replace(/-/g, "/");
      const timeStr = punchMatch[2];
      const [dd, mm, yyyy] = dateStr.split("/");
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const timeParts = timeStr.split(":");
      const paddedTime = `${timeParts[0].padStart(2, "0")}:${timeParts[1]}${timeParts[2] ? ":" + timeParts[2] : ":00"}`;

      punches.push({
        employee_code: currentEmpCode,
        card_no: currentCardNo || undefined,
        punch_datetime: `${isoDate}T${paddedTime}`,
        name: currentName || undefined,
      });
    }
  }

  return { punches, errors, format: "punch" };
}

function parseSummaryFormat(lines: string[]): ParseResult {
  const punches: ParsedPunch[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    const summaryMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\w+)\s+(.+?)\s+(\d+)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\w+)\s+(\d{2}:\d{2}-\d{2}:\d{2})\s+(P|A|NA|MIS|HD)/
    );

    if (summaryMatch) {
      const [, dateStr, empCode, name, cardNo, inTime, outTime, , , , , status] = summaryMatch;
      const [dd, mm, yyyy] = dateStr.split("/");
      const isoDate = `${yyyy}-${mm}-${dd}`;

      punches.push({
        employee_code: empCode,
        card_no: cardNo,
        punch_datetime: `${isoDate}T${inTime.padStart(5, "0")}:00`,
        raw_status: status,
        name: name.trim(),
      });

      if (outTime && outTime !== "00:00") {
        punches.push({
          employee_code: empCode,
          card_no: cardNo,
          punch_datetime: `${isoDate}T${outTime.padStart(5, "0")}:00`,
          raw_status: status,
          name: name.trim(),
        });
      }
      continue;
    }

    const simpleMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\w+)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(P|A|NA|MIS|HD)/
    );
    if (simpleMatch) {
      const [, dateStr, empCode, inTime, outTime, status] = simpleMatch;
      const [dd, mm, yyyy] = dateStr.split("/");
      const isoDate = `${yyyy}-${mm}-${dd}`;

      punches.push({
        employee_code: empCode,
        punch_datetime: `${isoDate}T${inTime.padStart(5, "0")}:00`,
        raw_status: status,
      });
      if (outTime && outTime !== "00:00") {
        punches.push({
          employee_code: empCode,
          punch_datetime: `${isoDate}T${outTime.padStart(5, "0")}:00`,
          raw_status: status,
        });
      }
    }
  }

  return { punches, errors, format: "summary" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseKey);
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
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

    // Safety: reject oversized payloads
    const contentSize = (body.text_content?.length || 0) + (body.file_data?.length || 0);
    if (contentSize > 15_000_000) { // ~10MB in base64
      return new Response(
        JSON.stringify({ error: "File content too large (max 10MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════
    // RESOLVE TEXT: Extract text from PDF or use plain text
    // ═══════════════════════════════════════════════════════
    let extractedText: string;
    let extractionMethod: string;
    let pdfPages: number | undefined;

    try {
      const resolved = await resolveTextContent(body);
      extractedText = resolved.text;
      extractionMethod = resolved.extractionMethod;
      pdfPages = resolved.pages;
      console.log(`[PARSE] Text resolved via ${extractionMethod}: ${extractedText.length} chars`);
    } catch (extractErr: any) {
      console.error(`[PARSE] Extraction failed:`, extractErr.message);

      // For diagnostic mode, return the error with what we can
      if (diagnostic_mode) {
        const errorDiagnostic: DiagnosticReport = {
          file_name: file_name || "unknown",
          extraction: {
            total_characters: 0,
            first_1000_chars: "",
            last_1000_chars: "",
            line_count: 0,
            first_50_lines: [],
          },
          patterns: { date_count: 0, time_count: 0, employee_code_count: 0, status_count: 0, date_samples: [], time_samples: [] },
          fragmentation: { single_token_lines: 0, numeric_only_lines: 0, time_only_lines: 0, avg_line_length: 0, max_line_length: 0, min_line_length: 0, empty_line_count: 0 },
          classification: { guess: "unknown", confidence_signals: [`EXTRACTION FAILED: ${extractErr.message}`] },
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

    // ═══════════════════════════════════════════════════════
    // DIAGNOSTIC MODE — analysis only, no data mutation
    // ═══════════════════════════════════════════════════════
    if (diagnostic_mode) {
      console.log(`[DIAGNOSTIC] Running analysis on: ${file_name}, ${extractedText.length} chars`);

      const diagnostic = runDiagnosticAnalysis(extractedText, file_name || "unknown", pdfPages);

      // Save diagnostic snapshot (max 5000 chars excerpt)
      const rawExcerpt = extractedText.slice(0, 5000);
      await adminClient.from("attendance_parse_diagnostics").insert({
        organization_id,
        file_name: file_name || "unknown",
        raw_excerpt: rawExcerpt,
        metrics: {
          extraction_method: extractionMethod,
          extraction: {
            total_characters: diagnostic.extraction.total_characters,
            line_count: diagnostic.extraction.line_count,
          },
          patterns: diagnostic.patterns,
          fragmentation: diagnostic.fragmentation,
          classification: diagnostic.classification,
        },
      });

      console.log(`[DIAGNOSTIC] Analysis complete. Method: ${extractionMethod}, Classification: ${diagnostic.classification.guess}`);
      console.log(`[DIAGNOSTIC] Patterns: dates=${diagnostic.patterns.date_count}, times=${diagnostic.patterns.time_count}`);

      return new Response(
        JSON.stringify({ success: true, diagnostic_mode: true, diagnostic }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════
    // NORMAL MODE — existing parsing logic (UNTOUCHED)
    // ═══════════════════════════════════════════════════════
    const result = parseAttendanceText(extractedText);

    if (result.punches.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No attendance records could be parsed from the file",
          parse_errors: result.errors,
          format: result.format,
          extraction_method: extractionMethod,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve employee codes to profile IDs
    const uniqueCodes = [...new Set(result.punches.map((p) => p.employee_code))];

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
      if (match) {
        codeToProfileId.set(code, match.profile_id);
        continue;
      }

      const punchName = result.punches.find((p) => p.employee_code === code)?.name;
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

      const emailMatch = profiles?.find((p: any) =>
        p.email?.toLowerCase().startsWith(code.toLowerCase())
      );
      if (emailMatch) {
        codeToProfileId.set(code, emailMatch.id);
        continue;
      }

      unmatchedCodes.push(code);
    }

    // Insert matched punches
    const batchId = crypto.randomUUID();
    const insertRows = result.punches
      .filter((p) => codeToProfileId.has(p.employee_code))
      .map((p) => ({
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
          result.errors.push(
            `Insert error for ${row.employee_code}: ${insertErr.message}`
          );
        } else {
          insertedCount++;
        }
      }
    }

    // Log the upload
    await adminClient.from("attendance_upload_logs").insert({
      organization_id,
      uploaded_by: user.id,
      file_name: file_name || "unknown.pdf",
      file_type: file_name?.endsWith(".zip") ? "zip" : "pdf",
      total_punches: insertedCount,
      matched_employees: codeToProfileId.size,
      unmatched_codes: unmatchedCodes,
      duplicate_punches: duplicateCount,
      parse_errors: result.errors,
      status: "completed",
    });

    return new Response(
      JSON.stringify({
        success: true,
        format: result.format,
        batch_id: batchId,
        total_parsed: result.punches.length,
        inserted: insertedCount,
        duplicates_skipped: duplicateCount,
        matched_employees: codeToProfileId.size,
        unmatched_codes: unmatchedCodes,
        parse_errors: result.errors,
        extraction_method: extractionMethod,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("parse-attendance error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
