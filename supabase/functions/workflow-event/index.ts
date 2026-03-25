// deno-lint-ignore-file
// @ts-nocheck
/**
 * workflow-event: Receives workflow trigger events and creates workflow_runs.
 *
 * POST body:
 * {
 *   event_type: string,       // e.g. "invoice_sent"
 *   entity_type: string,      // e.g. "invoice"
 *   entity_id: string,        // UUID of the entity
 *   organization_id: string,  // org UUID
 *   payload?: object          // optional extra data
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal-only function: only accept calls carrying the service role key.
  // supabase.functions.invoke() from a service-role client passes it automatically.
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { event_type, entity_type, entity_id, organization_id, payload = {} } = body;

  if (!event_type || !entity_id || !organization_id) {
    return new Response(
      JSON.stringify({ error: "event_type, entity_id, organization_id are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Log the incoming event
    await supabase.from("workflow_events").insert({
      organization_id,
      event_type,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      payload,
    });

    // 2. Find all active workflows matching this trigger_event
    const { data: workflows, error: wfErr } = await supabase
      .from("workflows")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("trigger_event", event_type)
      .eq("is_active", true);

    if (wfErr) throw wfErr;

    if (!workflows || workflows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, runs_created: 0, message: "No matching active workflows" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create a workflow_run for each matching workflow — skip if one is already running
    //    for the same (workflow_id, entity_id) pair to prevent duplicate runs on re-sends.
    const now = new Date().toISOString();

    // Fetch already-running runs for this entity to avoid duplicates
    const workflowIds = workflows.map((wf) => wf.id);
    const { data: existingRuns } = await supabase
      .from("workflow_runs")
      .select("workflow_id")
      .eq("entity_id", entity_id)
      .eq("status", "running")
      .in("workflow_id", workflowIds);

    const alreadyRunning = new Set((existingRuns ?? []).map((r: any) => r.workflow_id));

    const runsToCreate = workflows
      .filter((wf) => !alreadyRunning.has(wf.id))
      .map((wf) => ({
        workflow_id: wf.id,
        organization_id,
        entity_type: entity_type || "unknown",
        entity_id,
        status: "running",
        current_step: 0,
        next_run_at: now,
      }));

    if (runsToCreate.length === 0) {
      return new Response(
        JSON.stringify({ success: true, runs_created: 0, message: "Workflow(s) already running for this entity" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: createdRuns, error: runErr } = await supabase
      .from("workflow_runs")
      .insert(runsToCreate)
      .select("id, workflow_id");

    if (runErr) throw runErr;

    // 4. Log run-creation events
    if (createdRuns && createdRuns.length > 0) {
      await supabase.from("workflow_events").insert(
        createdRuns.map((r) => ({
          organization_id,
          workflow_run_id: r.id,
          event_type: "run_created",
          entity_type: entity_type || null,
          entity_id,
          payload: { trigger: event_type },
        }))
      );
    }

    return new Response(
      JSON.stringify({ success: true, runs_created: createdRuns?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[workflow-event] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
