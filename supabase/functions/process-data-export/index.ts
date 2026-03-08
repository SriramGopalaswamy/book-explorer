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
    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the export request
    const { data: exportReq, error: fetchErr } = await supabase
      .from("data_export_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (fetchErr || !exportReq) {
      return new Response(JSON.stringify({ error: "Export request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase
      .from("data_export_requests")
      .update({ status: "processing" })
      .eq("id", request_id);

    const userId = exportReq.user_id;
    const categories: string[] = exportReq.data_categories || [];
    const exportData: Record<string, unknown> = {};

    // Collect data per category
    for (const cat of categories) {
      switch (cat) {
        case "profile": {
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, email, phone, employee_code, department, designation, date_of_joining, date_of_birth, gender, blood_group, emergency_contact_name, emergency_contact_phone, address_line1, address_line2, city, state, country, pincode, aadhaar_number, pan_number, bank_account_number, bank_ifsc, bank_name")
            .eq("id", userId)
            .single();
          exportData.profile = data;
          break;
        }
        case "attendance": {
          const { data } = await supabase
            .from("attendance_records")
            .select("date, check_in, check_out, status, notes")
            .eq("user_id", userId)
            .order("date", { ascending: false })
            .limit(365);
          exportData.attendance = data;
          break;
        }
        case "leaves": {
          const { data } = await supabase
            .from("leave_requests")
            .select("leave_type, start_date, end_date, status, reason, total_days, approved_by, applied_at")
            .eq("user_id", userId)
            .order("start_date", { ascending: false });
          exportData.leaves = data;
          break;
        }
        case "payroll": {
          const { data } = await supabase
            .from("payroll_records")
            .select("pay_period, basic_salary, hra, da, special_allowance, gross_salary, pf_employee, pf_employer, esi_employee, esi_employer, professional_tax, tds, total_deductions, net_salary, status")
            .eq("user_id", userId)
            .order("pay_period", { ascending: false });
          exportData.payroll = data;
          break;
        }
        case "documents": {
          const { data } = await supabase
            .from("employee_documents")
            .select("document_type, document_name, uploaded_at, verified, verified_at")
            .eq("user_id", userId)
            .order("uploaded_at", { ascending: false });
          exportData.documents = data;
          break;
        }
        case "expenses": {
          const { data } = await supabase
            .from("expenses")
            .select("expense_date, category, description, amount, status, submitted_at")
            .eq("user_id", userId)
            .order("expense_date", { ascending: false });
          exportData.expenses = data;
          break;
        }
        case "goals": {
          const { data } = await supabase
            .from("goals")
            .select("title, description, status, progress, start_date, end_date, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          exportData.goals = data;
          break;
        }
      }
    }

    // Build JSON export
    const exportJson = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        user_id: userId,
        categories,
        data: exportData,
      },
      null,
      2
    );

    // Upload to storage
    const fileName = `data-exports/${userId}/${request_id}.json`;
    const { error: uploadErr } = await supabase.storage
      .from("employee-documents")
      .upload(fileName, new Blob([exportJson], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadErr) {
      await supabase
        .from("data_export_requests")
        .update({ status: "failed" })
        .eq("id", request_id);
      return new Response(JSON.stringify({ error: "Upload failed", details: uploadErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get signed URL (valid 7 days)
    const { data: signedUrl } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(fileName, 7 * 24 * 60 * 60);

    // Mark completed
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabase
      .from("data_export_requests")
      .update({
        status: "completed",
        file_url: signedUrl?.signedUrl || null,
        completed_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", request_id);

    return new Response(
      JSON.stringify({ success: true, file_url: signedUrl?.signedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-data-export error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
