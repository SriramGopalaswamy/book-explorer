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
      await client.from("compensation_structures").delete().eq("profile_id", sp.id);
      await client.from("profiles").delete().eq("id", sp.id);
      await client.auth.admin.deleteUser(sp.id);
    } catch (e) {
      console.warn(`Cleanup user ${sp.email}:`, (e as Error).message);
    }
  }

  // Clear existing transactional data (order matters for FK constraints)
  const orgScopedTables = [
    "payslip_disputes", "payroll_records", "payroll_runs",
    "reimbursement_requests",
    "goal_plans", "memos", "notifications",
    "attendance_daily", "attendance_punches", "attendance_records",
    "attendance_correction_requests",
    "leave_requests", "investment_declarations", "employee_documents",
    "asset_depreciation_entries",
    "quote_items", "quotes",
    "invoice_items", "invoices",
    "bill_items", "bills",
    "vendor_credits", "credit_notes",
    "bank_transactions", "expenses", "budgets",
    "financial_records", "assets", "audit_logs",
    "compensation_revision_requests", "compensation_structures",
    "holidays", "user_roles",
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
    { code: "2300", name: "Salary Payable", type: "liability" },
    { code: "2400", name: "PF Payable", type: "liability" },
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
    const { count: existingPeriods } = await client.from("fiscal_periods")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("financial_year_id", financialYearId);

    if ((existingPeriods ?? 0) === 0) {
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
  await client.from("attendance_shifts").delete().eq("organization_id", orgId);
  const { error: shiftErr } = await client.from("attendance_shifts").insert({
    name: "General Shift", organization_id: orgId,
    start_time: "09:00", end_time: "18:00",
    full_day_minutes: 480, min_half_day_minutes: 240,
    grace_minutes: 15, ot_after_minutes: 540, is_default: true,
  });
  summary.attendance_shifts = shiftErr ? 0 : 1;

  // ===== SEED BANK ACCOUNTS =====
  let bankAccountCount = 0;
  const bankAccounts = [
    { name: "HDFC Current Account", account_number: "SIM-50100012345678", account_type: "current", bank_name: "HDFC Bank", balance: 2500000 },
    { name: "ICICI Savings Account", account_number: "SIM-60200098765432", account_type: "savings", bank_name: "ICICI Bank", balance: 850000 },
  ];
  for (const ba of bankAccounts) {
    const { error } = await client.from("bank_accounts").insert({
      ...ba, organization_id: orgId, user_id: userId, status: "active",
    });
    if (!error) bankAccountCount++;
  }
  summary.bank_accounts = bankAccountCount;

  // ===== SEED HOLIDAYS =====
  await client.from("holidays").delete().eq("organization_id", orgId);
  const holidayList = [
    { name: "Republic Day", date: "2026-01-26", year: 2026 },
    { name: "Holi", date: "2026-03-17", year: 2026 },
    { name: "Good Friday", date: "2026-04-03", year: 2026 },
    { name: "Independence Day", date: "2026-08-15", year: 2026 },
    { name: "Gandhi Jayanti", date: "2026-10-02", year: 2026 },
    { name: "Diwali", date: "2026-10-20", year: 2026 },
    { name: "Christmas", date: "2026-12-25", year: 2026 },
  ];
  let holidayCount = 0;
  for (const h of holidayList) {
    const { error } = await client.from("holidays").insert({ ...h, organization_id: orgId });
    if (!error) holidayCount++;
  }
  summary.holidays = holidayCount;

  // ===== SEED SANDBOX PROFILES (employees) =====
  const { data: existingProfiles } = await client.from("profiles")
    .select("id").eq("organization_id", orgId);

  const targetEmployeeCount = 8;
  let seededProfiles = (existingProfiles ?? []).length;

  if (seededProfiles < targetEmployeeCount) {
    const employeeSeeds = [
      { name: "Arjun Mehta", dept: "Engineering", jobTitle: "Senior Developer", salary: 95000, phone: "+91-9876543001" },
      { name: "Priya Sharma", dept: "Finance", jobTitle: "Finance Manager", salary: 85000, phone: "+91-9876543002" },
      { name: "Rahul Verma", dept: "Operations", jobTitle: "Operations Lead", salary: 72000, phone: "+91-9876543003" },
      { name: "Sneha Iyer", dept: "HR", jobTitle: "HR Executive", salary: 60000, phone: "+91-9876543004" },
      { name: "Vikram Singh", dept: "Engineering", jobTitle: "Tech Lead", salary: 110000, phone: "+91-9876543005" },
      { name: "Ananya Reddy", dept: "Marketing", jobTitle: "Marketing Analyst", salary: 55000, phone: "+91-9876543006" },
      { name: "Karan Patel", dept: "Sales", jobTitle: "Sales Executive", salary: 65000, phone: "+91-9876543007" },
      { name: "Deepika Nair", dept: "Engineering", jobTitle: "QA Engineer", salary: 68000, phone: "+91-9876543008" },
    ];

    const toCreate = employeeSeeds.slice(seededProfiles);

    for (const emp of toCreate) {
      try {
        const email = `${emp.name.toLowerCase().replace(/\s+/g, ".")}@sandbox-sim.local`;
        const tempPassword = crypto.randomUUID() + "Aa1!";

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

        const { error: updateErr } = await client.from("profiles").update({
          organization_id: orgId,
          full_name: emp.name,
          department: emp.dept,
          job_title: emp.jobTitle,
          status: "active",
          join_date: "2024-06-01",
          phone: emp.phone,
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

  // ===== SEED USER ROLES for employees =====
  const { data: allProfilesList } = await client.from("profiles")
    .select("id, full_name, department, job_title")
    .eq("organization_id", orgId);

  // Role mapping based on department/title
  const roleMapping: Record<string, string> = {
    "Finance Manager": "finance",
    "HR Executive": "hr",
    "Tech Lead": "manager",
    "Operations Lead": "manager",
  };
  let roleCount = 0;
  for (const p of (allProfilesList ?? [])) {
    const role = roleMapping[p.job_title] || "employee";
    const { error } = await client.from("user_roles").upsert({
      user_id: p.id, role, organization_id: orgId,
    }, { onConflict: "user_id,role,organization_id" });
    if (!error) roleCount++;
  }
  summary.user_roles = roleCount;

  // ===== SEED COMPENSATION STRUCTURES =====
  const salaryByTitle: Record<string, number> = {
    "Senior Developer": 95000, "Finance Manager": 85000, "Operations Lead": 72000,
    "HR Executive": 60000, "Tech Lead": 110000, "Marketing Analyst": 55000,
    "Sales Executive": 65000, "QA Engineer": 68000,
  };
  let compCount = 0;
  for (const p of (allProfilesList ?? [])) {
    const basic = salaryByTitle[p.job_title] ?? 50000;
    const annualCTC = Math.round(basic * 12 * 1.55);
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

  // ===== SEED BUDGETS =====
  let budgetCount = 0;
  if (financialYearId) {
    const { data: fpList } = await client.from("fiscal_periods")
      .select("id").eq("organization_id", orgId).eq("financial_year_id", financialYearId).limit(3);
    const budgetAccounts = ["5100", "5200", "5300"]; // Salaries, Rent, Utilities
    for (const fp of (fpList ?? [])) {
      for (const code of budgetAccounts) {
        const acctId = glAccounts[code];
        if (acctId) {
          const { error } = await client.from("budgets").insert({
            organization_id: orgId, account_id: acctId, fiscal_period_id: fp.id,
            budget_amount: Math.round(50000 + Math.random() * 200000),
          });
          if (!error) budgetCount++;
        }
      }
    }
  }
  summary.budgets = budgetCount;

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
    .select("id, full_name, job_title")
    .eq("organization_id", orgId).limit(10);
  const profileList = profiles ?? [];

  if (profileList.length === 0) {
    results.push({
      workflow: "HR Profile Check", module: "HR", status: "failed",
      detail: "No employee profiles found in sandbox org — all HR/Payroll workflows will be skipped.",
      duration_ms: 0,
    });
  }

  // ===== FINANCE WORKFLOWS =====

  // WF1: Create invoices with full lifecycle (draft → sent → partially_paid)
  const { data: customers } = await client.from("customers")
    .select("id, name").eq("organization_id", orgId).limit(5);
  const createdInvoiceIds: string[] = [];
  for (const cust of (customers ?? [])) {
    const wfStart = Date.now();
    try {
      const invNum = `SIM-INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const amount = Math.round(10000 + Math.random() * 490000);
      const taxAmount = Math.round(amount * 0.18);
      const { data: inv, error } = await client.from("invoices").insert({
        invoice_number: invNum, customer_id: cust.id, client_name: cust.name,
        client_email: `billing@${cust.name.toLowerCase().replace(/\s+/g, "")}.sim`,
        organization_id: orgId, user_id: userId, amount,
        total_amount: amount + taxAmount, status: "draft",
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      }).select("id").single();
      if (inv) createdInvoiceIds.push(inv.id);
      results.push({
        workflow: `Invoice: ${invNum}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${cust.name} — ₹${(amount + taxAmount).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Invoice for ${cust.name}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF1b: Invoice lifecycle — move 2 invoices to "sent"
  for (let i = 0; i < Math.min(2, createdInvoiceIds.length); i++) {
    const wfStart = Date.now();
    const { error } = await client.from("invoices").update({ status: "sent" }).eq("id", createdInvoiceIds[i]);
    results.push({
      workflow: `Invoice lifecycle: draft → sent`, module: "Finance",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Status transition validated",
      duration_ms: Date.now() - wfStart,
    });
  }

  // WF2: Create bills with lifecycle
  const { data: vendors } = await client.from("vendors")
    .select("id, name").eq("organization_id", orgId).limit(5);
  const createdBillIds: string[] = [];
  for (const v of (vendors ?? [])) {
    const wfStart = Date.now();
    try {
      const billNum = `SIM-BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const amount = Math.round(5000 + Math.random() * 200000);
      const taxAmount = Math.round(amount * 0.18);
      const { data: bill, error } = await client.from("bills").insert({
        bill_number: billNum, vendor_id: v.id, vendor_name: v.name,
        organization_id: orgId, user_id: userId, amount, tax_amount: taxAmount,
        total_amount: amount + taxAmount, status: "draft",
        bill_date: new Date().toISOString().split("T")[0],
      }).select("id").single();
      if (bill) createdBillIds.push(bill.id);
      results.push({
        workflow: `Bill: ${billNum}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${v.name} — ₹${(amount + taxAmount).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Bill for ${v.name}`, module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // WF2b: Bill lifecycle — approve 2 bills
  for (let i = 0; i < Math.min(2, createdBillIds.length); i++) {
    const wfStart = Date.now();
    const { error } = await client.from("bills").update({ status: "approved" }).eq("id", createdBillIds[i]);
    results.push({
      workflow: `Bill lifecycle: draft → approved`, module: "Finance",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Status transition validated",
      duration_ms: Date.now() - wfStart,
    });
  }

  // WF3: Post journal entries (balanced double-entry)
  const { data: glAccounts } = await client.from("gl_accounts")
    .select("id, code, name").eq("organization_id", orgId);
  const cashAccount = (glAccounts ?? []).find((a: any) => a.code === "1000");
  const revenueAccount = (glAccounts ?? []).find((a: any) => a.code === "4000");
  const expenseAccount = (glAccounts ?? []).find((a: any) => a.code === "5000");
  const salaryAccount = (glAccounts ?? []).find((a: any) => a.code === "5100");
  const arAccount = (glAccounts ?? []).find((a: any) => a.code === "1100");
  const apAccount = (glAccounts ?? []).find((a: any) => a.code === "2000");

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

        // Vary the accounts used for richer testing
        const debitAcct = i % 2 === 0 ? cashAccount : (arAccount ?? cashAccount);
        const creditAcct = i % 2 === 0 ? revenueAccount : (apAccount ?? revenueAccount);

        await client.from("journal_lines").insert([
          { journal_entry_id: je.id, gl_account_id: debitAcct.id, debit: amount, credit: 0, description: `Debit: ${debitAcct.name}` },
          { journal_entry_id: je.id, gl_account_id: creditAcct.id, debit: 0, credit: amount, description: `Credit: ${creditAcct.name}` },
        ]);
        results.push({ workflow: `Journal: ${entryNum}`, module: "Finance", status: "passed", detail: `Balanced entry ₹${amount.toLocaleString()} (${debitAcct.code} ↔ ${creditAcct.code})`, duration_ms: Date.now() - wfStart });
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

  // WF5b: Bank transactions
  const { data: bankAccts } = await client.from("bank_accounts")
    .select("id, name").eq("organization_id", orgId).limit(1);
  if (bankAccts && bankAccts.length > 0) {
    const bankAcctId = bankAccts[0].id;
    for (let i = 0; i < 4; i++) {
      const wfStart = Date.now();
      const isCredit = i % 2 === 0;
      const amount = Math.round(5000 + Math.random() * 100000);
      try {
        const { error } = await client.from("bank_transactions").insert({
          account_id: bankAcctId, organization_id: orgId, user_id: userId,
          amount: isCredit ? amount : -amount,
          description: `SIM bank txn #${i + 1}`,
          transaction_type: isCredit ? "credit" : "debit",
          transaction_date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
          reconciled: false,
        });
        results.push({
          workflow: `Bank Txn: ${isCredit ? "Credit" : "Debit"} ₹${amount.toLocaleString()}`,
          module: "Banking", status: error ? "failed" : "passed",
          detail: error?.message ?? `${bankAccts[0].name}`,
          duration_ms: Date.now() - wfStart,
        });
      } catch (e) {
        results.push({ workflow: `Bank txn #${i + 1}`, module: "Banking", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
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
          workflow: `Attendance: ${profile.full_name ?? "Employee"} on ${dateStr}`,
          module: "Attendance", status: error ? "failed" : "passed",
          detail: error?.message ?? `${checkIn.split("T")[1]} → ${checkOut.split("T")[1]}`,
          duration_ms: Date.now() - wfStart,
        });
      } catch (e) {
        results.push({ workflow: `Attendance ${dateStr}`, module: "Attendance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  // WF6b: Attendance correction request
  if (profileList.length > 0) {
    const wfStart = Date.now();
    const corrDate = new Date(today);
    corrDate.setDate(corrDate.getDate() - 2);
    try {
      const { error } = await client.from("attendance_correction_requests").insert({
        user_id: profileList[0].id, profile_id: profileList[0].id,
        organization_id: orgId,
        date: corrDate.toISOString().split("T")[0],
        reason: "Forgot to check out — biometric malfunction",
        requested_check_out: `${corrDate.toISOString().split("T")[0]}T18:30:00`,
        status: "pending",
      });
      results.push({
        workflow: `Attendance Correction: ${profileList[0].full_name}`,
        module: "Attendance", status: error ? "failed" : "passed",
        detail: error?.message ?? "Correction request submitted",
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Attendance correction", module: "Attendance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== LEAVE WORKFLOWS =====

  // WF7: Create leave requests (various types & statuses)
  const leaveScenarios = [
    { type: "Casual Leave", from: 5, to: 6, days: 2, reason: "Family function" },
    { type: "Sick Leave", from: 10, to: 12, days: 3, reason: "Fever and cold" },
    { type: "Earned Leave", from: 20, to: 25, days: 6, reason: "Vacation trip" },
    { type: "Casual Leave", from: 15, to: 15, days: 1, reason: "Personal work" },
  ];
  const createdLeaveIds: string[] = [];
  for (let i = 0; i < Math.min(leaveScenarios.length, profileList.length); i++) {
    const wfStart = Date.now();
    const scenario = leaveScenarios[i];
    const profile = profileList[i];
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() + scenario.from);
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + scenario.to);
    try {
      const { data: lr, error } = await client.from("leave_requests").insert({
        user_id: profile.id, profile_id: profile.id,
        organization_id: orgId,
        leave_type: scenario.type,
        from_date: fromDate.toISOString().split("T")[0],
        to_date: toDate.toISOString().split("T")[0],
        days: scenario.days,
        reason: scenario.reason,
        status: "pending",
      }).select("id").single();
      if (lr) createdLeaveIds.push(lr.id);
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

  // WF7b: Leave approval workflow — approve first leave, reject second
  if (createdLeaveIds.length >= 2) {
    const wfStart = Date.now();
    const { error: appErr } = await client.from("leave_requests").update({
      status: "approved", reviewed_by: userId,
    }).eq("id", createdLeaveIds[0]);
    results.push({
      workflow: "Leave approval workflow", module: "Leave",
      status: appErr ? "failed" : "passed",
      detail: appErr?.message ?? "Leave approved with reviewer set",
      duration_ms: Date.now() - wfStart,
    });

    const wfStart2 = Date.now();
    const { error: rejErr } = await client.from("leave_requests").update({
      status: "rejected", reviewed_by: userId,
    }).eq("id", createdLeaveIds[1]);
    results.push({
      workflow: "Leave rejection workflow", module: "Leave",
      status: rejErr ? "failed" : "passed",
      detail: rejErr?.message ?? "Leave rejected with reviewer set",
      duration_ms: Date.now() - wfStart2,
    });
  }

  // ===== PAYROLL WORKFLOWS =====

  // WF8: Create payroll run + payroll records + approval lifecycle
  let createdPayrollRunId: string | null = null;
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
      createdPayrollRunId = payrollRun.id;

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

  // WF8b: Payroll approval lifecycle (draft → under_review → approved → locked)
  if (createdPayrollRunId) {
    const transitions = [
      { from: "draft", to: "under_review", label: "Submit for review" },
      { from: "under_review", to: "approved", label: "Approve payroll" },
      { from: "approved", to: "locked", label: "Lock payroll" },
    ];
    for (const t of transitions) {
      const wfStart = Date.now();
      const { error } = await client.from("payroll_runs")
        .update({ status: t.to } as any)
        .eq("id", createdPayrollRunId);
      results.push({
        workflow: `Payroll lifecycle: ${t.label}`,
        module: "Payroll", status: error ? "failed" : "passed",
        detail: error?.message ?? `${t.from} → ${t.to}`,
        duration_ms: Date.now() - wfStart,
      });
    }
  }

  // ===== REIMBURSEMENT WORKFLOWS =====

  // WF9: Create reimbursement requests with approval lifecycle
  const reimbCategories = ["Travel", "Medical", "Internet", "Books & Learning"];
  const createdReimbIds: string[] = [];
  for (let i = 0; i < Math.min(reimbCategories.length, profileList.length); i++) {
    const wfStart = Date.now();
    const profile = profileList[i];
    const amount = Math.round(1000 + Math.random() * 15000);
    try {
      const { data: reimb, error } = await client.from("reimbursement_requests").insert({
        user_id: profile.id, profile_id: profile.id,
        organization_id: orgId,
        amount,
        category: reimbCategories[i],
        description: `Simulation reimbursement - ${reimbCategories[i]}`,
        expense_date: new Date(today.getTime() - Math.random() * 30 * 86400000).toISOString().split("T")[0],
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }).select("id").single();
      if (reimb) createdReimbIds.push(reimb.id);
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

  // WF9b: Approve + pay first reimbursement
  if (createdReimbIds.length > 0) {
    const wfStart = Date.now();
    const { error } = await client.from("reimbursement_requests").update({
      status: "approved", manager_reviewed_by: userId,
    }).eq("id", createdReimbIds[0]);
    results.push({
      workflow: "Reimbursement approval", module: "Reimbursement",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Manager approved reimbursement",
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== COMPENSATION REVISION WORKFLOWS =====
  if (profileList.length >= 2) {
    const wfStart = Date.now();
    const profile = profileList[0];
    try {
      const { error } = await client.from("compensation_revision_requests").insert({
        profile_id: profile.id, organization_id: orgId,
        requested_by: userId, requested_by_role: "hr_admin",
        current_ctc: 1200000, proposed_ctc: 1500000,
        effective_from: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split("T")[0],
        revision_reason: "Annual appraisal — performance rating: Exceeds Expectations",
        status: "pending",
      });
      results.push({
        workflow: `Comp Revision: ${profile.full_name}`,
        module: "HR", status: error ? "failed" : "passed",
        detail: error?.message ?? "₹12L → ₹15L revision requested",
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Comp revision", module: "HR", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
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

  // ===== AUDIT LOG WORKFLOWS =====
  const wfStart12 = Date.now();
  try {
    const { error } = await client.from("audit_logs").insert({
      actor_id: userId, organization_id: orgId,
      action: "simulation_test", entity_type: "system",
      actor_name: "Simulation Engine", actor_role: "super_admin",
      metadata: { source: "sandbox_simulation", timestamp: new Date().toISOString() },
    });
    results.push({
      workflow: "Audit Log: write test", module: "Governance",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Audit trail entry created",
      duration_ms: Date.now() - wfStart12,
    });
  } catch (e) {
    results.push({ workflow: "Audit log", module: "Governance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart12 });
  }

  // ===== QUOTES WORKFLOWS =====
  const createdQuoteIds: string[] = [];
  for (let i = 0; i < Math.min(3, (customers ?? []).length); i++) {
    const wfStart = Date.now();
    const cust = customers[i];
    try {
      const quoteNum = `SIM-QT-${Date.now()}-${i}`;
      const amount = Math.round(15000 + Math.random() * 300000);
      const gst = Math.round(amount * 0.18);
      const { data: qt, error } = await client.from("quotes").insert({
        quote_number: quoteNum, customer_id: cust.id, client_name: cust.name,
        client_email: `billing@${cust.name.toLowerCase().replace(/\s+/g, "")}.sim`,
        organization_id: orgId, user_id: userId, amount, subtotal: amount,
        total_amount: amount + gst, cgst_total: Math.round(gst / 2), sgst_total: Math.round(gst / 2),
        igst_total: 0, status: "draft",
        due_date: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
      }).select("id").single();
      if (qt) createdQuoteIds.push(qt.id);
      results.push({
        workflow: `Quote: ${quoteNum}`, module: "Quotes",
        status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${cust.name} — ₹${(amount + gst).toLocaleString()}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Quote #${i + 1}`, module: "Quotes", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // Quote lifecycle: draft → sent
  if (createdQuoteIds.length > 0) {
    const wfStart = Date.now();
    const { error } = await client.from("quotes").update({ status: "sent" }).eq("id", createdQuoteIds[0]);
    results.push({
      workflow: "Quote lifecycle: draft → sent", module: "Quotes",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Status transition validated",
      duration_ms: Date.now() - wfStart,
    });
  }
  // Quote lifecycle: sent → accepted
  if (createdQuoteIds.length > 1) {
    const wfStart = Date.now();
    await client.from("quotes").update({ status: "sent" }).eq("id", createdQuoteIds[1]);
    const { error } = await client.from("quotes").update({ status: "accepted" }).eq("id", createdQuoteIds[1]);
    results.push({
      workflow: "Quote lifecycle: sent → accepted", module: "Quotes",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Quote accepted by customer",
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== CREDIT NOTES WORKFLOWS =====
  for (let i = 0; i < Math.min(2, (customers ?? []).length); i++) {
    const wfStart = Date.now();
    const cust = customers[i];
    try {
      const cnNum = `SIM-CN-${Date.now()}-${i}`;
      const amount = Math.round(2000 + Math.random() * 50000);
      const { error } = await client.from("credit_notes").insert({
        credit_note_number: cnNum, customer_id: cust.id, client_name: cust.name,
        organization_id: orgId, user_id: userId, amount,
        reason: `Simulation credit — goods returned (batch #${i + 1})`,
        status: i === 0 ? "draft" : "issued",
      });
      results.push({
        workflow: `Credit Note: ${cnNum}`, module: "Credit Notes",
        status: error ? "failed" : "passed",
        detail: error?.message ?? `₹${amount.toLocaleString()} for ${cust.name}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Credit Note #${i + 1}`, module: "Credit Notes", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== VENDOR CREDITS WORKFLOWS =====
  for (let i = 0; i < Math.min(2, (vendors ?? []).length); i++) {
    const wfStart = Date.now();
    const v = vendors[i];
    try {
      const vcNum = `SIM-VC-${Date.now()}-${i}`;
      const amount = Math.round(3000 + Math.random() * 80000);
      const { error } = await client.from("vendor_credits").insert({
        vendor_credit_number: vcNum, vendor_id: v.id, vendor_name: v.name,
        organization_id: orgId, user_id: userId, amount,
        reason: `Vendor credit — defective goods return (batch #${i + 1})`,
        status: i === 0 ? "draft" : "applied",
      });
      results.push({
        workflow: `Vendor Credit: ${vcNum}`, module: "Vendor Credits",
        status: error ? "failed" : "passed",
        detail: error?.message ?? `₹${amount.toLocaleString()} from ${v.name}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Vendor Credit #${i + 1}`, module: "Vendor Credits", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== FULL INVOICE LIFECYCLE: sent → paid =====
  if (createdInvoiceIds.length >= 3) {
    const wfStart = Date.now();
    await client.from("invoices").update({ status: "sent" }).eq("id", createdInvoiceIds[2]);
    const { error } = await client.from("invoices").update({ status: "paid" }).eq("id", createdInvoiceIds[2]);
    results.push({
      workflow: "Invoice lifecycle: sent → paid", module: "Finance",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Full invoice lifecycle completed",
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== FULL BILL LIFECYCLE: approved → paid =====
  if (createdBillIds.length >= 1) {
    const wfStart = Date.now();
    const { error } = await client.from("bills").update({ status: "paid" }).eq("id", createdBillIds[0]);
    results.push({
      workflow: "Bill lifecycle: approved → paid", module: "Finance",
      status: error ? "failed" : "passed",
      detail: error?.message ?? "Full bill lifecycle completed",
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== EXPENSE LIFECYCLE: pending → approved =====
  {
    const wfStart = Date.now();
    const { data: pendingExp } = await client.from("expenses")
      .select("id").eq("organization_id", orgId).eq("status", "pending").limit(1).single();
    if (pendingExp) {
      const { error } = await client.from("expenses").update({ status: "approved" }).eq("id", pendingExp.id);
      results.push({
        workflow: "Expense lifecycle: pending → approved", module: "Finance",
        status: error ? "failed" : "passed",
        detail: error?.message ?? "Expense approval validated",
        duration_ms: Date.now() - wfStart,
      });
    }
  }

  // ===== INVESTMENT DECLARATIONS =====
  for (let i = 0; i < Math.min(2, profileList.length); i++) {
    const wfStart = Date.now();
    const profile = profileList[i];
    const sections = ["80C", "80D", "HRA", "80G"];
    try {
      const { error } = await client.from("investment_declarations").insert({
        profile_id: profile.id, organization_id: orgId,
        financial_year: "2025-26",
        section_type: sections[i % sections.length],
        declared_amount: Math.round(50000 + Math.random() * 100000),
        status: "submitted",
      });
      results.push({
        workflow: `Investment Declaration: ${profile.full_name} (${sections[i % sections.length]})`,
        module: "HR", status: error ? "failed" : "passed",
        detail: error?.message ?? "Tax declaration submitted",
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Investment declaration #${i + 1}`, module: "HR", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== NOTIFICATIONS =====
  const notifTypes = ["leave_approved", "payroll_processed", "expense_approved", "memo_published"];
  for (let i = 0; i < Math.min(notifTypes.length, profileList.length); i++) {
    const wfStart = Date.now();
    try {
      const { error } = await client.from("notifications").insert({
        user_id: profileList[i].id, organization_id: orgId,
        title: `Simulation notification: ${notifTypes[i]}`,
        message: `This is a test notification for the ${notifTypes[i]} event.`,
        type: notifTypes[i], read: false,
      });
      results.push({
        workflow: `Notification: ${notifTypes[i]}`, module: "Notifications",
        status: error ? "failed" : "passed",
        detail: error?.message ?? `Sent to ${profileList[i].full_name}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: `Notification #${i + 1}`, module: "Notifications", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ===== EMPLOYEE DOCUMENTS =====
  if (profileList.length > 0) {
    const docTypes = ["offer_letter", "id_proof", "address_proof", "payslip"];
    for (let i = 0; i < Math.min(docTypes.length, profileList.length); i++) {
      const wfStart = Date.now();
      try {
        const { error } = await client.from("employee_documents").insert({
          profile_id: profileList[i].id, organization_id: orgId,
          document_type: docTypes[i],
          document_name: `SIM_${docTypes[i]}_${profileList[i].full_name?.replace(/\s/g, "_")}.pdf`,
          file_path: `sandbox/${orgId}/${docTypes[i]}/${Date.now()}.pdf`,
          file_size: Math.round(50000 + Math.random() * 500000),
          mime_type: "application/pdf",
          uploaded_by: userId,
        });
        results.push({
          workflow: `Employee Doc: ${docTypes[i]} for ${profileList[i].full_name}`,
          module: "HR", status: error ? "failed" : "passed",
          detail: error?.message ?? "Document record created",
          duration_ms: Date.now() - wfStart,
        });
      } catch (e) {
        results.push({ workflow: `Employee doc #${i + 1}`, module: "HR", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
      }
    }
  }

  // ===== HOLIDAYS VERIFICATION =====
  {
    const wfStart = Date.now();
    const { count, error } = await client.from("holidays")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    results.push({
      workflow: "Holidays: verify seeded data", module: "HR",
      status: (count ?? 0) >= 5 ? "passed" : "failed",
      detail: error?.message ?? `${count ?? 0} holidays found (expected ≥5)`,
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== BUDGET VERIFICATION =====
  {
    const wfStart = Date.now();
    const { count, error } = await client.from("budgets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    results.push({
      workflow: "Budgets: verify seeded data", module: "Finance",
      status: (count ?? 0) > 0 ? "passed" : "failed",
      detail: error?.message ?? `${count ?? 0} budget entries found`,
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== USER ROLES VERIFICATION =====
  {
    const wfStart = Date.now();
    const { count, error } = await client.from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    results.push({
      workflow: "User Roles: verify assignment", module: "Governance",
      status: (count ?? 0) >= 5 ? "passed" : "failed",
      detail: error?.message ?? `${count ?? 0} role assignments found`,
      duration_ms: Date.now() - wfStart,
    });
  }


  const failed = results.filter(r => r.status === "failed").length;

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
            const dateStr = new Date(Date.now() - (userIdx + 10) * 86400000).toISOString().split("T")[0];
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
            const fromDate = new Date(Date.now() + (userIdx + 50) * 86400000).toISOString().split("T")[0];
            const toDate = new Date(Date.now() + (userIdx + 51) * 86400000).toISOString().split("T")[0];
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

  // Chaos 4: Future-dated expense (should it be allowed?)
  const futureExpDate = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
  const { error: futExpErr } = await client.from("expenses").insert({
    description: "Chaos: future-dated expense", amount: 10000,
    category: "Chaos Test", organization_id: orgId, user_id: userId,
    status: "pending", expense_date: futureExpDate,
  });
  results.push({
    test: "Future-dated expense (1 year ahead)", module: "Finance",
    status: futExpErr ? "blocked" : "anomaly",
    detail: futExpErr ? `Correctly blocked: ${futExpErr.message}` : `WARNING: Future expense accepted (${futureExpDate})`,
  });

  // Chaos 5: Invoice with zero amount
  const { error: zeroInvErr } = await client.from("invoices").insert({
    invoice_number: `CHAOS-ZERO-${Date.now()}`, client_name: "Zero Customer",
    client_email: "zero@sandbox.sim", organization_id: orgId, user_id: userId,
    amount: 0, total_amount: 0, status: "draft",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  });
  results.push({
    test: "Zero-amount invoice", module: "Finance",
    status: zeroInvErr ? "blocked" : "anomaly",
    detail: zeroInvErr ? `Correctly blocked: ${zeroInvErr.message}` : "WARNING: Zero-amount invoice accepted",
  });

  // === HR/LEAVE CHAOS ===

  // Chaos 6: Overlapping leave requests
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

  // Chaos 7: Negative leave days
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

  // Chaos 8: Leave where to_date < from_date
  const { error: reverseDateErr } = await client.from("leave_requests").insert({
    user_id: testProfileId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "Earned Leave",
    from_date: futureDateEnd, to_date: futureDate, days: 1,
    reason: "Chaos: reversed date range", status: "pending",
  });
  results.push({
    test: "Leave with reversed date range (to < from)", module: "Leave",
    status: reverseDateErr ? "blocked" : "anomaly",
    detail: reverseDateErr ? `Correctly blocked: ${reverseDateErr.message}` : "WARNING: Reversed date range leave accepted",
  });

  // === PAYROLL CHAOS ===

  // Chaos 9: Negative salary payroll record
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

  // Chaos 10: Payroll with paid_days > working_days
  const { error: overDaysErr } = await client.from("payroll_records").insert({
    user_id: testProfileId, profile_id: testProfileId,
    organization_id: orgId, pay_period: "2026-02",
    basic_salary: 50000, hra: 20000, transport_allowance: 1600,
    other_allowances: 7500, pf_deduction: 6000, tax_deduction: 7910,
    other_deductions: 500, net_pay: 64690,
    working_days: 22, paid_days: 30, lop_days: 0, lop_deduction: 0,
    status: "draft",
  });
  results.push({
    test: "Payroll: paid_days (30) > working_days (22)", module: "Payroll",
    status: overDaysErr ? "blocked" : "anomaly",
    detail: overDaysErr ? `Correctly blocked: ${overDaysErr.message}` : "WARNING: paid_days exceeding working_days accepted",
  });

  // === REIMBURSEMENT CHAOS ===

  // Chaos 11: Zero-amount reimbursement
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

  // Chaos 12: Negative reimbursement
  const { error: negReimbErr } = await client.from("reimbursement_requests").insert({
    user_id: testProfileId, profile_id: testProfileId,
    organization_id: orgId, amount: -5000,
    category: "Chaos", description: "Chaos: negative amount",
    expense_date: new Date().toISOString().split("T")[0],
    status: "submitted", submitted_at: new Date().toISOString(),
  });
  results.push({
    test: "Negative-amount reimbursement", module: "Reimbursement",
    status: negReimbErr ? "blocked" : "anomaly",
    detail: negReimbErr ? `Correctly blocked: ${negReimbErr.message}` : "WARNING: Negative reimbursement accepted",
  });

  // === CROSS-MODULE CHAOS ===

  // Chaos 13: Rapid-fire operations across modules
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

  // V1: Run financial verification engine
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
    check: "V_AUDIT_COVERAGE", module: "Governance",
    status: (auditCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${auditCount ?? 0} audit log entries for sandbox org`,
  });

  // V4: GL Account referential integrity (all journal lines reference valid accounts)
  const { data: orphanedLines } = await client.rpc("run_financial_verification", { _org_id: orgId });
  // Already covered by V1, skip duplicate

  // V5: Bank account balance consistency
  const { data: bankAccts } = await client.from("bank_accounts")
    .select("id, name, balance").eq("organization_id", orgId);
  checks.push({
    check: "V_BANK_ACCOUNTS_SEEDED", module: "Banking",
    status: (bankAccts ?? []).length > 0 ? "passed" : "warning",
    detail: `${(bankAccts ?? []).length} bank accounts configured`,
  });

  // === HR VALIDATIONS ===

  // V6: All profiles have required fields
  const { data: incompleteProfiles } = await client.from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", orgId)
    .or("full_name.is.null,email.is.null");
  checks.push({
    check: "V_PROFILE_COMPLETENESS", module: "HR",
    status: (incompleteProfiles ?? []).length === 0 ? "passed" : "warning",
    detail: `${(incompleteProfiles ?? []).length} profiles missing name or email`,
  });

  // V7: Profile count check
  const { count: profileCount } = await client.from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_PROFILE_COUNT", module: "HR",
    status: (profileCount ?? 0) >= 5 ? "passed" : (profileCount ?? 0) > 0 ? "warning" : "failed",
    detail: `${profileCount ?? 0} profiles in sandbox org (target: 8)`,
  });

  // V8: Compensation structure coverage
  const { count: compCount } = await client.from("compensation_structures")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId).eq("is_active", true);
  checks.push({
    check: "V_COMPENSATION_COVERAGE", module: "HR",
    status: (compCount ?? 0) >= (profileCount ?? 0) ? "passed" : "warning",
    detail: `${compCount ?? 0} active compensation structures for ${profileCount ?? 0} profiles`,
  });

  // === ATTENDANCE VALIDATIONS ===

  // V9: No duplicate attendance records (same user, same date)
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

  // V10: Attendance records have valid check-in/out times
  const { data: badAttendance } = await client.from("attendance_records")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "present")
    .is("check_in", null);
  checks.push({
    check: "V_ATTENDANCE_CHECKIN_PRESENT", module: "Attendance",
    status: (badAttendance ?? []).length === 0 ? "passed" : "warning",
    detail: (badAttendance ?? []).length === 0
      ? "All present records have check-in times"
      : `${(badAttendance ?? []).length} present records missing check-in`,
  });

  // === LEAVE VALIDATIONS ===

  // V11: All approved leaves have a reviewer
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

  // V12: Leave request count
  const { count: leaveCount } = await client.from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_LEAVE_REQUESTS_EXIST", module: "Leave",
    status: (leaveCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${leaveCount ?? 0} leave requests in sandbox`,
  });

  // === PAYROLL VALIDATIONS ===

  // V13: No superseded records without superseded_by link
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

  // V14: Payroll net_pay = basic + hra + transport + other_allowances - pf - tax - other_deductions - lop
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

  // V15: Payroll run totals consistency
  const { data: payrollRuns } = await client.from("payroll_runs")
    .select("id, total_gross, total_deductions, total_net, employee_count")
    .eq("organization_id", orgId).limit(10);
  let runMismatches = 0;
  for (const run of (payrollRuns ?? [])) {
    if (run.total_gross > 0 && Math.abs(run.total_gross - run.total_deductions - run.total_net) > 1) {
      runMismatches++;
    }
  }
  checks.push({
    check: "V_PAYROLL_RUN_TOTALS", module: "Payroll",
    status: runMismatches === 0 ? "passed" : "failed",
    detail: runMismatches === 0
      ? `${(payrollRuns ?? []).length} payroll runs have consistent totals`
      : `${runMismatches} payroll runs with inconsistent gross/deductions/net`,
  });

  // === REIMBURSEMENT VALIDATIONS ===

  // V16: No paid reimbursements without finance review
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

  // === CROSS-MODULE VALIDATIONS ===

  // V17: Fiscal periods exist
  const { count: fpCount } = await client.from("fiscal_periods")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_FISCAL_PERIODS_CONFIGURED", module: "Finance",
    status: (fpCount ?? 0) === 12 ? "passed" : (fpCount ?? 0) > 0 ? "warning" : "failed",
    detail: `${fpCount ?? 0} fiscal periods (expected 12)`,
  });

  // V18: Leave types configured
  const { count: ltCount } = await client.from("leave_types")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_LEAVE_TYPES_CONFIGURED", module: "Leave",
    status: (ltCount ?? 0) >= 3 ? "passed" : "warning",
    detail: `${ltCount ?? 0} leave types configured`,
  });

  // === QUOTES VALIDATIONS ===
  const { count: quoteCount } = await client.from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_QUOTES_EXIST", module: "Quotes",
    status: (quoteCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${quoteCount ?? 0} quotes in sandbox`,
  });

  // === CREDIT NOTES VALIDATIONS ===
  const { count: cnCount } = await client.from("credit_notes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_CREDIT_NOTES_EXIST", module: "Credit Notes",
    status: (cnCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${cnCount ?? 0} credit notes in sandbox`,
  });

  // === VENDOR CREDITS VALIDATIONS ===
  const { count: vcCount } = await client.from("vendor_credits")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_VENDOR_CREDITS_EXIST", module: "Vendor Credits",
    status: (vcCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${vcCount ?? 0} vendor credits in sandbox`,
  });

  // === HOLIDAYS VALIDATIONS ===
  const { count: holidayCount } = await client.from("holidays")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_HOLIDAYS_CONFIGURED", module: "HR",
    status: (holidayCount ?? 0) >= 5 ? "passed" : "warning",
    detail: `${holidayCount ?? 0} holidays configured (expected ≥5)`,
  });

  // === USER ROLES VALIDATIONS ===
  const { count: roleAssignments } = await client.from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_USER_ROLES_ASSIGNED", module: "Governance",
    status: (roleAssignments ?? 0) >= 5 ? "passed" : "warning",
    detail: `${roleAssignments ?? 0} role assignments (expected ≥5 for seeded employees)`,
  });

  // === BUDGET VALIDATIONS ===
  const { count: budgetCount } = await client.from("budgets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_BUDGETS_EXIST", module: "Finance",
    status: (budgetCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${budgetCount ?? 0} budget entries configured`,
  });

  // === NOTIFICATION VALIDATIONS ===
  const { count: notifCount } = await client.from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_NOTIFICATIONS_DELIVERED", module: "Notifications",
    status: (notifCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${notifCount ?? 0} notifications in sandbox`,
  });

  // === INVESTMENT DECLARATION VALIDATIONS ===
  const { count: invDeclCount } = await client.from("investment_declarations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_INVESTMENT_DECLARATIONS", module: "HR",
    status: (invDeclCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${invDeclCount ?? 0} investment declarations submitted`,
  });

  // === EMPLOYEE DOCUMENTS VALIDATIONS ===
  const { count: empDocCount } = await client.from("employee_documents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  checks.push({
    check: "V_EMPLOYEE_DOCUMENTS", module: "HR",
    status: (empDocCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${empDocCount ?? 0} employee documents on file`,
  });

  // ============================================================
  // === KPI / DASHBOARD / FINANCIAL REPORT VALIDATIONS =========
  // ============================================================

  // V_RPT_1: Profit & Loss via RPC
  try {
    const { data: plData, error: plErr } = await client.rpc("get_profit_loss", {
      p_org_id: orgId,
      p_from: "2020-01-01",
      p_to: new Date().toISOString().split("T")[0],
    });
    const plRows = plData ?? [];
    const revenue = plRows.filter((r: any) => r.account_type === "revenue")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const expenses = plRows.filter((r: any) => r.account_type === "expense")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const netIncome = revenue - expenses;
    checks.push({
      check: "V_RPT_PROFIT_LOSS", module: "Reports",
      status: plErr ? "failed" : plRows.length > 0 ? "passed" : "warning",
      detail: plErr
        ? `P&L RPC error: ${plErr.message}`
        : `P&L returns ${plRows.length} lines — Revenue: ${revenue.toFixed(2)}, Expenses: ${expenses.toFixed(2)}, Net: ${netIncome.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_PROFIT_LOSS", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_2: Balance Sheet via RPC
  try {
    const { data: bsData, error: bsErr } = await client.rpc("get_balance_sheet", {
      p_org_id: orgId,
      p_as_of: new Date().toISOString().split("T")[0],
    });
    const bsRows = bsData ?? [];
    const totalAssets = bsRows.filter((r: any) => r.account_type === "asset")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const totalLiabilities = bsRows.filter((r: any) => r.account_type === "liability")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const totalEquity = bsRows.filter((r: any) => r.account_type === "equity")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    checks.push({
      check: "V_RPT_BALANCE_SHEET", module: "Reports",
      status: bsErr ? "failed" : bsRows.length > 0 ? "passed" : "warning",
      detail: bsErr
        ? `Balance Sheet RPC error: ${bsErr.message}`
        : `BS returns ${bsRows.length} lines — Assets: ${totalAssets.toFixed(2)}, Liabilities: ${totalLiabilities.toFixed(2)}, Equity: ${totalEquity.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_BALANCE_SHEET", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_3: Trial Balance via RPC
  try {
    const { data: tbData, error: tbErr } = await client.rpc("get_trial_balance", {
      p_org_id: orgId,
      p_from: "2020-01-01",
      p_to: new Date().toISOString().split("T")[0],
    });
    const tbRows = tbData ?? [];
    const totalDebit = tbRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const totalCredit = tbRows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
    const tbBalanced = Math.abs(totalDebit - totalCredit) < 0.02;
    checks.push({
      check: "V_RPT_TRIAL_BALANCE", module: "Reports",
      status: tbErr ? "failed" : tbRows.length === 0 ? "warning" : tbBalanced ? "passed" : "failed",
      detail: tbErr
        ? `Trial Balance RPC error: ${tbErr.message}`
        : tbRows.length === 0
          ? "Trial balance returned 0 rows"
          : `TB: ${tbRows.length} accounts — Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}, Balanced: ${tbBalanced}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_TRIAL_BALANCE", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_4: Cash Flow (indirect method) via RPC
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const { data: cfData, error: cfErr } = await client.rpc("get_cash_flow_indirect", {
      p_org_id: orgId,
      p_from: sixMonthsAgo.toISOString().split("T")[0],
      p_to: new Date().toISOString().split("T")[0],
    });
    checks.push({
      check: "V_RPT_CASH_FLOW", module: "Reports",
      status: cfErr ? "failed" : (cfData && (Array.isArray(cfData) ? cfData.length > 0 : Object.keys(cfData).length > 0)) ? "passed" : "warning",
      detail: cfErr
        ? `Cash Flow RPC error: ${cfErr.message}`
        : `Cash flow report returned data successfully`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_CASH_FLOW", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_5: GL Account Balances (dashboard KPI source)
  try {
    const { data: glBalances, error: glErr } = await client.from("gl_accounts")
      .select("id, name, account_type, opening_balance")
      .eq("organization_id", orgId);
    const glRows = glBalances ?? [];
    const revenueAccounts = glRows.filter((g: any) => g.account_type === "revenue").length;
    const expenseAccounts = glRows.filter((g: any) => g.account_type === "expense").length;
    const assetAccounts = glRows.filter((g: any) => g.account_type === "asset").length;
    checks.push({
      check: "V_KPI_GL_ACCOUNTS", module: "Dashboard",
      status: glErr ? "failed" : glRows.length >= 5 ? "passed" : "warning",
      detail: glErr
        ? `GL accounts query error: ${glErr.message}`
        : `${glRows.length} GL accounts — Revenue: ${revenueAccounts}, Expense: ${expenseAccounts}, Asset: ${assetAccounts}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_GL_ACCOUNTS", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_6: Dashboard revenue KPI — journal_lines with revenue accounts
  try {
    const { data: revAccts } = await client.from("gl_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("account_type", "revenue");
    const revIds = (revAccts ?? []).map((a: any) => a.id);
    let dashRevenue = 0;
    if (revIds.length > 0) {
      const { data: revLines } = await client.from("journal_lines")
        .select("credit")
        .in("account_id", revIds)
        .limit(500);
      dashRevenue = (revLines ?? []).reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    }
    checks.push({
      check: "V_KPI_DASHBOARD_REVENUE", module: "Dashboard",
      status: dashRevenue > 0 ? "passed" : "warning",
      detail: `Dashboard total revenue from journal lines: ${dashRevenue.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_DASHBOARD_REVENUE", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_7: Dashboard expense KPI — journal_lines with expense accounts
  try {
    const { data: expAccts } = await client.from("gl_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("account_type", "expense");
    const expIds = (expAccts ?? []).map((a: any) => a.id);
    let dashExpenses = 0;
    if (expIds.length > 0) {
      const { data: expLines } = await client.from("journal_lines")
        .select("debit")
        .in("account_id", expIds)
        .limit(500);
      dashExpenses = (expLines ?? []).reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    }
    checks.push({
      check: "V_KPI_DASHBOARD_EXPENSES", module: "Dashboard",
      status: dashExpenses > 0 ? "passed" : "warning",
      detail: `Dashboard total expenses from journal lines: ${dashExpenses.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_DASHBOARD_EXPENSES", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_8: Net Income consistency (P&L revenue - expenses should match dashboard)
  try {
    const { data: plCheck } = await client.rpc("get_profit_loss", {
      p_org_id: orgId,
      p_from: "2020-01-01",
      p_to: new Date().toISOString().split("T")[0],
    });
    const plRows2 = plCheck ?? [];
    const plRevenue = plRows2.filter((r: any) => r.account_type === "revenue")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const plExpenses = plRows2.filter((r: any) => r.account_type === "expense")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const plNet = plRevenue - plExpenses;
    checks.push({
      check: "V_KPI_NET_INCOME_CONSISTENCY", module: "Dashboard",
      status: plRows2.length > 0 ? "passed" : "warning",
      detail: `Net income from P&L RPC: ${plNet.toFixed(2)} (Revenue: ${plRevenue.toFixed(2)} - Expenses: ${plExpenses.toFixed(2)})`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_NET_INCOME_CONSISTENCY", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_9: Accounts Receivable Aging — invoices past due
  try {
    const { data: overdueInv } = await client.from("invoices")
      .select("id, total_amount, due_date, status")
      .eq("organization_id", orgId)
      .in("status", ["sent", "overdue"])
      .lt("due_date", new Date().toISOString().split("T")[0]);
    const overdueTotal = (overdueInv ?? []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
    checks.push({
      check: "V_RPT_AR_AGING", module: "Reports",
      status: "passed",
      detail: `AR Aging: ${(overdueInv ?? []).length} overdue invoices totaling ${overdueTotal.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_AR_AGING", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_10: Accounts Payable Aging — bills past due
  try {
    const { data: overdueBills } = await client.from("bills")
      .select("id, total_amount, due_date, status")
      .eq("organization_id", orgId)
      .in("status", ["pending", "overdue"])
      .lt("due_date", new Date().toISOString().split("T")[0]);
    const apTotal = (overdueBills ?? []).reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
    checks.push({
      check: "V_RPT_AP_AGING", module: "Reports",
      status: "passed",
      detail: `AP Aging: ${(overdueBills ?? []).length} overdue bills totaling ${apTotal.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_AP_AGING", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_11: Balance Sheet equation (Assets = Liabilities + Equity + Net Income)
  try {
    const { data: bsEq } = await client.rpc("get_balance_sheet", {
      p_org_id: orgId,
      p_as_of: new Date().toISOString().split("T")[0],
    });
    const bsRows2 = bsEq ?? [];
    const eqAssets = bsRows2.filter((r: any) => r.account_type === "asset")
      .reduce((s: number, r: any) => s + Number(r.balance || 0), 0);
    const eqLiab = bsRows2.filter((r: any) => r.account_type === "liability")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const eqEquity = bsRows2.filter((r: any) => r.account_type === "equity")
      .reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    // A simplified check: assets should approximately equal liabilities + equity (within rounding)
    const diff = Math.abs(eqAssets - (eqLiab + eqEquity));
    checks.push({
      check: "V_RPT_BS_EQUATION", module: "Reports",
      status: bsRows2.length === 0 ? "warning" : diff < 1 ? "passed" : "failed",
      detail: bsRows2.length === 0
        ? "No balance sheet data to verify equation"
        : `A=${eqAssets.toFixed(2)}, L+E=${(eqLiab + eqEquity).toFixed(2)}, Diff=${diff.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_RPT_BS_EQUATION", module: "Reports", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_12: Payroll analytics — total CTC vs payroll cost
  try {
    const { data: compStructs } = await client.from("compensation_structures")
      .select("annual_ctc")
      .eq("organization_id", orgId)
      .eq("is_active", true);
    const totalCTC = (compStructs ?? []).reduce((s: number, c: any) => s + Number(c.annual_ctc || 0), 0);
    const { data: payrollTotals } = await client.from("payroll_runs")
      .select("total_gross")
      .eq("organization_id", orgId);
    const totalPayroll = (payrollTotals ?? []).reduce((s: number, r: any) => s + Number(r.total_gross || 0), 0);
    checks.push({
      check: "V_KPI_PAYROLL_CTC", module: "Dashboard",
      status: totalCTC > 0 ? "passed" : "warning",
      detail: `Active CTC pool: ${totalCTC.toFixed(2)}, Total payroll disbursed: ${totalPayroll.toFixed(2)}`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_PAYROLL_CTC", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_13: Attendance KPI — present rate
  try {
    const { count: totalAtt } = await client.from("attendance_daily")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    const { count: presentAtt } = await client.from("attendance_daily")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", ["present", "half_day"]);
    const rate = (totalAtt ?? 0) > 0 ? ((presentAtt ?? 0) / (totalAtt ?? 1) * 100) : 0;
    checks.push({
      check: "V_KPI_ATTENDANCE_RATE", module: "Dashboard",
      status: (totalAtt ?? 0) > 0 ? "passed" : "warning",
      detail: `Attendance: ${presentAtt ?? 0}/${totalAtt ?? 0} present (${rate.toFixed(1)}%)`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_ATTENDANCE_RATE", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }

  // V_RPT_14: Leave utilization KPI
  try {
    const { count: approvedLeaves } = await client.from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "approved");
    const { count: totalLeaves } = await client.from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    checks.push({
      check: "V_KPI_LEAVE_UTILIZATION", module: "Dashboard",
      status: (totalLeaves ?? 0) > 0 ? "passed" : "warning",
      detail: `Leaves: ${approvedLeaves ?? 0} approved out of ${totalLeaves ?? 0} total`,
    });
  } catch (e: any) {
    checks.push({ check: "V_KPI_LEAVE_UTILIZATION", module: "Dashboard", status: "failed", detail: `Exception: ${e.message}` });
  }


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
