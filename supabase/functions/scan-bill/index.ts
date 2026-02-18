// deno-lint-ignore-file
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AP_CATEGORIES = [
  "Rent & Facilities",
  "Utilities",
  "Software & Subscriptions",
  "Marketing & Advertising",
  "Professional Services",
  "Office Supplies & Stationery",
  "Travel & Transport",
  "Meals & Entertainment",
  "Equipment & Hardware",
  "Inventory & Raw Materials",
  "Insurance",
  "Maintenance & Repairs",
  "Logistics & Shipping",
  "Telecommunications",
  "Training & Education",
  "Salaries & Payroll",
  "Tax & Compliance",
  "Banking & Finance Charges",
  "Other",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { base64Data, mimeType, fileName } = body;

    if (!base64Data || !mimeType) {
      return new Response(JSON.stringify({ error: "base64Data and mimeType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert accounts payable document processor specialising in extracting structured data from vendor bills, purchase invoices, and supplier receipts.

Your job is to extract every piece of information from the document with maximum accuracy. 
Pay close attention to:
- The bill/invoice number (usually labelled "Invoice No.", "Bill No.", "Ref.", etc.)
- Vendor/supplier name and contact details
- Individual line items with descriptions, quantities, unit rates, and amounts
- Sub-total, tax breakdown (GST, VAT, etc.), and grand total
- Bill date (when issued) and due/payment date
- Payment terms (Net 30, Due on Receipt, etc.)
- Currency

For AP category, classify based on the nature of goods or services purchased.
Available categories: ${AP_CATEGORIES.join(", ")}`;

    const userContent: any[] = [
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`,
        },
      },
      {
        type: "text",
        text: "Extract all details from this vendor bill / purchase invoice. Include every line item you can see, all tax breakdowns, and all dates.",
      },
    ];

    const aiPayload = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_vendor_bill",
            description: "Extract all structured data from a vendor bill or purchase invoice",
            parameters: {
              type: "object",
              properties: {
                vendor_name: {
                  type: "string",
                  description: "Full legal name of the vendor / supplier",
                },
                vendor_address: {
                  type: "string",
                  description: "Vendor address if visible",
                },
                vendor_tax_number: {
                  type: "string",
                  description: "Vendor GSTIN, VAT number, or tax ID if visible",
                },
                bill_number: {
                  type: "string",
                  description: "Invoice or bill reference number",
                },
                bill_date: {
                  type: "string",
                  description: "Date the bill was issued, in YYYY-MM-DD format",
                },
                due_date: {
                  type: "string",
                  description: "Payment due date in YYYY-MM-DD format, if stated",
                },
                payment_terms: {
                  type: "string",
                  description: "Payment terms e.g. Net 30, Due on Receipt",
                },
                currency: {
                  type: "string",
                  description: "Currency code e.g. INR, USD. Default to INR if unclear.",
                },
                subtotal: {
                  type: "number",
                  description: "Sub-total before taxes",
                },
                tax_amount: {
                  type: "number",
                  description: "Total tax amount (GST, VAT, etc.)",
                },
                tax_breakdown: {
                  type: "array",
                  description: "Individual tax line items if shown separately",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string", description: "Tax label e.g. CGST 9%, SGST 9%" },
                      rate: { type: "number", description: "Tax rate percentage" },
                      amount: { type: "number", description: "Tax amount in currency" },
                    },
                    required: ["label", "amount"],
                  },
                },
                total_amount: {
                  type: "number",
                  description: "Grand total payable amount including all taxes",
                },
                ap_category: {
                  type: "string",
                  enum: AP_CATEGORIES,
                  description: "Accounts payable category based on the nature of purchase",
                },
                line_items: {
                  type: "array",
                  description: "All individual line items from the bill",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string", description: "Item description" },
                      hsn_sac: { type: "string", description: "HSN/SAC code if visible" },
                      quantity: { type: "number", description: "Quantity" },
                      unit: { type: "string", description: "Unit of measurement" },
                      rate: { type: "number", description: "Unit rate / price" },
                      amount: { type: "number", description: "Line total" },
                    },
                    required: ["description", "amount"],
                  },
                },
                notes: {
                  type: "string",
                  description: "Any relevant notes, PO references, or additional information from the document",
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "Confidence level: high=clear document, medium=some ambiguity, low=poor scan or partially visible",
                },
                extraction_warnings: {
                  type: "array",
                  description: "List of any fields that were unclear, estimated, or missing",
                  items: { type: "string" },
                },
              },
              required: ["vendor_name", "total_amount", "ap_category", "confidence"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_vendor_bill" } },
    };

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiPayload),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "AI extraction failed. Please fill in the details manually." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiResult));
      return new Response(
        JSON.stringify({ error: "AI could not extract details from this document. Please fill in manually." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI tool arguments:", e);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI extraction result." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scan-bill error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
