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

  // Use the SECURITY DEFINER function to force-delete journal data (bypasses immutability triggers)
  const { error: jdErr } = await client.rpc("sandbox_force_delete_journal_data", { _org_id: orgId });
  if (jdErr) console.warn("Force delete journal data:", jdErr.message);

  // Clean up previously seeded sandbox simulation users
  const { data: simProfiles } = await client.from("profiles")
    .select("id, email")
    .eq("organization_id", orgId)
    .like("email", "%@sandbox-sim.local");
  for (const sp of (simProfiles ?? [])) {
    try {
      // Delete compensation structures first (FK)
      await client.from("compensation_structures").delete().eq("profile_id", sp.id);
      // Delete profile (will cascade)
      await client.from("profiles").delete().eq("id", sp.id);
      // Delete auth user
      await client.auth.admin.deleteUser(sp.id);
    } catch (e) {
      console.warn(`Cleanup user ${sp.email}:`, (e as Error).message);
    }
  }

  // Clear existing transactional data (order matters for FK constraints)
  // journal_entries and journal_lines already handled above
  const orgScopedTables = [
    "payslip_disputes", "payroll_records", "payroll_runs",
    "reimbursement_requests",
    "goal_plans", "memos",
    "attendance_daily", "attendance_punches", "attendance_records",
    "leave_requests",
    "asset_depreciation_entries",
    "invoices", "bills",
    "bank_transactions", "expenses", "credit_notes",
    "financial_records", "assets", "audit_logs",
    "compensation_structures",
  ];

  // Delete child tables that lack organization_id (use parent FK)
  const { data: invIds } = await client.from("invoices")
    .select("id").eq("organization_id", orgId);
  if (invIds && invIds.length > 0) {
    const ids = invIds.map((i: any) => i.id);
    for (let i = 0; i < ids.length; i += 50) {
      await client.from("invoice_items").delete().in("invoice_id", ids.slice(i, i + 50));
    }
  }

  const { data: billIds } = await client.from("bills")
    .select("id").eq("organization_id", orgId);
  if (billIds && billIds.length > 0) {
    const ids = billIds.map((b: any) => b.id);
    for (let i = 0; i < ids.length; i += 50) {
      await client.from("bill_items").delete().in("bill_id", ids.slice(i, i + 50));
    }
  }

  // Now clear org-scoped tables
  for (const table of orgScopedTables) {
    try {
      const { error } = await client.from(table).delete().eq("organization_id", orgId);
      if (error) console.warn(`Clear ${table}:`, error.message);
    } catch (_) { /* table may not exist */ }
  }

  // ===== SEED VENDORS =====
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
      status: "active",
      tax_number: `29AABCT${Math.floor(1000 + Math.random() * 9000)}K1Z${Math.floor(1 + Math.random() * 9)}`,
    }).select("id").single();
    if (data) vendors.push(data.id);
  }
  summary.vendors = vendors.length;

  // ===== SEED CUSTOMERS =====
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
      status: "active",
      tax_number: `27AADCS${Math.floor(1000 + Math.random() * 9000)}H1Z${Math.floor(1 + Math.random() * 9)}`,
    }).select("id").single();
    if (data) customers.push(data.id);
  }
  summary.customers = customers.length;

  // ===== SEED GL ACCOUNTS =====
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

  // ===== SEED ASSETS =====
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

  // ===== SEED FINANCIAL YEAR & FISCAL PERIODS =====
  let fyCount = 0;
  // First create or find the financial year
  const { data: existingFY } = await client.from("financial_years")
    .select("id")
    .eq("organization_id", orgId)
    .eq("start_date", "2025-04-01")
    .maybeSingle();

  let financialYearId = existingFY?.id;
  if (!financialYearId) {
    const { data: newFY, error: fyErr } = await client.from("financial_years").insert({
      organization_id: orgId, start_date: "2025-04-01", end_date: "2026-03-31", is_active: true,
    }).select("id").single();
    if (!fyErr && newFY) {
      financialYearId = newFY.id;
      fyCount = 1;
    }
  } else {
    fyCount = 1;
  }

  if (financialYearId) {
    // Check if fiscal periods already exist for this FY
    const { count: existingPeriods } = await client.from("fiscal_periods")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("financial_year_id", financialYearId);

    if ((existingPeriods ?? 0) === 0) {
      // Create 12 monthly periods
      const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      for (let i = 0; i < 12; i++) {
        const year = i < 9 ? 2025 : 2026;
        const month = i < 9 ? i + 4 : i - 8;
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${endDay}`;

        await client.from("fiscal_periods").insert({
          organization_id: orgId,
          financial_year_id: financialYearId,
          period_name: `${months[i]} ${year}`,
          period_number: i + 1,
          start_date: startDate,
          end_date: endDate,
          status: "open",
        });
      }
    }
  }
  summary.fiscal_year = fyCount;

  // ===== SEED LEAVE TYPES =====
  const leaveTypes = [
    { key: "CL", label: "Casual Leave", default_days: 12, color: "#3b82f6", icon: "☀️", is_active: true, sort_order: 1 },
    { key: "SL", label: "Sick Leave", default_days: 10, color: "#ef4444", icon: "🏥", is_active: true, sort_order: 2 },
    { key: "EL", label: "Earned Leave", default_days: 15, color: "#10b981", icon: "📅", is_active: true, sort_order: 3 },
  ];
  let leaveTypeCount = 0;
  for (const lt of leaveTypes) {
    const { error } = await client.from("leave_types").upsert({
      ...lt, organization_id: orgId,
    }, { onConflict: "organization_id,key" });
    if (!error) leaveTypeCount++;
  }
  summary.leave_types = leaveTypeCount;

  // ===== SEED ATTENDANCE SHIFTS =====
  // Delete existing shifts for this org first, then insert fresh
  await client.from("attendance_shifts").delete().eq("organization_id", orgId);
  const { error: shiftErr } = await client.from("attendance_shifts").insert({
    name: "General Shift", organization_id: orgId,
    start_time: "09:00", end_time: "18:00",
    full_day_minutes: 480, min_half_day_minutes: 240,
    grace_minutes: 15, ot_after_minutes: 540, is_default: true,
  });
  summary.attendance_shifts = shiftErr ? 0 : 1;

  // ===== SEED SANDBOX PROFILES (employees) =====
  const { data: existingProfiles } = await client.from("profiles")
    .select("id").eq("organization_id", orgId);

  const targetEmployeeCount = 8;
  let seededProfiles = (existingProfiles ?? []).length;

  if (seededProfiles < targetEmployeeCount) {
    const employeeSeeds = [
      { name: "Arjun Mehta", dept: "Engineering", designation: "Senior Developer", code: "SIM-EMP-001", salary: 95000 },
      { name: "Priya Sharma", dept: "Finance", designation: "Finance Manager", code: "SIM-EMP-002", salary: 85000 },
      { name: "Rahul Verma", dept: "Operations", designation: "Operations Lead", code: "SIM-EMP-003", salary: 72000 },
      { name: "Sneha Iyer", dept: "HR", designation: "HR Executive", code: "SIM-EMP-004", salary: 60000 },
      { name: "Vikram Singh", dept: "Engineering", designation: "Tech Lead", code: "SIM-EMP-005", salary: 110000 },
      { name: "Ananya Reddy", dept: "Marketing", designation: "Marketing Analyst", code: "SIM-EMP-006", salary: 55000 },
      { name: "Karan Patel", dept: "Sales", designation: "Sales Executive", code: "SIM-EMP-007", salary: 65000 },
      { name: "Deepika Nair", dept: "Engineering", designation: "QA Engineer", code: "SIM-EMP-008", salary: 68000 },
    ];

    // Only create employees we're missing
    const toCreate = employeeSeeds.slice(seededProfiles);

    for (const emp of toCreate) {
      try {
        const email = `${emp.code.toLowerCase()}@sandbox-sim.local`;
        const tempPassword = crypto.randomUUID() + "Aa1!";

        // Create auth user (triggers handle_new_user which creates a profile)
        const { data: newUser, error: createErr } = await client.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: emp.name },
        });

        if (createErr) {
          console.warn(`Failed to create user ${emp.name}:`, createErr.message);
          continue;
        }

        // Update the auto-created profile with employee details
        const { error: updateErr } = await client.from("profiles").update({
          organization_id: orgId,
          full_name: emp.name,
          department: emp.dept,
          designation: emp.designation,
          employee_code: emp.code,
          employment_status: "active",
          date_of_joining: "2024-06-01",
          role: "employee",
        }).eq("id", newUser.user.id);

        if (updateErr) {
          console.warn(`Failed to update profile for ${emp.name}:`, updateErr.message);
        } else {
          seededProfiles++;
        }
      } catch (e) {
        console.warn(`Error seeding employee ${emp.name}:`, (e as Error).message);
      }
    }
  }
  summary.profiles = seededProfiles;

  // ===== SEED COMPENSATION STRUCTURES for seeded profiles =====
  const { data: seededProfileList } = await client.from("profiles")
    .select("id, full_name, employee_code")
    .eq("organization_id", orgId);

  const salaryMap: Record<string, number> = {
    "SIM-EMP-001": 95000, "SIM-EMP-002": 85000, "SIM-EMP-003": 72000, "SIM-EMP-004": 60000,
    "SIM-EMP-005": 110000, "SIM-EMP-006": 55000, "SIM-EMP-007": 65000, "SIM-EMP-008": 68000,
  };
  let compCount = 0;
  for (const p of (seededProfileList ?? [])) {
    const basic = salaryMap[p.employee_code] ?? 50000;
    const annualCTC = Math.round(basic * 12 * 1.55);
    // Check if comp structure already exists
    const { data: existingComp } = await client.from("compensation_structures")
      .select("id").eq("profile_id", p.id).eq("effective_from", "2024-06-01").maybeSingle();
    if (!existingComp) {
      const { error: compErr } = await client.from("compensation_structures").insert({
        profile_id: p.id, organization_id: orgId,
        annual_ctc: annualCTC, created_by: userId,
        effective_from: "2024-06-01", is_active: true,
      });
      if (!compErr) compCount++;
      else console.warn(`Comp structure for ${p.full_name}:`, compErr.message);
    } else {
      compCount++;
    }
  }
  summary.compensation_structures = compCount;

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
  const results: Array<{ workflow: string; module: string; status: string; detail: string; duration_ms: number }> = [];

  // Get profiles in this org for HR workflows
  const { data: profiles } = await client.from("profiles")
    .select("id, full_name, employee_code")
    .eq("organization_id", orgId).limit(10);
  const profileList = profiles ?? [];

  if (profileList.length === 0) {
    results.push({
      workflow: "HR Profile Check", module: "HR", status: "failed",
      detail: "No employee profiles found in sandbox org — Attendance, Leave, Payroll, Reimbursement & Performance workflows require at least 1 profile. Add employees via onboarding or sandbox join.",
      duration_ms: 0,
    });
  }

  // ===== FINANCE WORKFLOWS =====

  // WF1: Create invoices
  const { data: customers } = await client.from("customers")
    .select("id, name").eq("organization_id", orgId).limit(5);
  for (const cust of (customers ?? [])) {
    const wfStart = Date.now();
    try {
      const invNum = `SIM-INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const amount = Math.round(10000 + Math.random() * 490000);
      const taxAmount = Math.round(amount * 0.18);
      const { error } = await client.from("invoices").insert({
        invoice_number: invNum, customer_id: cust.id, client_name: cust.name,
        client_email: `billing@${cust.name.toLowerCase().replace(/\s+/g, "")}.sim`,
        organization_id: orgId, user_id: userId, amount,
        total_amount: amount + taxAmount, status: "draft",
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      });
      results.push({
        workflow: `Invoice: ${invNum}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${cust.name} — ₹${(amount + taxAmount).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Invoice for ${cust.name}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF2: Create bills
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
      });
      results.push({
        workflow: `Bill: ${billNum}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${v.name} — ₹${(amount + taxAmount).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Bill for ${v.name}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF3: Post journal entries
  const { data: glAccounts } = await client.from("gl_accounts")
    .select("id, code, name").eq("organization_id", orgId);
  const cashAccount = (glAccounts ?? []).find((a: any) => a.code === "1000");
  const revenueAccount = (glAccounts ?? []).find((a: any) => a.code === "4000");
  const expenseAccount = (glAccounts ?? []).find((a: any) => a.code === "5000");
  const salaryAccount = (glAccounts ?? []).find((a: any) => a.code === "5100");

  if (cashAccount && revenueAccount) {
    for (let i = 0; i < 5; i++) {
      const wfStart = Date.now();
      try {
        const amount = Math.round(20000 + Math.random() * 300000);
        const entryNum = `SIM-JE-${Date.now()}-${i}`;
        const { data: je, error: jeErr } = await client.from("journal_entries").insert({
          document_sequence_number: entryNum, organization_id: orgId, created_by: userId,
          entry_date: new Date().toISOString().split("T")[0],
          memo: `Simulation journal entry #${i + 1}`,
          status: "draft", source_type: "sandbox_simulation",
        }).select("id").single();
        if (jeErr) throw jeErr;

        await client.from("journal_lines").insert([
          { journal_entry_id: je.id, gl_account_id: cashAccount.id, debit: amount, credit: 0, description: "Cash received" },
          { journal_entry_id: je.id, gl_account_id: revenueAccount.id, debit: 0, credit: amount, description: "Revenue recognized" },
        ]);
        results.push({ workflow: `Journal: ${entryNum}`, module: "Finance", status: "passed", detail: `Balanced entry ₹${amount.toLocaleString()}`, duration_ms: Date.now() - wfStart });
      } catch (e) {
        results.push({ workflow: `Journal entry #${i + 1}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  // WF4: Create expenses
  const expenseCategories = ["Travel", "Office Supplies", "Software", "Meals", "Transport"];
  for (let i = 0; i < 5; i++) {
    const wfStart = Date.now();
    try {
      const amount = Math.round(500 + Math.random() * 50000);
      const { error } = await client.from("expenses").insert({
        description: `Simulation expense - ${expenseCategories[i]}`, amount,
        category: expenseCategories[i], organization_id: orgId, user_id: userId,
        status: "pending", expense_date: new Date().toISOString().split("T")[0],
      });
      results.push({
        workflow: `Expense: ${expenseCategories[i]}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `₹${amount.toLocaleString()}`, duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Expense #${i + 1}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF5: Financial records
  if (cashAccount && expenseAccount) {
    for (let i = 0; i < 3; i++) {
      const wfStart = Date.now();
      try {
        const amount = Math.round(10000 + Math.random() * 100000);
        const types = ["income", "expense", "transfer"];
        const { error } = await client.from("financial_records").insert({
          type: types[i], amount, description: `Simulation ${types[i]} record`,
          category: "simulation", organization_id: orgId, user_id: userId,
          record_date: new Date().toISOString().split("T")[0],
        });
        results.push({
          workflow: `Financial record: ${types[i]}`, module: "Finance", status: error ? "failed" : "passed",
          detail: error?.message ?? `₹${amount.toLocaleString()}`, duration_ms: Date.now() - wfStart,
        });
      } catch (e) {
        results.push({ workflow: `Financial record #${i + 1}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  // ===== ATTENDANCE WORKFLOWS =====

  // WF6: Create attendance records for each profile
  const today = new Date();
  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split("T")[0];

    for (const profile of profileList.slice(0, 5)) {
      const wfStart = Date.now();
      try {
        const checkIn = `${dateStr}T09:${String(Math.floor(Math.random() * 30)).padStart(2, "0")}:00`;
        const checkOut = `${dateStr}T18:${String(Math.floor(Math.random() * 30)).padStart(2, "0")}:00`;
        const { error } = await client.from("attendance_records").insert({
          user_id: profile.id, profile_id: profile.id,
          organization_id: orgId, date: dateStr,
          check_in: checkIn, check_out: checkOut,
          status: "present",
        });
        results.push({
          workflow: `Attendance: ${profile.full_name ?? profile.employee_code ?? "Employee"} on ${dateStr}`,
          module: "Attendance", status: error ? "failed" : "passed",
          detail: error?.message ?? `${checkIn.split("T")[1]} → ${checkOut.split("T")[1]}`,
          duration_ms: Date.now() - wfStart,
        });
      } catch (e) {
        results.push({ workflow: `Attendance ${dateStr}`, module: "Attendance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  // ===== LEAVE WORKFLOWS =====

  // WF7: Create leave requests (various types & statuses)
  const leaveScenarios = [
    { type: "Casual Leave", from: 5, to: 6, days: 2, status: "pending", reason: "Family function" },
    { type: "Sick Leave", from: 10, to: 12, days: 3, status: "pending", reason: "Fever and cold" },
    { type: "Earned Leave", from: 20, to: 25, days: 6, status: "pending", reason: "Vacation trip" },
    { type: "Casual Leave", from: 15, to: 15, days: 1, status: "pending", reason: "Personal work" },
  ];
  for (let i = 0; i < Math.min(leaveScenarios.length, profileList.length); i++) {
    const wfStart = Date.now();
    const scenario = leaveScenarios[i];
    const profile = profileList[i];
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() + scenario.from);
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + scenario.to);
    try {
      const { error } = await client.from("leave_requests").insert({
        user_id: profile.id, profile_id: profile.id,
        organization_id: orgId,
        leave_type: scenario.type,
        from_date: fromDate.toISOString().split("T")[0],
        to_date: toDate.toISOString().split("T")[0],
        days: scenario.days,
        reason: scenario.reason,
        status: scenario.status,
      });
      results.push({
        workflow: `Leave: ${scenario.type} for ${profile.full_name ?? "Employee"}`,
        module: "Leave", status: error ? "failed" : "passed",
        detail: error?.message ?? `${scenario.days} day(s) — ${scenario.reason}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Leave request #${i + 1}`, module: "Leave", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== PAYROLL WORKFLOWS =====

  // WF8: Create payroll run + payroll records
  if (profileList.length > 0) {
    const wfStart = Date.now();
    const payPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    try {
      const { data: payrollRun, error: runErr } = await client.from("payroll_runs").insert({
        organization_id: orgId, pay_period: payPeriod,
        generated_by: userId, status: "draft",
        employee_count: Math.min(profileList.length, 5),
        total_gross: 0, total_deductions: 0, total_net: 0,
      }).select("id").single();

      if (runErr) throw runErr;

      let totalGross = 0, totalDeductions = 0, totalNet = 0;
      const salaryBands = [50000, 65000, 80000, 45000, 95000];

      for (let i = 0; i < Math.min(5, profileList.length); i++) {
        const profile = profileList[i];
        const basic = salaryBands[i % salaryBands.length];
        const hra = Math.round(basic * 0.4);
        const transport = 1600;
        const otherAllowances = Math.round(basic * 0.15);
        const grossPay = basic + hra + transport + otherAllowances;
        const pf = Math.round(basic * 0.12);
        const tax = Math.round(grossPay * 0.1);
        const otherDeductions = 500;
        const netPay = grossPay - pf - tax - otherDeductions;

        const { error: recErr } = await client.from("payroll_records").insert({
          user_id: profile.id, profile_id: profile.id,
          organization_id: orgId, pay_period: payPeriod,
          basic_salary: basic, hra, transport_allowance: transport,
          other_allowances: otherAllowances,
          pf_deduction: pf, tax_deduction: tax, other_deductions: otherDeductions,
          net_pay: netPay, working_days: 22, paid_days: 22,
          lop_days: 0, lop_deduction: 0, status: "draft",
        });

        if (!recErr) {
          totalGross += grossPay;
          totalDeductions += pf + tax + otherDeductions;
          totalNet += netPay;
        }

        results.push({
          workflow: `Payslip: ${profile.full_name ?? "Employee"} (${payPeriod})`,
          module: "Payroll", status: recErr ? "failed" : "passed",
          detail: recErr?.message ?? `Gross ₹${grossPay.toLocaleString()} → Net ₹${netPay.toLocaleString()}`,
          duration_ms: Date.now() - wfStart,
        });
      }

      // Update run totals
      await client.from("payroll_runs").update({
        total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet,
        employee_count: Math.min(5, profileList.length),
      }).eq("id", payrollRun.id);

      results.push({
        workflow: `Payroll Run: ${payPeriod}`,
        module: "Payroll", status: "passed",
        detail: `Run created — Gross ₹${totalGross.toLocaleString()}, Net ₹${totalNet.toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Payroll run ${payPeriod}`, module: "Payroll", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== REIMBURSEMENT WORKFLOWS =====

  // WF9: Create reimbursement requests
  const reimbCategories = ["Travel", "Medical", "Internet", "Books & Learning"];
  for (let i = 0; i < Math.min(reimbCategories.length, profileList.length); i++) {
    const wfStart = Date.now();
    const profile = profileList[i];
    const amount = Math.round(1000 + Math.random() * 15000);
    try {
      const { error } = await client.from("reimbursement_requests").insert({
        user_id: profile.id, profile_id: profile.id,
        organization_id: orgId,
        amount,
        category: reimbCategories[i],
        description: `Simulation reimbursement - ${reimbCategories[i]}`,
        expense_date: new Date(today.getTime() - Math.random() * 30 * 86400000).toISOString().split("T")[0],
        status: "submitted",
        submitted_at: new Date().toISOString(),
      });
      results.push({
        workflow: `Reimbursement: ${reimbCategories[i]} by ${profile.full_name ?? "Employee"}`,
        module: "Reimbursement", status: error ? "failed" : "passed",
        detail: error?.message ?? `₹${amount.toLocaleString()} submitted`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Reimbursement #${i + 1}`, module: "Reimbursement", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== GOAL/PERFORMANCE WORKFLOWS =====

  // WF10: Create goal plans
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < Math.min(3, profileList.length); i++) {
    const wfStart = Date.now();
    const profile = profileList[i];
    const goalItems = [
      { title: "Complete project milestones", target: "3 milestones", weightage: 40 },
      { title: "Client satisfaction score", target: "4.5/5", weightage: 30 },
      { title: "Documentation & knowledge sharing", target: "2 sessions", weightage: 30 },
    ];
    try {
      const { error } = await client.from("goal_plans").insert({
        user_id: profile.id, profile_id: profile.id,
        organization_id: orgId,
        month: currentMonth,
        items: goalItems,
        status: "submitted",
      });
      results.push({
        workflow: `Goal Plan: ${profile.full_name ?? "Employee"} (${currentMonth})`,
        module: "Performance", status: error ? "failed" : "passed",
        detail: error?.message ?? `3 goals, total weightage 100%`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Goal plan #${i + 1}`, module: "Performance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== MEMO WORKFLOWS =====

  // WF11: Create memos
  const memoScenarios = [
    { title: "Q4 Review Schedule", dept: "HR", priority: "high", status: "pending_approval" },
    { title: "Office Renovation Update", dept: "Admin", priority: "medium", status: "draft" },
    { title: "New Client Onboarding SOP", dept: "Operations", priority: "high", status: "pending_approval" },
  ];
  for (const memo of memoScenarios) {
    const wfStart = Date.now();
    try {
      const { error } = await client.from("memos").insert({
        title: memo.title,
        content: `This is a simulation memo for ${memo.title}. It covers key updates and action items for the team.`,
        author_name: "Simulation Engine",
        department: memo.dept,
        priority: memo.priority,
        status: memo.status,
        organization_id: orgId,
        user_id: userId,
      });
      results.push({
        workflow: `Memo: ${memo.title}`,
        module: "Performance", status: error ? "failed" : "passed",
        detail: error?.message ?? `${memo.dept} — ${memo.priority} priority — ${memo.status}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Memo: ${memo.title}`, module: "Performance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;

  // Module breakdown
  const modules = [...new Set(results.map(r => r.module))];
  const moduleBreakdown = modules.map(m => ({
    module: m,
    total: results.filter(r => r.module === m).length,
    passed: results.filter(r => r.module === m && r.status === "passed").length,
    failed: results.filter(r => r.module === m && r.status === "failed").length,
  }));

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
    module_breakdown: moduleBreakdown,
    workflow_details: results,
    execution_time_ms: Date.now() - startTime,
  };
}

// ========== STRESS TEST ==========
async function runStressTest(client: any, orgId: string, userId: string, runId?: string) {
  const startTime = Date.now();
  const concurrentUsers = 20;
  const results: Array<{ user: number; workflow: string; module: string; status: string; duration_ms: number; detail: string }> = [];

  // Get profiles for HR stress tests
  const { data: profiles } = await client.from("profiles")
    .select("id").eq("organization_id", orgId).limit(5);
  const profileIds = (profiles ?? []).map((p: any) => p.id);

  const tasks = Array.from({ length: concurrentUsers }, (_, userIdx) => {
    return (async () => {
      const wfStart = Date.now();
      const ops = ["invoice", "expense", "journal", "bill", "attendance", "leave", "payroll_record", "reimbursement"];
      const op = ops[userIdx % ops.length];
      const profileId = profileIds[userIdx % profileIds.length] || userId;

      try {
        switch (op) {
          case "invoice": {
            const { error } = await client.from("invoices").insert({
              invoice_number: `STRESS-${userIdx}-${Date.now()}`,
              client_name: `Stress Customer ${userIdx}`,
              client_email: `stress${userIdx}@sandbox.sim`,
              organization_id: orgId, user_id: userId,
              amount: 10000, total_amount: 11800,
              status: "draft", invoice_date: new Date().toISOString().split("T")[0],
              due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Finance", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "expense": {
            const { error } = await client.from("expenses").insert({
              description: `Stress expense user ${userIdx}`, amount: 5000 + userIdx * 100,
              category: "Stress Test", organization_id: orgId, user_id: userId,
              status: "pending", expense_date: new Date().toISOString().split("T")[0],
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Finance", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "journal": {
            const { data: accounts } = await client.from("gl_accounts")
              .select("id").eq("organization_id", orgId).limit(2);
            if (accounts && accounts.length >= 2) {
              const { data: je, error: jeErr } = await client.from("journal_entries").insert({
                document_sequence_number: `STRESS-JE-${userIdx}-${Date.now()}`,
                organization_id: orgId, created_by: userId,
                entry_date: new Date().toISOString().split("T")[0],
                memo: `Stress test journal ${userIdx}`, status: "draft",
                source_type: "sandbox_simulation",
              }).select("id").single();
              if (jeErr) throw jeErr;
              await client.from("journal_lines").insert([
                { journal_entry_id: je.id, gl_account_id: accounts[0].id, debit: 10000, credit: 0 },
                { journal_entry_id: je.id, gl_account_id: accounts[1].id, debit: 0, credit: 10000 },
              ]);
            }
            return { user: userIdx, workflow: op, module: "Finance", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "bill": {
            const { error } = await client.from("bills").insert({
              bill_number: `STRESS-BILL-${userIdx}-${Date.now()}`,
              vendor_name: `Stress Vendor ${userIdx}`,
              organization_id: orgId, user_id: userId,
              amount: 8000, tax_amount: 1440, total_amount: 9440,
              status: "draft", bill_date: new Date().toISOString().split("T")[0],
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Finance", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "attendance": {
            const dateStr = new Date(Date.now() - (userIdx + 1) * 86400000).toISOString().split("T")[0];
            const { error } = await client.from("attendance_records").insert({
              user_id: profileId, profile_id: profileId,
              organization_id: orgId, date: dateStr,
              check_in: `${dateStr}T09:00:00`, check_out: `${dateStr}T18:00:00`,
              status: "present",
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Attendance", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "leave": {
            const fromDate = new Date(Date.now() + (userIdx + 30) * 86400000).toISOString().split("T")[0];
            const toDate = new Date(Date.now() + (userIdx + 31) * 86400000).toISOString().split("T")[0];
            const { error } = await client.from("leave_requests").insert({
              user_id: profileId, profile_id: profileId,
              organization_id: orgId, leave_type: "Casual Leave",
              from_date: fromDate, to_date: toDate, days: 2,
              reason: `Stress test leave ${userIdx}`, status: "pending",
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Leave", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "payroll_record": {
            const payPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
            const { error } = await client.from("payroll_records").insert({
              user_id: profileId, profile_id: profileId,
              organization_id: orgId, pay_period: payPeriod,
              basic_salary: 50000, hra: 20000, transport_allowance: 1600,
              other_allowances: 7500, pf_deduction: 6000, tax_deduction: 7910,
              other_deductions: 500, net_pay: 64690,
              working_days: 22, paid_days: 22, lop_days: 0, lop_deduction: 0,
              status: "draft",
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Payroll", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "reimbursement": {
            const { error } = await client.from("reimbursement_requests").insert({
              user_id: profileId, profile_id: profileId,
              organization_id: orgId, amount: 2000 + userIdx * 500,
              category: "Travel", description: `Stress reimbursement ${userIdx}`,
              expense_date: new Date().toISOString().split("T")[0],
              status: "submitted", submitted_at: new Date().toISOString(),
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Reimbursement", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          default:
            return { user: userIdx, workflow: op, module: "Unknown", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
        }
      } catch (e) {
        return { user: userIdx, workflow: op, module: op, status: "failed", duration_ms: Date.now() - wfStart, detail: (e as Error).message };
      }
    })();
  });

  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(s.value);
    else results.push({ user: -1, workflow: "unknown", module: "Unknown", status: "failed", duration_ms: 0, detail: s.reason?.message ?? "Unknown error" });
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
  const results: Array<{ test: string; module: string; status: string; detail: string }> = [];

  // Get a profile for HR chaos tests
  const { data: profiles } = await client.from("profiles")
    .select("id").eq("organization_id", orgId).limit(1);
  const testProfileId = profiles?.[0]?.id ?? userId;

  // === FINANCE CHAOS ===

  // Chaos 1: Duplicate invoice submissions
  const dupInvNum = `CHAOS-DUP-${Date.now()}`;
  for (let i = 0; i < 3; i++) {
    const { error } = await client.from("invoices").insert({
      invoice_number: dupInvNum, client_name: "Chaos Test Customer",
      client_email: "chaos@sandbox.sim",
      organization_id: orgId, user_id: userId,
      amount: 10000, total_amount: 11800,
      status: "draft", invoice_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    });
    if (i === 0) {
      results.push({ test: "Duplicate invoice - first insert", module: "Finance", status: error ? "anomaly" : "passed", detail: error?.message ?? "First insert succeeded" });
    } else {
      results.push({
        test: `Duplicate invoice - attempt ${i + 1}`, module: "Finance",
        status: error ? "blocked" : "anomaly",
        detail: error ? `Correctly blocked: ${error.message}` : "WARNING: Duplicate accepted — missing unique constraint",
      });
    }
  }

  // Chaos 2: Negative amounts
  const { error: negErr } = await client.from("expenses").insert({
    description: "Chaos: negative amount", amount: -5000,
    category: "Chaos Test", organization_id: orgId, user_id: userId,
    status: "pending", expense_date: new Date().toISOString().split("T")[0],
  });
  results.push({
    test: "Negative expense amount", module: "Finance",
    status: negErr ? "blocked" : "anomaly",
    detail: negErr ? `Correctly blocked: ${negErr.message}` : "WARNING: Negative amount accepted",
  });

  // Chaos 3: Imbalanced journal entry
  const { data: accounts } = await client.from("gl_accounts")
    .select("id").eq("organization_id", orgId).limit(2);
  if (accounts && accounts.length >= 2) {
    const { data: je } = await client.from("journal_entries").insert({
      document_sequence_number: `CHAOS-IMBAL-${Date.now()}`,
      organization_id: orgId, created_by: userId,
      entry_date: new Date().toISOString().split("T")[0],
      memo: "Chaos: imbalanced journal", status: "draft",
      source_type: "sandbox_simulation",
    }).select("id").single();
    if (je) {
      await client.from("journal_lines").insert([
        { journal_entry_id: je.id, gl_account_id: accounts[0].id, debit: 10000, credit: 0 },
        { journal_entry_id: je.id, gl_account_id: accounts[1].id, debit: 0, credit: 5000 },
      ]);
      results.push({
        test: "Imbalanced journal entry", module: "Finance",
        status: "anomaly",
        detail: "WARNING: Imbalanced journal accepted (debit=10000, credit=5000) — needs validation trigger",
      });
    }
  }

  // === HR/LEAVE CHAOS ===

  // Chaos 4: Overlapping leave requests
  const futureDate = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
  const futureDateEnd = new Date(Date.now() + 62 * 86400000).toISOString().split("T")[0];
  for (let i = 0; i < 2; i++) {
    const { error } = await client.from("leave_requests").insert({
      user_id: testProfileId, profile_id: testProfileId,
      organization_id: orgId, leave_type: "Casual Leave",
      from_date: futureDate, to_date: futureDateEnd, days: 3,
      reason: `Chaos overlap test #${i + 1}`, status: "pending",
    });
    if (i === 0) {
      results.push({ test: "Overlapping leave - first request", module: "Leave", status: error ? "anomaly" : "passed", detail: error?.message ?? "First request succeeded" });
    } else {
      results.push({
        test: "Overlapping leave - duplicate dates", module: "Leave",
        status: error ? "blocked" : "anomaly",
        detail: error ? `Correctly blocked: ${error.message}` : "WARNING: Overlapping leave accepted",
      });
    }
  }

  // Chaos 5: Negative leave days
  const { error: negLeaveErr } = await client.from("leave_requests").insert({
    user_id: testProfileId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "Sick Leave",
    from_date: futureDate, to_date: futureDate, days: -5,
    reason: "Chaos: negative days", status: "pending",
  });
  results.push({
    test: "Negative leave days", module: "Leave",
    status: negLeaveErr ? "blocked" : "anomaly",
    detail: negLeaveErr ? `Correctly blocked: ${negLeaveErr.message}` : "WARNING: Negative leave days accepted",
  });

  // === PAYROLL CHAOS ===

  // Chaos 6: Negative salary payroll record
  const { error: negPayErr } = await client.from("payroll_records").insert({
    user_id: testProfileId, profile_id: testProfileId,
    organization_id: orgId, pay_period: "2026-01",
    basic_salary: -50000, hra: 0, transport_allowance: 0,
    other_allowances: 0, pf_deduction: 0, tax_deduction: 0,
    other_deductions: 0, net_pay: -50000,
    working_days: 22, paid_days: 22, lop_days: 0, lop_deduction: 0,
    status: "draft",
  });
  results.push({
    test: "Negative salary payroll record", module: "Payroll",
    status: negPayErr ? "blocked" : "anomaly",
    detail: negPayErr ? `Correctly blocked: ${negPayErr.message}` : "WARNING: Negative salary accepted",
  });

  // === REIMBURSEMENT CHAOS ===

  // Chaos 7: Zero-amount reimbursement
  const { error: zeroReimbErr } = await client.from("reimbursement_requests").insert({
    user_id: testProfileId, profile_id: testProfileId,
    organization_id: orgId, amount: 0,
    category: "Chaos", description: "Chaos: zero amount",
    expense_date: new Date().toISOString().split("T")[0],
    status: "submitted", submitted_at: new Date().toISOString(),
  });
  results.push({
    test: "Zero-amount reimbursement", module: "Reimbursement",
    status: zeroReimbErr ? "blocked" : "anomaly",
    detail: zeroReimbErr ? `Correctly blocked: ${zeroReimbErr.message}` : "WARNING: Zero-amount reimbursement accepted",
  });

  // === RAPID-FIRE CROSS-MODULE ===

  // Chaos 8: Rapid-fire operations across modules
  const rapidTasks = Array.from({ length: 10 }, (_, i) =>
    client.from("financial_records").insert({
      type: "expense", amount: 100 + i, description: `Rapid-fire #${i}`,
      category: "chaos", organization_id: orgId, user_id: userId,
      record_date: new Date().toISOString().split("T")[0],
    })
  );
  const rapidResults = await Promise.allSettled(rapidTasks);
  const rapidPassed = rapidResults.filter(r => r.status === "fulfilled" && !(r.value as any).error).length;
  results.push({
    test: "Rapid-fire 10 financial operations", module: "Finance",
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

// ========== VALIDATION ==========
async function runAccountingValidation(client: any, orgId: string, userId: string, runId?: string) {
  const startTime = Date.now();
  const checks: Array<{ check: string; module: string; status: string; detail: string }> = [];

  // === FINANCE VALIDATIONS ===

  // V1: Debits = Credits (Trial Balance)
  const { data: balanceData } = await client.rpc("run_financial_verification", { _org_id: orgId });
  if (balanceData && Array.isArray(balanceData)) {
    for (const check of balanceData) {
      if (check.id === "SUMMARY") continue;
      checks.push({
        check: check.id, module: "Finance",
        status: check.status === "PASS" ? "passed" : check.status === "WARNING" ? "warning" : "failed",
        detail: check.message,
      });
    }
  } else {
    checks.push({ check: "V_VERIFICATION_ENGINE", module: "Finance", status: "failed", detail: "Could not run verification engine" });
  }

  // V2: Depreciation coverage
  const { count: activeAssets } = await client.from("assets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId).eq("status", "active");
  const { count: depEntries } = await client.from("asset_depreciation_entries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_DEPRECIATION_COVERAGE", module: "Finance",
    status: (activeAssets ?? 0) > 0 && (depEntries ?? 0) === 0 ? "warning" : "passed",
    detail: `${activeAssets ?? 0} active assets, ${depEntries ?? 0} depreciation entries`,
  });

  // V3: Audit log coverage
  const { count: auditCount } = await client.from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_AUDIT_COVERAGE", module: "Finance",
    status: (auditCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${auditCount ?? 0} audit log entries for sandbox org`,
  });

  // === HR VALIDATIONS ===

  // V4: All profiles have required fields
  const { data: incompleteProfiles } = await client.from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", orgId)
    .or("full_name.is.null,email.is.null");
  checks.push({
    check: "V_PROFILE_COMPLETENESS", module: "HR",
    status: (incompleteProfiles ?? []).length === 0 ? "passed" : "warning",
    detail: `${(incompleteProfiles ?? []).length} profiles missing name or email`,
  });

  // === ATTENDANCE VALIDATIONS ===

  // V5: No duplicate attendance records (same user, same date)
  const { data: attendanceRecords } = await client.from("attendance_records")
    .select("user_id, date")
    .eq("organization_id", orgId);
  const attendanceKeys = new Set<string>();
  let dupAttendance = 0;
  for (const rec of (attendanceRecords ?? [])) {
    const key = `${rec.user_id}-${rec.date}`;
    if (attendanceKeys.has(key)) dupAttendance++;
    attendanceKeys.add(key);
  }
  checks.push({
    check: "V_ATTENDANCE_NO_DUPLICATES", module: "Attendance",
    status: dupAttendance === 0 ? "passed" : "warning",
    detail: dupAttendance === 0 ? "No duplicate attendance entries" : `${dupAttendance} duplicate attendance entries found`,
  });

  // === LEAVE VALIDATIONS ===

  // V6: All approved leaves have a reviewer
  const { data: badLeaves } = await client.from("leave_requests")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "approved")
    .is("reviewed_by", null);
  checks.push({
    check: "V_LEAVE_APPROVAL_INTEGRITY", module: "Leave",
    status: (badLeaves ?? []).length === 0 ? "passed" : "failed",
    detail: (badLeaves ?? []).length === 0
      ? "All approved leaves have a reviewer"
      : `${(badLeaves ?? []).length} approved leaves without reviewer`,
  });

  // === PAYROLL VALIDATIONS ===

  // V7: No superseded records without superseded_by link
  const { data: brokenSuperseded } = await client.from("payroll_records")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_superseded", true)
    .is("superseded_by", null);
  checks.push({
    check: "V_PAYROLL_SUPERSEDE_CHAIN", module: "Payroll",
    status: (brokenSuperseded ?? []).length === 0 ? "passed" : "warning",
    detail: (brokenSuperseded ?? []).length === 0
      ? "All superseded records have valid chain"
      : `${(brokenSuperseded ?? []).length} broken supersede chains`,
  });

  // V8: Payroll net_pay = basic + hra + transport + other_allowances - pf - tax - other_deductions - lop
  const { data: payrollRecords } = await client.from("payroll_records")
    .select("id, basic_salary, hra, transport_allowance, other_allowances, pf_deduction, tax_deduction, other_deductions, lop_deduction, net_pay")
    .eq("organization_id", orgId)
    .eq("is_superseded", false)
    .limit(100);
  let payrollMismatches = 0;
  for (const pr of (payrollRecords ?? [])) {
    const expected = pr.basic_salary + pr.hra + pr.transport_allowance + pr.other_allowances
      - pr.pf_deduction - pr.tax_deduction - pr.other_deductions - pr.lop_deduction;
    if (Math.abs(expected - pr.net_pay) > 0.01) payrollMismatches++;
  }
  checks.push({
    check: "V_PAYROLL_NET_PAY_CALC", module: "Payroll",
    status: payrollMismatches === 0 ? "passed" : "failed",
    detail: payrollMismatches === 0
      ? `All ${(payrollRecords ?? []).length} payroll records have correct net pay`
      : `${payrollMismatches} records with incorrect net pay calculation`,
  });

  // === REIMBURSEMENT VALIDATIONS ===

  // V9: No paid reimbursements without finance review
  const { data: badReimb } = await client.from("reimbursement_requests")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "paid")
    .is("finance_reviewed_by", null);
  checks.push({
    check: "V_REIMBURSEMENT_WORKFLOW", module: "Reimbursement",
    status: (badReimb ?? []).length === 0 ? "passed" : "warning",
    detail: (badReimb ?? []).length === 0
      ? "All paid reimbursements have finance review"
      : `${(badReimb ?? []).length} paid reimbursements without finance review`,
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

  const { data: run, error: runErr } = await client.from("simulation_runs").insert({
    sandbox_org_id: orgId, run_type: "full", status: "running",
    initiated_by: userId, started_at: new Date().toISOString(),
  }).select("id").single();
  if (runErr) throw runErr;
  const runId = run.id;

  try {
    // Phase 1: Reset & Seed
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

    // Phase 5: Validation
    const validationResult = await runAccountingValidation(client, orgId, userId, runId);

    const totalTime = Date.now() - fullStart;

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
        module_breakdown: workflowResult.module_breakdown ?? [],
      },
    };

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
  const moduleRows = (s.module_breakdown ?? []).map((m: any) =>
    `<tr><td>${m.module}</td><td>${m.total}</td><td class="pass">${m.passed}</td><td class="${m.failed > 0 ? 'fail' : ''}">${m.failed}</td></tr>`
  ).join('');

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
  .badge-module { background: #e0e7ff; color: #3730a3; margin-right: 4px; }
  .timestamp { color: #94a3b8; font-size: 13px; }
</style></head><body>
<h1>🔬 Full System Simulation Report</h1>
<p class="timestamp">Generated: ${report.timestamp} | Duration: ${(report.total_execution_time_ms / 1000).toFixed(1)}s</p>
<div>
  <div class="metric"><div class="value">${s.total_records_created}</div><div class="label">Records Created</div></div>
  <div class="metric"><div class="value">${s.total_workflows}</div><div class="label">Workflows Run</div></div>
  <div class="metric"><div class="value ${s.total_errors > 0 ? 'fail' : 'pass'}">${s.total_errors}</div><div class="label">Errors</div></div>
  <div class="metric"><div class="value">${s.concurrent_users_tested}</div><div class="label">Concurrent Users</div></div>
  <div class="metric"><div class="value ${s.validation_passed ? 'pass' : 'fail'}">${s.validation_passed ? '✓' : '✗'}</div><div class="label">Integrity</div></div>
</div>
${moduleRows ? `<h2>Module Breakdown</h2>
<table><tr><th>Module</th><th>Total</th><th>Passed</th><th>Failed</th></tr>${moduleRows}</table>` : ''}
<h2>Seed Data</h2>
<table><tr>${Object.keys(report.phases.seed.seed_summary ?? {}).map((k: string) => `<th>${k}</th>`).join('')}</tr>
<tr>${Object.values(report.phases.seed.seed_summary ?? {}).map((v: any) => `<td>${v}</td>`).join('')}</tr></table>
<h2>Workflow Results</h2>
<table><tr><th>Module</th><th>Workflow</th><th>Status</th><th>Detail</th><th>Duration</th></tr>
${(report.phases.workflows.workflow_details ?? []).map((w: any) =>
  `<tr><td><span class="badge badge-module">${w.module ?? 'Finance'}</span></td><td>${w.workflow}</td><td><span class="badge badge-${w.status === 'passed' ? 'pass' : 'fail'}">${w.status}</span></td><td>${w.detail}</td><td>${w.duration_ms}ms</td></tr>`
).join('')}</table>
<h2>Stress Test</h2>
<p>${report.phases.stress_test.passed ?? 0} passed / ${report.phases.stress_test.failed ?? 0} failed across ${report.phases.stress_test.concurrent_users ?? 0} concurrent users. Avg: ${report.phases.stress_test.avg_duration_ms ?? 0}ms</p>
<h2>Chaos Test</h2>
<table><tr><th>Module</th><th>Test</th><th>Status</th><th>Detail</th></tr>
${(report.phases.chaos_test.details ?? []).map((c: any) =>
  `<tr><td><span class="badge badge-module">${c.module ?? 'Finance'}</span></td><td>${c.test}</td><td><span class="badge badge-${c.status === 'passed' || c.status === 'blocked' ? 'pass' : c.status === 'anomaly' ? 'fail' : 'warn'}">${c.status}</span></td><td>${c.detail}</td></tr>`
).join('')}</table>
<h2>System Validation</h2>
<table><tr><th>Module</th><th>Check</th><th>Status</th><th>Detail</th></tr>
${(report.phases.validation.details ?? []).map((v: any) =>
  `<tr><td><span class="badge badge-module">${v.module ?? 'Finance'}</span></td><td>${v.check}</td><td><span class="badge badge-${v.status === 'passed' ? 'pass' : v.status === 'warning' ? 'warn' : 'fail'}">${v.status}</span></td><td>${v.detail}</td></tr>`
).join('')}</table>
</body></html>`;
}
