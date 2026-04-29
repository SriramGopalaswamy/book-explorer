import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logError } from "../_shared/logger.ts";

// migrate-legacy-payroll
//
// Delegates all migration work to the migrate_legacy_payroll_to_engine PL/pgSQL RPC,
// which handles pagination (no 1000-row JS client cap), per-record atomicity (orphaned
// run cleanup on failure), and eliminates the previous N+1 round-trip pattern.
//
// Auth: requires admin or payroll role. Idempotent — safe to re-run.
// Body: { organization_id?: string }   — optional; omit to migrate all orgs
// Returns: { migrated: N, skipped: N, errors: string[] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // RBAC: admin or payroll only
    const { data: callerRoles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const allowed = (callerRoles ?? []).some((r: any) => ["admin", "payroll"].includes(r.role));
    if (!allowed) return json({ error: "Forbidden: admin or payroll role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const orgFilter: string | null = body.organization_id ?? null;

    const { data: result, error: rpcErr } = await supabase.rpc(
      "migrate_legacy_payroll_to_engine",
      { p_org_id: orgFilter, p_user_id: userId }
    );

    if (rpcErr) return json({ error: rpcErr.message }, 500);

    return json(result);
  } catch (err) {
    logError("migrate-legacy-payroll", err);
    return json({ error: (err as Error).message }, 500);
  }
});
