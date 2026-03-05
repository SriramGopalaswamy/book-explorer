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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify super_admin role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("platform_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse action from request body or URL
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "full";

    // Call the introspection function using service role (it's SECURITY DEFINER anyway)
    const { data, error } = await adminClient.rpc("inspect_database_structure");

    if (error) {
      console.error("Introspection error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter response based on action
    let response = data;
    if (action === "schema") {
      response = { tables: data.tables, inspected_at: data.inspected_at };
    } else if (action === "stats") {
      const stats = (data.tables || []).map((t: any) => ({
        table_name: t.table_name,
        row_count: t.row_count,
        column_count: t.column_count,
        index_count: t.index_count,
        estimated_size: t.estimated_size,
        estimated_size_bytes: t.estimated_size_bytes,
      }));
      response = { stats, inspected_at: data.inspected_at };
    } else if (action === "relations") {
      response = { relations: data.relations, inspected_at: data.inspected_at };
    } else if (action === "health") {
      response = { health: data.health, inspected_at: data.inspected_at };
    }
    // action === "full" returns everything

    // Generate HTML report if requested
    if (action === "report") {
      const tables = data.tables || [];
      const relations = data.relations || [];
      const health = data.health || {};

      const htmlReport = generateHtmlReport(tables, relations, health, data.inspected_at);
      response = {
        ...data,
        report_html: htmlReport,
      };
    }

    // Generate SQL dump
    if (action === "dump") {
      const tables = data.tables || [];
      const relations = data.relations || [];

      // Generate DDL from introspection data
      const sqlDump = await generateSqlDump(adminClient, tables, relations);

      return new Response(sqlDump, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="db-dump-${new Date().toISOString().slice(0, 10)}.sql"`,
        },
      });
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("db-inspector error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateHtmlReport(
  tables: any[],
  relations: any[],
  health: any,
  inspectedAt: string
): string {
  const totalRows = tables.reduce((s: number, t: any) => s + (t.row_count || 0), 0);
  const totalCols = tables.reduce((s: number, t: any) => s + (t.column_count || 0), 0);

  const tableRows = tables
    .sort((a: any, b: any) => (b.row_count || 0) - (a.row_count || 0))
    .map(
      (t: any) => `<tr>
        <td>${t.table_name}</td>
        <td style="text-align:right">${(t.row_count || 0).toLocaleString()}</td>
        <td style="text-align:right">${t.column_count}</td>
        <td style="text-align:right">${t.index_count}</td>
        <td style="text-align:right">${t.estimated_size}</td>
      </tr>`
    )
    .join("\n");

  const relRows = (relations || [])
    .map(
      (r: any) => `<tr>
        <td>${r.source_table}.${r.source_column}</td>
        <td>→</td>
        <td>${r.target_table}.${r.target_column}</td>
      </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>GRX10 Database Report</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:20px;background:#0a0a0a;color:#e5e5e5}
  h1,h2{color:#fff}table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:8px 12px;border:1px solid #333;text-align:left}th{background:#1a1a2e;color:#a78bfa}
  .metric{display:inline-block;background:#1a1a2e;border-radius:8px;padding:12px 20px;margin:6px;text-align:center}
  .metric .value{font-size:24px;font-weight:bold;color:#a78bfa}.metric .label{font-size:12px;color:#888}
</style></head><body>
<h1>🗄️ GRX10 Database Structure Report</h1>
<p>Generated: ${inspectedAt}</p>
<div>
  <div class="metric"><div class="value">${tables.length}</div><div class="label">Tables</div></div>
  <div class="metric"><div class="value">${totalRows.toLocaleString()}</div><div class="label">Total Rows</div></div>
  <div class="metric"><div class="value">${totalCols}</div><div class="label">Total Columns</div></div>
  <div class="metric"><div class="value">${(relations || []).length}</div><div class="label">Foreign Keys</div></div>
  <div class="metric"><div class="value">${health.total_size || "N/A"}</div><div class="label">Total Size</div></div>
</div>
<h2>Table Statistics</h2>
<table><thead><tr><th>Table</th><th>Rows</th><th>Columns</th><th>Indexes</th><th>Size</th></tr></thead>
<tbody>${tableRows}</tbody></table>
<h2>Relationships</h2>
<table><thead><tr><th>Source</th><th></th><th>Target</th></tr></thead>
<tbody>${relRows}</tbody></table>
<h2>Health</h2>
<p>Large tables (>100k rows): ${health.large_tables ? JSON.stringify(health.large_tables) : "None"}</p>
<p>Tables without indexes: ${health.tables_without_indexes ? JSON.stringify(health.tables_without_indexes) : "None"}</p>
</body></html>`;
}
