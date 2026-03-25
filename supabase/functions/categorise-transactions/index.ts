import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  "Salary", "Payroll", "Rent", "Utilities", "Software", "Marketing",
  "Travel", "Meals & Entertainment", "Office Supplies", "Professional Services",
  "Insurance", "Tax Payment", "Loan Repayment", "Equipment", "Subscription",
  "Client Payment", "Vendor Payment", "Transfer", "Refund", "Other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require a valid Supabase user JWT — prevents unauthenticated callers from
  // burning AI API credits or probing the categorisation endpoint.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { transactions } = await req.json() as {
      transactions: { description: string; amount: number; transaction_type: string; transaction_date: string }[];
    };

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ categorised: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch up to 50 at a time via tool calling
    const prompt = `You are a financial transaction categoriser for a business. 
Categorise each of the following bank transactions into ONE of these categories: ${CATEGORIES.join(", ")}.
Also determine if each transaction is likely a duplicate (same amount, similar description within 3 days).
Return results in the exact order provided.

Transactions:
${transactions.map((t, i) => `${i + 1}. [${t.transaction_type.toUpperCase()}] ${t.transaction_date} - "${t.description}" - ₹${t.amount}`).join("\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "return_categorised_transactions",
              description: "Return the categorised transactions in order",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number", description: "1-based index of the transaction" },
                        category: { type: "string", description: "Category from the provided list" },
                        is_duplicate: { type: "boolean", description: "Whether this is likely a duplicate" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["index", "category", "is_duplicate", "confidence"],
                    },
                  },
                },
                required: ["results"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_categorised_transactions" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI error:", status, text);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    const results = parsed.results as { index: number; category: string; is_duplicate: boolean; confidence: string }[];

    // Map back to transactions
    const categorised = transactions.map((tx, i) => {
      const result = results.find((r) => r.index === i + 1);
      return {
        ...tx,
        ai_suggested_category: result?.category ?? "Other",
        is_duplicate_flag: result?.is_duplicate ?? false,
        confidence: result?.confidence ?? "low",
      };
    });

    return new Response(JSON.stringify({ categorised }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("categorise-transactions error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
