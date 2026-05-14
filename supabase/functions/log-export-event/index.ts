// supabase/functions/log-export-event/index.ts
// GBC-13: Server-side audit row for every CSV/PDF export.
// Actor identity is taken from the verified JWT — never from the request body.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  export_type: string;   // e.g. "invoices_csv", "payroll_csv", "payslip_pdf"
  file_name: string;
  row_count?: number;
  organization_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "Unauthorized" }, 401);
  }
  const actorId = claimsData.claims.sub as string;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body?.export_type || !body?.file_name || !body?.organization_id) {
    return json({ error: "export_type, file_name, organization_id required" }, 400);
  }

  // Resolve actor's display name + role for the audit row.
  const { data: userResp } = await userClient.auth.getUser(token);
  const actorName =
    userResp?.user?.user_metadata?.full_name ??
    userResp?.user?.email ??
    null;

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null;

  // Use service role to bypass RLS — audit_logs only allows SELECT for
  // authenticated; writes flow through this trusted server path.
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: insertErr } = await adminClient.from("audit_logs").insert({
    organization_id: body.organization_id,
    actor_id: actorId,
    actor_name: actorName,
    action: "EXPORT",
    entity_type: "_exports",
    table_name: "_exports",
    is_system_operation: false,
    new_data: {
      export_type: body.export_type,
      file_name: body.file_name,
      row_count: body.row_count ?? null,
      ip_address: ipAddress,
    },
  });

  if (insertErr) {
    console.error("log-export-event insert failed:", insertErr.message);
    return json({ error: "audit insert failed", details: insertErr.message }, 500);
  }

  return json({ ok: true }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
