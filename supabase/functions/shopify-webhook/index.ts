import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const shopDomain = req.headers.get("x-shopify-shop-domain");
    const topic = req.headers.get("x-shopify-topic");
    const hmac = req.headers.get("x-shopify-hmac-sha256");

    if (!shopDomain || !topic) {
      return new Response(JSON.stringify({ error: "Missing Shopify headers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Use service role for webhook processing (no user auth)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find integration by shop domain
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, organization_id")
      .eq("shop_domain", shopDomain)
      .eq("status", "connected")
      .single();

    if (!integration) {
      return new Response(JSON.stringify({ error: "Unknown store" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = integration.organization_id;

    // Log webhook event
    await supabase.from("connector_logs").insert({
      organization_id: orgId,
      provider: "shopify",
      event_type: "webhook",
      status: "info",
      message: `Webhook received: ${topic}`,
      payload: { topic, shop_domain: shopDomain, body_preview: JSON.stringify(body).substring(0, 500) },
    });

    // Handle different topics
    switch (topic) {
      case "orders/create":
      case "orders/updated": {
        await supabase.from("shopify_orders").upsert(
          {
            organization_id: orgId,
            shopify_order_id: String(body.id),
            customer_id: body.customer?.id ? String(body.customer.id) : null,
            order_number: body.name || body.order_number,
            order_total: Number(body.total_price || 0),
            tax_total: Number(body.total_tax || 0),
            currency: body.currency || "INR",
            financial_status: body.financial_status,
            fulfillment_status: body.fulfillment_status,
            order_payload: body,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,shopify_order_id" }
        );
        break;
      }
      case "customers/create":
      case "customers/update": {
        await supabase.from("shopify_customers").upsert(
          {
            organization_id: orgId,
            shopify_customer_id: String(body.id),
            email: body.email,
            name: `${body.first_name || ""} ${body.last_name || ""}`.trim(),
            phone: body.phone,
            customer_payload: body,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,shopify_customer_id" }
        );
        break;
      }
      case "products/update":
      case "products/create": {
        const sku = body.variants?.[0]?.sku || null;
        const price = Number(body.variants?.[0]?.price || 0);
        await supabase.from("shopify_products").upsert(
          {
            organization_id: orgId,
            shopify_product_id: String(body.id),
            title: body.title,
            sku,
            price,
            product_payload: body,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,shopify_product_id" }
        );
        break;
      }
      case "refunds/create": {
        // Log for now — refund mapping to credit notes would go here
        await supabase.from("connector_logs").insert({
          organization_id: orgId,
          provider: "shopify",
          event_type: "webhook",
          status: "info",
          message: `Refund received for order ${body.order_id}`,
          payload: body,
        });
        break;
      }
    }

    // Update last sync time
    await supabase
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integration.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Webhook processing failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
