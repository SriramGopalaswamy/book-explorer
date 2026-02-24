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
    // Match employee header: "Employee Code: 123  Name: John Doe  Card No: 456"
    const empMatch = line.match(
      /Employee\s*Code\s*[:\-]\s*(\w+).*?Name\s*[:\-]\s*(.+?)(?:\s+Card\s*No\s*[:\-]\s*(\w+))?$/i
    );
    if (empMatch) {
      currentEmpCode = empMatch[1].trim();
      currentName = empMatch[2].trim();
      currentCardNo = empMatch[3]?.trim() || "";
      continue;
    }

    // Simpler header: just "Employee Code: 123"
    const simpleEmpMatch = line.match(/Employee\s*Code\s*[:\-]\s*(\w+)/i);
    if (simpleEmpMatch && !empMatch) {
      currentEmpCode = simpleEmpMatch[1].trim();
      const nameMatch = line.match(/Name\s*[:\-]\s*(.+?)(?:\s+Card|$)/i);
      if (nameMatch) currentName = nameMatch[1].trim();
      continue;
    }

    if (!currentEmpCode) continue;

    // Match punch rows: "DD/MM/YYYY  HH:MM" or "DD-MM-YYYY HH:MM:SS"
    const punchMatch = line.match(
      /(\d{2}[\/-]\d{2}[\/-]\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/
    );
    if (punchMatch) {
      const dateStr = punchMatch[1].replace(/-/g, "/");
      const timeStr = punchMatch[2];

      // Parse DD/MM/YYYY
      const [dd, mm, yyyy] = dateStr.split("/");
      const isoDate = `${yyyy}-${mm}-${dd}`;

      // Pad time
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
    // Summary row: DD/MM/YYYY  EmpCode  Name  CardNo  InTime  OutTime  WorkHrs  OTHrs  Shift  ShiftTime  Status
    const summaryMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\w+)\s+(.+?)\s+(\d+)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\w+)\s+(\d{2}:\d{2}-\d{2}:\d{2})\s+(P|A|NA|MIS|HD)/
    );

    if (summaryMatch) {
      const [, dateStr, empCode, name, cardNo, inTime, outTime, , , , , status] = summaryMatch;
      const [dd, mm, yyyy] = dateStr.split("/");
      const isoDate = `${yyyy}-${mm}-${dd}`;

      // Create in/out punches from summary
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

    // Simpler summary: DD/MM/YYYY EmpCode InTime OutTime Status
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

    // Create admin client for service operations
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Create user client for auth validation
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
    const { text_content, organization_id, file_name } = body;

    if (!text_content || !organization_id) {
      return new Response(
        JSON.stringify({ error: "text_content and organization_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Safety: limit content size (10MB text)
    if (text_content.length > 10_000_000) {
      return new Response(
        JSON.stringify({ error: "File content too large (max 10MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the text
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

    // Also try matching by profile full_name or email prefix
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", organization_id);

    const codeToProfileId = new Map<string, string>();
    const unmatchedCodes: string[] = [];

    for (const code of uniqueCodes) {
      // First try employee_id_number
      const match = empDetails?.find(
        (e: any) => e.employee_id_number === code
      );
      if (match) {
        codeToProfileId.set(code, match.profile_id);
        continue;
      }

      // Fallback: match by name from parsed data
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

      // Try code as email prefix
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
      // Batch insert, skip duplicates (same org, profile, exact datetime)
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
