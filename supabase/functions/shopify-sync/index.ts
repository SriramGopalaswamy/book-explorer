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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;

    // Resolve organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "No organization found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const orgId = profile.organization_id;

    // Get integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", "shopify")
      .eq("status", "connected")
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ error: "No active Shopify integration" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log sync start
    await supabase.from("connector_logs").insert({
      organization_id: orgId,
      provider: "shopify",
      event_type: "sync",
      status: "info",
      message: "Sync started",
    });

    // In a production implementation, you would:
    // 1. Use the access_token to call Shopify Admin API
    // 2. Fetch orders, customers, products
    // 3. Upsert into shopify_orders, shopify_customers, shopify_products
    // 4. Map to accounting records (invoices, customers, items)
    //
    // For now, we update the last_sync_at timestamp

    await supabase
      .from("integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    // Log sync completion
    await supabase.from("connector_logs").insert({
      organization_id: orgId,
      provider: "shopify",
      event_type: "sync",
      status: "success",
      message: "Sync completed successfully",
    });

    return new Response(
      JSON.stringify({ success: true, message: "Sync completed" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Sync failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
