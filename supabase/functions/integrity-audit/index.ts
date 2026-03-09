import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is a super_admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check platform_roles
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("platform_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .limit(1);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "run";
    const orgId = body.org_id || null;

    if (action === "run") {
      // Execute the RPC
      const { data, error } = await adminClient.rpc("run_root_cause_audit", {
        p_org_id: orgId,
      });

      if (error) throw error;

      const result = typeof data === "string" ? JSON.parse(data) : data;
      const checks = result.checks || [];
      const passed = checks.filter((c: any) => c.status === "PASS").length;
      const failed = checks.filter((c: any) => c.status === "FAIL").length;
      const warnings = checks.filter((c: any) => c.status === "WARNING").length;
      const hasCritFail = checks.some(
        (c: any) => c.status === "FAIL" && c.severity === "CRITICAL"
      );
      const hasFail = checks.some((c: any) => c.status === "FAIL");
      const engineStatus = hasCritFail ? "BLOCKED" : hasFail ? "DEGRADED" : "OPERATIONAL";

      // Store the run
      await adminClient.from("integrity_audit_runs").insert({
        organization_id: orgId,
        run_by: user.id,
        run_scope: orgId ? "org" : "full",
        engine_status: engineStatus,
        total_checks: checks.length,
        passed,
        failed,
        warnings,
        checks,
        summary: {
          categories: [...new Set(checks.map((c: any) => c.category))],
          critical_fails: checks
            .filter((c: any) => c.status === "FAIL" && c.severity === "CRITICAL")
            .map((c: any) => c.id),
        },
        completed_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          engine_status: engineStatus,
          run_at: result.run_at,
          total_checks: checks.length,
          passed,
          failed,
          warnings,
          checks,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "history") {
      const { data, error } = await adminClient
        .from("integrity_audit_runs")
        .select("id, engine_status, total_checks, passed, failed, warnings, summary, started_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return new Response(JSON.stringify({ runs: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
