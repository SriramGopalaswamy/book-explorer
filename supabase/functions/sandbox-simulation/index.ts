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
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is a super_admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: platformRole } = await adminClient
      .from("platform_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!platformRole) throw new Error("Super admin access required");

    const body = await req.json();
    const { action, sandbox_org_id, run_id } = body;

    // Verify this is a sandbox org
    if (sandbox_org_id) {
      const { data: org } = await adminClient
        .from("organizations")
        .select("id, environment_type, name")
        .eq("id", sandbox_org_id)
        .single();
      if (!org || org.environment_type !== "sandbox") {
        throw new Error("Target organization is not a sandbox environment. Simulation aborted for safety.");
      }
    }

    let result: Record<string, unknown> = {};

    switch (action) {
      case "reset_and_seed":
        result = await resetAndSeed(adminClient, sandbox_org_id, user.id);
        break;
      case "run_workflows":
        result = await runWorkflowSimulation(adminClient, sandbox_org_id, user.id, run_id);
        break;
      case "run_stress_test":
        result = await runStressTest(adminClient, sandbox_org_id, user.id, run_id);
        break;
      case "run_chaos_test":
        result = await runChaosTest(adminClient, sandbox_org_id, user.id, run_id);
        break;
      case "run_validation":
        result = await runAccountingValidation(adminClient, sandbox_org_id, user.id, run_id);
        break;
      case "run_full_simulation":
        result = await runFullSimulation(adminClient, sandbox_org_id, user.id);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Simulation error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ========== RESET & SEED ==========
async function resetAndSeed(client: any, orgId: string, userId: string) {
  const startTime = Date.now();
  const summary: Record<string, number> = {};

  // Clear existing transactional data (order matters for FK constraints)
  const tablesToClear = [
    "asset_depreciation_entries", "journal_lines", "journal_entries",
    "invoice_items", "invoices", "bill_items", "bills",
    "bank_transactions", "expenses", "credit_notes",
    "financial_records", "attendance_records", "leave_requests",
    "payroll_records", "assets", "audit_logs"
  ];

  for (const table of tablesToClear) {
    try {
      const { error } = await client.from(table).delete().eq("organization_id", orgId);
      if (error) console.warn(`Clear ${table}:`, error.message);
    } catch (_) { /* table may not exist or have different schema */ }
  }

  // Seed Vendors
  const vendors = [];
  const vendorNames = [
    "Acme Supplies Pvt Ltd", "TechGear Solutions", "Office Essentials Co",
    "CloudHost Services", "PrintPro India", "Green Energy Ltd",
    "SecureTech Systems", "FastLogistics Corp", "DataSoft Analytics", "BuildRight Materials"
  ];
  for (const name of vendorNames) {
    const { data } = await client.from("vendors").insert({
      name, organization_id: orgId, user_id: userId,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@sandbox.sim`,
      status: "active", source: "sandbox_simulation",
      gstin: `29AABCT${Math.floor(1000 + Math.random() * 9000)}K1Z${Math.floor(1 + Math.random() * 9)}`,
    }).select("id").single();
    if (data) vendors.push(data.id);
  }
  summary.vendors = vendors.length;

  // Seed Customers
  const customers = [];
  const customerNames = [
    "Pinnacle Corp", "Nexus Digital", "Metro Industries",
    "Bright Future Edu", "SwiftPay Fintech", "HealthPlus Pharma",
    "Urban Spaces Realty", "CreativeMinds Agency", "StarLine Retail", "Quantum Labs"
  ];
  for (const name of customerNames) {
    const { data } = await client.from("customers").insert({
      name, organization_id: orgId, user_id: userId,
      email: `billing@${name.toLowerCase().replace(/\s+/g, "")}.sim`,
      status: "active", source: "sandbox_simulation",
      tax_number: `27AADCS${Math.floor(1000 + Math.random() * 9000)}H1Z${Math.floor(1 + Math.random() * 9)}`,
    }).select("id").single();
    if (data) customers.push(data.id);
  }
  summary.customers = customers.length;

  // Seed Chart of Accounts (GL Accounts)
  const glAccounts: Record<string, string> = {};
  const coaEntries = [
    { code: "1000", name: "Cash & Bank", type: "asset" },
    { code: "1100", name: "Accounts Receivable", type: "asset" },
    { code: "1200", name: "Inventory", type: "asset" },
    { code: "1500", name: "Fixed Assets - Gross Block", type: "asset" },
    { code: "1510", name: "Accumulated Depreciation", type: "contra_asset" },
    { code: "2000", name: "Accounts Payable", type: "liability" },
    { code: "2100", name: "Tax Payable - GST Output", type: "liability" },
    { code: "2200", name: "TDS Payable", type: "liability" },
    { code: "3000", name: "Share Capital", type: "equity" },
    { code: "3100", name: "Retained Earnings", type: "equity" },
    { code: "4000", name: "Sales Revenue", type: "revenue" },
    { code: "4100", name: "Service Revenue", type: "revenue" },
    { code: "4200", name: "Other Income", type: "revenue" },
    { code: "5000", name: "Cost of Goods Sold", type: "expense" },
    { code: "5100", name: "Employee Salaries", type: "expense" },
    { code: "5200", name: "Rent Expense", type: "expense" },
    { code: "5300", name: "Utilities Expense", type: "expense" },
    { code: "5400", name: "Depreciation Expense", type: "expense" },
    { code: "5500", name: "Office Supplies", type: "expense" },
    { code: "5600", name: "Professional Fees", type: "expense" },
    { code: "5700", name: "Travel & Conveyance", type: "expense" },
    { code: "5800", name: "Insurance Expense", type: "expense" },
    { code: "5900", name: "Miscellaneous Expense", type: "expense" },
  ];
  for (const entry of coaEntries) {
    const { data } = await client.from("gl_accounts").upsert({
      code: entry.code, name: entry.name, account_type: entry.type,
      organization_id: orgId, is_active: true,
    }, { onConflict: "code,organization_id" }).select("id").single();
    if (data) glAccounts[entry.code] = data.id;
  }
  summary.gl_accounts = Object.keys(glAccounts).length;

  // Seed Assets
  const assetItems = [
    { name: "Dell Latitude 5540 Laptop", category: "IT Equipment", price: 85000, life: 36 },
    { name: "HP LaserJet Pro Printer", category: "Office Equipment", price: 32000, life: 60 },
    { name: "Conference Room Furniture Set", category: "Furniture", price: 150000, life: 120 },
    { name: "Server Rack - Primary DC", category: "IT Equipment", price: 450000, life: 60 },
    { name: "Company Vehicle - Maruti Ertiga", category: "Vehicles", price: 1200000, life: 96 },
  ];
  let assetCount = 0;
  for (const a of assetItems) {
    const { error } = await client.from("assets").insert({
      name: a.name, category: a.category, purchase_price: a.price,
      current_book_value: a.price, useful_life_months: a.life,
      organization_id: orgId, user_id: userId, status: "active",
      purchase_date: "2025-04-01", depreciation_method: "straight_line",
      salvage_value: Math.round(a.price * 0.05),
      asset_tag: `SIM-${Date.now()}-${assetCount}`, condition: "good",
    });
    if (!error) assetCount++;
  }
  summary.assets = assetCount;

  // Seed sample fiscal period
  const { error: fpError } = await client.from("fiscal_periods").insert({
    organization_id: orgId, name: "FY 2025-26",
    start_date: "2025-04-01", end_date: "2026-03-31",
    status: "open",
  });
  summary.fiscal_periods = fpError ? 0 : 1;

  return {
    success: true,
    action: "reset_and_seed",
    seed_summary: summary,
    total_records: Object.values(summary).reduce((a, b) => a + b, 0),
    execution_time_ms: Date.now() - startTime,
  };
}

// ========== WORKFLOW SIMULATION ==========
async function runWorkflowSimulation(client: any, orgId: string, userId: string, runId?: string) {
  const startTime = Date.now();
  const results: Array<{ workflow: string; status: string; detail: string; duration_ms: number }> = [];

  // WF1: Create invoices for customers
  const { data: customers } = await client.from("customers")
    .select("id, name").eq("organization_id", orgId).limit(5);
  for (const cust of (customers ?? [])) {
    const wfStart = Date.now();
    try {
      const invNum = `SIM-INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const amount = Math.round(10000 + Math.random() * 490000);
      const taxAmount = Math.round(amount * 0.18);
      const { error } = await client.from("invoices").insert({
        invoice_number: invNum, customer_id: cust.id, customer_name: cust.name,
        organization_id: orgId, user_id: userId, amount, tax_amount: taxAmount,
        total_amount: amount + taxAmount, status: "draft",
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        source: "sandbox_simulation",
      });
      results.push({
        workflow: `Invoice: ${invNum}`, status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${cust.name} — ₹${(amount + taxAmount).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Invoice for ${cust.name}`, status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF2: Create bills from vendors
  const { data: vendors } = await client.from("vendors")
    .select("id, name").eq("organization_id", orgId).limit(5);
  for (const v of (vendors ?? [])) {
    const wfStart = Date.now();
    try {
      const billNum = `SIM-BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const amount = Math.round(5000 + Math.random() * 200000);
      const taxAmount = Math.round(amount * 0.18);
      const { error } = await client.from("bills").insert({
        bill_number: billNum, vendor_id: v.id, vendor_name: v.name,
        organization_id: orgId, user_id: userId, amount, tax_amount: taxAmount,
        total_amount: amount + taxAmount, status: "draft",
        bill_date: new Date().toISOString().split("T")[0],
        source: "sandbox_simulation",
      });
      results.push({
        workflow: `Bill: ${billNum}`, status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${v.name} — ₹${(amount + taxAmount).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Bill for ${v.name}`, status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF3: Post journal entries
  const { data: glAccounts } = await client.from("gl_accounts")
    .select("id, code, name").eq("organization_id", orgId);
  const cashAccount = (glAccounts ?? []).find((a: any) => a.code === "1000");
  const revenueAccount = (glAccounts ?? []).find((a: any) => a.code === "4000");
  const expenseAccount = (glAccounts ?? []).find((a: any) => a.code === "5000");

  if (cashAccount && revenueAccount) {
    for (let i = 0; i < 5; i++) {
      const wfStart = Date.now();
      try {
        const amount = Math.round(20000 + Math.random() * 300000);
        const entryNum = `SIM-JE-${Date.now()}-${i}`;
        const { data: je, error: jeErr } = await client.from("journal_entries").insert({
          entry_number: entryNum, organization_id: orgId, user_id: userId,
          entry_date: new Date().toISOString().split("T")[0],
          description: `Simulation journal entry #${i + 1}`,
          status: "draft", source: "sandbox_simulation",
          total_debit: amount, total_credit: amount,
        }).select("id").single();
        if (jeErr) throw jeErr;

        await client.from("journal_lines").insert([
          { journal_entry_id: je.id, gl_account_id: cashAccount.id, debit: amount, credit: 0, description: "Cash received" },
          { journal_entry_id: je.id, gl_account_id: revenueAccount.id, debit: 0, credit: amount, description: "Revenue recognized" },
        ]);
        results.push({ workflow: `Journal: ${entryNum}`, status: "passed", detail: `Balanced entry ₹${amount.toLocaleString()}`, duration_ms: Date.now() - wfStart });
      } catch (e) {
        results.push({ workflow: `Journal entry #${i + 1}`, status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  // WF4: Create expenses
  for (let i = 0; i < 5; i++) {
    const wfStart = Date.now();
    try {
      const amount = Math.round(500 + Math.random() * 50000);
      const categories = ["Travel", "Office Supplies", "Software", "Meals", "Transport"];
      const { error } = await client.from("expenses").insert({
        description: `Simulation expense - ${categories[i]}`, amount,
        category: categories[i], organization_id: orgId, user_id: userId,
        status: "pending", date: new Date().toISOString().split("T")[0],
        source: "sandbox_simulation",
      });
      results.push({
        workflow: `Expense: ${categories[i]}`, status: error ? "failed" : "passed",
        detail: error?.message ?? `₹${amount.toLocaleString()}`, duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Expense #${i + 1}`, status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF5: Create financial records
  if (cashAccount && expenseAccount) {
    for (let i = 0; i < 3; i++) {
      const wfStart = Date.now();
      try {
        const amount = Math.round(10000 + Math.random() * 100000);
        const types = ["income", "expense", "transfer"];
        const { error } = await client.from("financial_records").insert({
          type: types[i], amount, description: `Simulation ${types[i]} record`,
          category: "simulation", organization_id: orgId, user_id: userId,
          status: "draft", record_date: new Date().toISOString().split("T")[0],
          source: "sandbox_simulation",
        });
        results.push({
          workflow: `Financial record: ${types[i]}`, status: error ? "failed" : "passed",
          detail: error?.message ?? `₹${amount.toLocaleString()}`, duration_ms: Date.now() - wfStart,
        });
      } catch (e) {
        results.push({ workflow: `Financial record #${i + 1}`, status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;

  // Update simulation run if provided
  if (runId) {
    await client.from("simulation_runs").update({
      workflows_executed: results.length,
      workflows_passed: passed,
      workflows_failed: failed,
      workflow_details: results,
      total_records_created: passed,
    }).eq("id", runId);
  }

  return {
    success: true, action: "run_workflows",
    workflows_executed: results.length, passed, failed,
    workflow_details: results,
    execution_time_ms: Date.now() - startTime,
  };
}

// ========== STRESS TEST ==========
async function runStressTest(client: any, orgId: string, userId: string, runId?: string) {
  const startTime = Date.now();
  const concurrentUsers = 20;
  const results: Array<{ user: number; workflow: string; status: string; duration_ms: number; detail: string }> = [];

  // Simulate concurrent operations with Promise.allSettled
  const tasks = Array.from({ length: concurrentUsers }, (_, userIdx) => {
    return (async () => {
      const wfStart = Date.now();
      const ops = ["invoice", "expense", "journal", "bill"];
      const op = ops[userIdx % ops.length];

      try {
        switch (op) {
          case "invoice": {
            const { error } = await client.from("invoices").insert({
              invoice_number: `STRESS-${userIdx}-${Date.now()}`,
              customer_name: `Stress Customer ${userIdx}`,
              organization_id: orgId, user_id: userId,
              amount: 10000, tax_amount: 1800, total_amount: 11800,
              status: "draft", issue_date: new Date().toISOString().split("T")[0],
              due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
              source: "sandbox_simulation",
            });
            if (error) throw error;
            break;
          }
          case "expense": {
            const { error } = await client.from("expenses").insert({
              description: `Stress expense user ${userIdx}`, amount: 5000 + userIdx * 100,
              category: "Stress Test", organization_id: orgId, user_id: userId,
              status: "pending", date: new Date().toISOString().split("T")[0],
              source: "sandbox_simulation",
            });
            if (error) throw error;
            break;
          }
          case "journal": {
            const { data: accounts } = await client.from("gl_accounts")
              .select("id").eq("organization_id", orgId).limit(2);
            if (accounts && accounts.length >= 2) {
              const { data: je, error: jeErr } = await client.from("journal_entries").insert({
                entry_number: `STRESS-JE-${userIdx}-${Date.now()}`,
                organization_id: orgId, user_id: userId,
                entry_date: new Date().toISOString().split("T")[0],
                description: `Stress test journal ${userIdx}`, status: "draft",
                source: "sandbox_simulation", total_debit: 10000, total_credit: 10000,
              }).select("id").single();
              if (jeErr) throw jeErr;
              await client.from("journal_lines").insert([
                { journal_entry_id: je.id, gl_account_id: accounts[0].id, debit: 10000, credit: 0 },
                { journal_entry_id: je.id, gl_account_id: accounts[1].id, debit: 0, credit: 10000 },
              ]);
            }
            break;
          }
          case "bill": {
            const { error } = await client.from("bills").insert({
              bill_number: `STRESS-BILL-${userIdx}-${Date.now()}`,
              vendor_name: `Stress Vendor ${userIdx}`,
              organization_id: orgId, user_id: userId,
              amount: 8000, tax_amount: 1440, total_amount: 9440,
              status: "draft", bill_date: new Date().toISOString().split("T")[0],
              source: "sandbox_simulation",
            });
            if (error) throw error;
            break;
          }
        }
        return { user: userIdx, workflow: op, status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
      } catch (e) {
        return { user: userIdx, workflow: op, status: "failed", duration_ms: Date.now() - wfStart, detail: (e as Error).message };
      }
    })();
  });

  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(s.value);
    else results.push({ user: -1, workflow: "unknown", status: "failed", duration_ms: 0, detail: s.reason?.message ?? "Unknown error" });
  }

  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;
  const avgDuration = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.duration_ms, 0) / results.length) : 0;

  const stressResults = {
    concurrent_users: concurrentUsers, total_operations: results.length,
    passed, failed, avg_duration_ms: avgDuration,
    max_duration_ms: Math.max(...results.map(r => r.duration_ms)),
    min_duration_ms: Math.min(...results.map(r => r.duration_ms)),
    details: results,
  };

  if (runId) {
    await client.from("simulation_runs").update({
      stress_test_results: stressResults,
      concurrent_users_simulated: concurrentUsers,
    }).eq("id", runId);
  }

  return { success: true, action: "run_stress_test", ...stressResults, execution_time_ms: Date.now() - startTime };
}

// ========== CHAOS TEST ==========
async function runChaosTest(client: any, orgId: string, userId: string, runId?: string) {
  const startTime = Date.now();
  const results: Array<{ test: string; status: string; detail: string }> = [];

  // Chaos 1: Duplicate submissions
  const dupInvNum = `CHAOS-DUP-${Date.now()}`;
  for (let i = 0; i < 3; i++) {
    const { error } = await client.from("invoices").insert({
      invoice_number: dupInvNum, customer_name: "Chaos Test Customer",
      organization_id: orgId, user_id: userId,
      amount: 10000, tax_amount: 1800, total_amount: 11800,
      status: "draft", issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      source: "sandbox_simulation",
    });
    if (i === 0) {
      results.push({ test: "Duplicate invoice - first insert", status: error ? "anomaly" : "passed", detail: error?.message ?? "First insert succeeded" });
    } else {
      // Duplicates may or may not be blocked depending on constraints
      results.push({
        test: `Duplicate invoice - attempt ${i + 1}`,
        status: error ? "blocked" : "anomaly",
        detail: error ? `Correctly blocked: ${error.message}` : "WARNING: Duplicate accepted — missing unique constraint",
      });
    }
  }

  // Chaos 2: Negative amounts
  const { error: negErr } = await client.from("expenses").insert({
    description: "Chaos: negative amount", amount: -5000,
    category: "Chaos Test", organization_id: orgId, user_id: userId,
    status: "pending", date: new Date().toISOString().split("T")[0],
    source: "sandbox_simulation",
  });
  results.push({
    test: "Negative expense amount",
    status: negErr ? "blocked" : "anomaly",
    detail: negErr ? `Correctly blocked: ${negErr.message}` : "WARNING: Negative amount accepted",
  });

  // Chaos 3: Imbalanced journal entry
  const { data: accounts } = await client.from("gl_accounts")
    .select("id").eq("organization_id", orgId).limit(2);
  if (accounts && accounts.length >= 2) {
    const { data: je } = await client.from("journal_entries").insert({
      entry_number: `CHAOS-IMBAL-${Date.now()}`,
      organization_id: orgId, user_id: userId,
      entry_date: new Date().toISOString().split("T")[0],
      description: "Chaos: imbalanced journal", status: "draft",
      source: "sandbox_simulation", total_debit: 10000, total_credit: 5000,
    }).select("id").single();
    if (je) {
      await client.from("journal_lines").insert([
        { journal_entry_id: je.id, gl_account_id: accounts[0].id, debit: 10000, credit: 0 },
        { journal_entry_id: je.id, gl_account_id: accounts[1].id, debit: 0, credit: 5000 },
      ]);
      results.push({
        test: "Imbalanced journal entry",
        status: "anomaly",
        detail: "WARNING: Imbalanced journal accepted (debit=10000, credit=5000) — needs validation trigger",
      });
    }
  }

  // Chaos 4: Rapid-fire operations
  const rapidTasks = Array.from({ length: 10 }, (_, i) =>
    client.from("financial_records").insert({
      type: "expense", amount: 100 + i, description: `Rapid-fire #${i}`,
      category: "chaos", organization_id: orgId, user_id: userId,
      status: "draft", record_date: new Date().toISOString().split("T")[0],
      source: "sandbox_simulation",
    })
  );
  const rapidResults = await Promise.allSettled(rapidTasks);
  const rapidPassed = rapidResults.filter(r => r.status === "fulfilled" && !(r.value as any).error).length;
  results.push({
    test: "Rapid-fire 10 operations",
    status: rapidPassed === 10 ? "passed" : "partial",
    detail: `${rapidPassed}/10 rapid-fire inserts succeeded`,
  });

  const chaosResults = {
    total_tests: results.length,
    anomalies: results.filter(r => r.status === "anomaly").length,
    blocked: results.filter(r => r.status === "blocked").length,
    details: results,
  };

  if (runId) {
    await client.from("simulation_runs").update({ chaos_test_results: chaosResults }).eq("id", runId);
  }

  return { success: true, action: "run_chaos_test", ...chaosResults, execution_time_ms: Date.now() - startTime };
}

// ========== ACCOUNTING VALIDATION ==========
async function runAccountingValidation(client: any, orgId: string, userId: string, runId?: string) {
  const startTime = Date.now();
  const checks: Array<{ check: string; status: string; detail: string }> = [];

  // V1: Debits = Credits
  const { data: balanceData } = await client.rpc("run_financial_verification", { _org_id: orgId });
  if (balanceData && Array.isArray(balanceData)) {
    for (const check of balanceData) {
      if (check.id === "SUMMARY") continue;
      checks.push({
        check: check.id,
        status: check.status === "PASS" ? "passed" : check.status === "WARNING" ? "warning" : "failed",
        detail: check.message,
      });
    }
  } else {
    checks.push({ check: "V_VERIFICATION_ENGINE", status: "failed", detail: "Could not run verification engine" });
  }

  // V2: Check depreciation entries exist for active assets
  const { count: activeAssets } = await client.from("assets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId).eq("status", "active");
  const { count: depEntries } = await client.from("asset_depreciation_entries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_DEPRECIATION_COVERAGE",
    status: (activeAssets ?? 0) > 0 && (depEntries ?? 0) === 0 ? "warning" : "passed",
    detail: `${activeAssets ?? 0} active assets, ${depEntries ?? 0} depreciation entries`,
  });

  // V3: Audit log coverage
  const { count: auditCount } = await client.from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_AUDIT_COVERAGE",
    status: (auditCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${auditCount ?? 0} audit log entries for sandbox org`,
  });

  const passed = checks.filter(c => c.status === "passed").length;
  const failed = checks.filter(c => c.status === "failed").length;
  const allPassed = failed === 0;

  if (runId) {
    await client.from("simulation_runs").update({
      validation_passed: allPassed,
      validation_details: checks,
    }).eq("id", runId);
  }

  return {
    success: true, action: "run_validation",
    validation_passed: allPassed,
    total_checks: checks.length, passed, failed,
    warnings: checks.filter(c => c.status === "warning").length,
    details: checks,
    execution_time_ms: Date.now() - startTime,
  };
}

// ========== FULL SIMULATION ==========
async function runFullSimulation(client: any, orgId: string, userId: string) {
  const fullStart = Date.now();

  // Create simulation run record
  const { data: run, error: runErr } = await client.from("simulation_runs").insert({
    sandbox_org_id: orgId, run_type: "full", status: "running",
    initiated_by: userId, started_at: new Date().toISOString(),
  }).select("id").single();
  if (runErr) throw runErr;
  const runId = run.id;

  try {
    // Phase 1: Reset & Seed
    await client.from("simulation_runs").update({ status: "running" }).eq("id", runId);
    const seedResult = await resetAndSeed(client, orgId, userId);
    await client.from("simulation_runs").update({
      seed_summary: seedResult.seed_summary,
    }).eq("id", runId);

    // Phase 2: Workflow Simulation
    const workflowResult = await runWorkflowSimulation(client, orgId, userId, runId);

    // Phase 3: Stress Test
    const stressResult = await runStressTest(client, orgId, userId, runId);

    // Phase 4: Chaos Test
    const chaosResult = await runChaosTest(client, orgId, userId, runId);

    // Phase 5: Accounting Validation
    const validationResult = await runAccountingValidation(client, orgId, userId, runId);

    const totalTime = Date.now() - fullStart;

    // Generate report
    const report = {
      simulation_id: runId,
      sandbox_org_id: orgId,
      timestamp: new Date().toISOString(),
      total_execution_time_ms: totalTime,
      phases: {
        seed: seedResult,
        workflows: workflowResult,
        stress_test: stressResult,
        chaos_test: chaosResult,
        validation: validationResult,
      },
      summary: {
        total_records_created: (seedResult.total_records ?? 0) + (workflowResult.passed ?? 0) + (stressResult.passed ?? 0),
        total_workflows: workflowResult.workflows_executed,
        total_errors: (workflowResult.failed ?? 0) + (stressResult.failed ?? 0) + (chaosResult.anomalies ?? 0),
        validation_passed: validationResult.validation_passed,
        concurrent_users_tested: stressResult.concurrent_users ?? 0,
        chaos_anomalies: chaosResult.anomalies ?? 0,
      },
    };

    // Generate HTML report
    const htmlReport = generateHTMLReport(report);

    await client.from("simulation_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_records_created: report.summary.total_records_created,
      total_execution_time_ms: totalTime,
      errors: [
        ...(workflowResult.workflow_details ?? []).filter((w: any) => w.status === "failed"),
        ...(stressResult.details ?? []).filter((s: any) => s.status === "failed"),
      ],
      report_json: report,
      report_html: htmlReport,
    }).eq("id", runId);

    return { success: true, action: "run_full_simulation", run_id: runId, report };
  } catch (err) {
    await client.from("simulation_runs").update({
      status: "failed", completed_at: new Date().toISOString(),
      errors: [{ phase: "full_simulation", error: (err as Error).message }],
    }).eq("id", runId);
    throw err;
  }
}

function generateHTMLReport(report: any): string {
  const s = report.summary;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Simulation Report - ${report.simulation_id}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
  h1 { color: #16213e; border-bottom: 3px solid #0f3460; padding-bottom: 12px; }
  h2 { color: #0f3460; margin-top: 32px; }
  .metric { display: inline-block; background: #f0f4ff; border-radius: 8px; padding: 16px 24px; margin: 8px; text-align: center; min-width: 140px; }
  .metric .value { font-size: 28px; font-weight: 700; color: #0f3460; }
  .metric .label { font-size: 12px; color: #666; margin-top: 4px; }
  .pass { color: #10b981; } .fail { color: #ef4444; } .warn { color: #f59e0b; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f8fafc; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-pass { background: #d1fae5; color: #065f46; }
  .badge-fail { background: #fee2e2; color: #991b1b; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .timestamp { color: #94a3b8; font-size: 13px; }
</style></head><body>
<h1>🔬 Financial Simulation Report</h1>
<p class="timestamp">Generated: ${report.timestamp} | Duration: ${(report.total_execution_time_ms / 1000).toFixed(1)}s</p>
<div>
  <div class="metric"><div class="value">${s.total_records_created}</div><div class="label">Records Created</div></div>
  <div class="metric"><div class="value">${s.total_workflows}</div><div class="label">Workflows Run</div></div>
  <div class="metric"><div class="value ${s.total_errors > 0 ? 'fail' : 'pass'}">${s.total_errors}</div><div class="label">Errors</div></div>
  <div class="metric"><div class="value">${s.concurrent_users_tested}</div><div class="label">Concurrent Users</div></div>
  <div class="metric"><div class="value ${s.validation_passed ? 'pass' : 'fail'}">${s.validation_passed ? '✓' : '✗'}</div><div class="label">Integrity</div></div>
</div>
<h2>Seed Data</h2>
<table><tr>${Object.keys(report.phases.seed.seed_summary ?? {}).map((k: string) => `<th>${k}</th>`).join('')}</tr>
<tr>${Object.values(report.phases.seed.seed_summary ?? {}).map((v: any) => `<td>${v}</td>`).join('')}</tr></table>
<h2>Workflow Results</h2>
<table><tr><th>Workflow</th><th>Status</th><th>Detail</th><th>Duration</th></tr>
${(report.phases.workflows.workflow_details ?? []).map((w: any) =>
  `<tr><td>${w.workflow}</td><td><span class="badge badge-${w.status === 'passed' ? 'pass' : 'fail'}">${w.status}</span></td><td>${w.detail}</td><td>${w.duration_ms}ms</td></tr>`
).join('')}</table>
<h2>Stress Test</h2>
<p>${report.phases.stress_test.passed ?? 0} passed / ${report.phases.stress_test.failed ?? 0} failed across ${report.phases.stress_test.concurrent_users ?? 0} concurrent users. Avg: ${report.phases.stress_test.avg_duration_ms ?? 0}ms</p>
<h2>Chaos Test</h2>
<table><tr><th>Test</th><th>Status</th><th>Detail</th></tr>
${(report.phases.chaos_test.details ?? []).map((c: any) =>
  `<tr><td>${c.test}</td><td><span class="badge badge-${c.status === 'passed' || c.status === 'blocked' ? 'pass' : c.status === 'anomaly' ? 'fail' : 'warn'}">${c.status}</span></td><td>${c.detail}</td></tr>`
).join('')}</table>
<h2>Accounting Validation</h2>
<table><tr><th>Check</th><th>Status</th><th>Detail</th></tr>
${(report.phases.validation.details ?? []).map((v: any) =>
  `<tr><td>${v.check}</td><td><span class="badge badge-${v.status === 'passed' ? 'pass' : v.status === 'warning' ? 'warn' : 'fail'}">${v.status}</span></td><td>${v.detail}</td></tr>`
).join('')}</table>
</body></html>`;
}
