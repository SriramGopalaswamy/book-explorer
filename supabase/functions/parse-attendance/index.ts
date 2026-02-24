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

// ─── DIAGNOSTIC ANALYSIS (Steps 1-4) ─────────────────
interface DiagnosticReport {
  file_name: string;
  // Step 1: Raw extraction snapshot
  extraction: {
    total_characters: number;
    first_1000_chars: string;
    last_1000_chars: string;
    line_count: number;
    first_50_lines: string[];
  };
  // Step 2: Pattern density
  patterns: {
    date_count: number;
    time_count: number;
    employee_code_count: number;
    status_count: number;
    date_samples: string[];
    time_samples: string[];
  };
  // Step 3: Column fragmentation
  fragmentation: {
    single_token_lines: number;
    numeric_only_lines: number;
    time_only_lines: number;
    avg_line_length: number;
    max_line_length: number;
    min_line_length: number;
    empty_line_count: number;
  };
  // Step 4: Classification guess
  classification: {
    guess: "likely_summary" | "likely_punch" | "unknown";
    confidence_signals: string[];
  };
}

function runDiagnosticAnalysis(text: string, fileName: string): DiagnosticReport {
  const rawLines = text.split("\n");
  const nonEmptyLines = rawLines.filter(l => l.trim().length > 0);

  // Step 1: Raw extraction snapshot
  const extraction = {
    total_characters: text.length,
    first_1000_chars: text.slice(0, 1000),
    last_1000_chars: text.slice(-1000),
    line_count: rawLines.length,
    first_50_lines: rawLines.slice(0, 50),
  };

  // Step 2: Pattern density
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

  // Step 3: Column fragmentation
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

  // Step 4: Classification guess (non-blocking, probabilistic)
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
    extraction,
    patterns,
    fragmentation,
    classification: { guess, confidence_signals: signals },
  };
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
    const { text_content, organization_id, file_name, diagnostic_mode } = body;

    if (!text_content || !organization_id) {
      return new Response(
        JSON.stringify({ error: "text_content and organization_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Safety: limit content size (10MB)
    if (text_content.length > 10_000_000) {
      return new Response(
        JSON.stringify({ error: "File content too large (max 10MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════
    // DIAGNOSTIC MODE — analysis only, no data mutation
    // ═══════════════════════════════════════════════════════
    if (diagnostic_mode) {
      console.log(`[DIAGNOSTIC] Running analysis on: ${file_name}, ${text_content.length} chars`);

      const diagnostic = runDiagnosticAnalysis(text_content, file_name || "unknown");

      // Step 5: Save diagnostic snapshot (max 5000 chars excerpt)
      const rawExcerpt = text_content.slice(0, 5000);
      await adminClient.from("attendance_parse_diagnostics").insert({
        organization_id,
        file_name: file_name || "unknown",
        raw_excerpt: rawExcerpt,
        metrics: {
          extraction: {
            total_characters: diagnostic.extraction.total_characters,
            line_count: diagnostic.extraction.line_count,
          },
          patterns: diagnostic.patterns,
          fragmentation: diagnostic.fragmentation,
          classification: diagnostic.classification,
        },
      });

      console.log(`[DIAGNOSTIC] Analysis complete. Classification: ${diagnostic.classification.guess}`);
      console.log(`[DIAGNOSTIC] Patterns: dates=${diagnostic.patterns.date_count}, times=${diagnostic.patterns.time_count}, emp_codes=${diagnostic.patterns.employee_code_count}`);
      console.log(`[DIAGNOSTIC] Fragmentation: single_token=${diagnostic.fragmentation.single_token_lines}, avg_len=${diagnostic.fragmentation.avg_line_length}`);

      return new Response(
        JSON.stringify({
          success: true,
          diagnostic_mode: true,
          diagnostic,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════
    // NORMAL MODE — existing parsing logic (UNTOUCHED)
    // ═══════════════════════════════════════════════════════
    const result = parseAttendanceText(text_content);

    if (result.punches.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No attendance records could be parsed from the file",
          parse_errors: result.errors,
          format: result.format,
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
