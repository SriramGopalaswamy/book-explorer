// deno-lint-ignore-file
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXPENSE_CATEGORIES = [
  "Travel & Transport",
  "Meals & Entertainment",
  "Office Supplies",
  "Accommodation",
  "Medical",
  "Training & Development",
  "Communications",
  "Software & Subscriptions",
  "Equipment",
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

    // Build the AI request with tool calling for structured extraction
    const systemPrompt = `You are a financial document OCR and extraction assistant. 
Analyze the provided document (bill, receipt, or invoice) and extract all relevant expense information.
Be thorough - extract every detail you can see in the document.
For category, choose the most appropriate from this list: ${EXPENSE_CATEGORIES.join(", ")}.`;

    const userContent: any[] = [
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`,
        },
      },
      {
        type: "text",
        text: "Please analyze this bill/receipt/invoice and extract all expense details including vendor name, total amount, date, line items, and the most appropriate expense category.",
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
            name: "extract_bill_details",
            description: "Extract all bill/receipt/invoice details from the document",
            parameters: {
              type: "object",
              properties: {
                vendor_name: {
                  type: "string",
                  description: "Name of the vendor, merchant, or service provider",
                },
                amount: {
                  type: "number",
                  description: "Total amount to be reimbursed (final payable amount including taxes)",
                },
                expense_date: {
                  type: "string",
                  description: "Date of the expense in YYYY-MM-DD format",
                },
                category: {
                  type: "string",
                  enum: EXPENSE_CATEGORIES,
                  description: "Most appropriate expense category",
                },
                description: {
                  type: "string",
                  description: "Brief description of what was purchased or the purpose of the expense",
                },
                tax_amount: {
                  type: "number",
                  description: "Tax amount if shown separately (GST, VAT, etc.)",
                },
                currency: {
                  type: "string",
                  description: "Currency code (e.g. INR, USD, EUR). Default to INR if unclear.",
                },
                line_items: {
                  type: "array",
                  description: "Individual line items from the bill if available",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      quantity: { type: "number" },
                      rate: { type: "number" },
                      amount: { type: "number" },
                    },
                    required: ["description", "amount"],
                  },
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "Confidence level of the extraction based on document clarity",
                },
                notes: {
                  type: "string",
                  description: "Any additional relevant notes about the document or extraction",
                },
              },
              required: ["vendor_name", "amount", "category", "description", "confidence"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_bill_details" } },
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
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed. Please fill in the details manually." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiResult));
      return new Response(JSON.stringify({ error: "AI could not extract details from this document. Please fill in manually." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI tool arguments:", e);
      return new Response(JSON.stringify({ error: "Failed to parse AI extraction. Please fill in manually." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-reimbursement error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
