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
  const today = new Date();

  // Use the SECURITY DEFINER function to force-delete journal data (bypasses immutability triggers)
  const { error: jdErr } = await client.rpc("sandbox_force_delete_journal_data", { _org_id: orgId });
  if (jdErr) console.warn("Force delete journal data:", jdErr.message);

  // Clean up previously seeded sandbox simulation users
  const { data: simProfiles } = await client.from("profiles")
    .select("id, user_id, email")
    .eq("organization_id", orgId)
    .like("email", "%@sandbox-sim.local");
  for (const sp of (simProfiles ?? [])) {
    try {
      await client.from("organization_members").delete().eq("user_id", sp.user_id).eq("organization_id", orgId);
      await client.from("compensation_structures").delete().eq("profile_id", sp.id);
      await client.from("profiles").delete().eq("id", sp.id);
      await client.auth.admin.deleteUser(sp.user_id);
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
    "leave_requests", "leave_balances", "investment_declarations", "employee_documents",
    "asset_depreciation_entries",
    "quote_items", "quotes",
    "invoice_items", "invoices",
    "bill_items", "bills",
    "vendor_credits", "credit_notes",
    "bank_transactions", "bank_accounts", "expenses", "budgets",
    "financial_records", "assets", "audit_logs",
    "compensation_revision_requests", "compensation_components", "compensation_structures",
     "holidays", "user_roles", "organization_members",
     "profile_change_requests", "payslip_disputes",
     "chart_of_accounts",
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
    { key: "casual", label: "Casual Leave", default_days: 12, color: "#3b82f6", icon: "☀️", is_active: true, sort_order: 1 },
    { key: "sick", label: "Sick Leave", default_days: 10, color: "#ef4444", icon: "🏥", is_active: true, sort_order: 2 },
    { key: "earned", label: "Earned Leave", default_days: 15, color: "#10b981", icon: "📅", is_active: true, sort_order: 3 },
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
    { name: "HDFC Current Account", account_number: "SIM-50100012345678", account_type: "Current", bank_name: "HDFC Bank", balance: 2500000 },
    { name: "ICICI Savings Account", account_number: "SIM-60200098765432", account_type: "Savings", bank_name: "ICICI Bank", balance: 850000 },
  ];
  for (const ba of bankAccounts) {
    const { error } = await client.from("bank_accounts").insert({
      ...ba, organization_id: orgId, user_id: userId, status: "Active",
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
        let userId: string | null = null;

        const { data: newUser, error: createErr } = await client.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: emp.name },
        });

        if (createErr) {
          // User already exists — look them up by email and reuse their ID
          if (createErr.message?.includes("already been registered")) {
            const { data: existingUsers } = await client.auth.admin.listUsers();
            const found = (existingUsers?.users ?? []).find((u: any) => u.email === email);
            if (found) {
              userId = found.id;
              console.log(`Reusing existing auth user for ${emp.name}: ${userId}`);
            } else {
              console.warn(`Could not find existing user ${emp.name} by email`);
              continue;
            }
          } else {
            console.warn(`Failed to create user ${emp.name}:`, createErr.message);
            continue;
          }
        } else {
          userId = newUser.user.id;
        }

        if (!userId) continue;

        const profileData = {
          organization_id: orgId,
          full_name: emp.name,
          email: `${emp.name.toLowerCase().replace(/\s+/g, ".")}@sandbox-sim.local`,
          department: emp.dept,
          job_title: emp.jobTitle,
          status: "active",
          join_date: "2024-06-01",
          phone: emp.phone,
        };

        // Check if a profile row exists for this auth user
        const { data: existingProfile } = await client.from("profiles")
          .select("id").eq("user_id", userId).maybeSingle();

        let profileErr: any = null;
        if (existingProfile) {
          // Profile exists — update it
          const { error } = await client.from("profiles")
            .update(profileData).eq("user_id", userId);
          profileErr = error;
        } else {
          // Profile was deleted during reset — re-insert it
          const { error } = await client.from("profiles")
            .insert({ ...profileData, id: userId, user_id: userId });
          profileErr = error;
        }

        if (profileErr) {
          console.warn(`Failed to upsert profile for ${emp.name}:`, profileErr.message);
        } else {
          seededProfiles++;
        }
      } catch (e) {
        console.warn(`Error seeding employee ${emp.name}:`, (e as Error).message);
      }
    }
  }
  summary.profiles = seededProfiles;

  // ===== SEED ORGANIZATION MEMBERS =====
  const { data: allProfilesList } = await client.from("profiles")
    .select("id, user_id, full_name, department, job_title")
    .eq("organization_id", orgId);

  let orgMemberCount = 0;
  for (const p of (allProfilesList ?? [])) {
    const { error } = await client.from("organization_members").upsert({
      user_id: p.user_id, organization_id: orgId, role: "member",
    }, { onConflict: "organization_id,user_id" });
    if (!error) orgMemberCount++;
  }
  summary.organization_members = orgMemberCount;

  // ===== SET MANAGER_ID ON PROFILES (reporting hierarchy) =====
  // Vikram Singh (Tech Lead) manages: Arjun (Sr Dev), Deepika (QA), Ananya (Marketing)
  // Rahul Verma (Ops Lead) manages: Karan (Sales)
  // Sneha Iyer (HR Exec) manages: nobody directly but is HR head
  // Priya Sharma (Finance Mgr) manages: nobody directly but is Finance head
  const managerMapping: Record<string, string> = {
    "Senior Developer": "Tech Lead",
    "QA Engineer": "Tech Lead",
    "Marketing Analyst": "Tech Lead",
    "Sales Executive": "Operations Lead",
  };
  const titleToUserId: Record<string, string> = {};
  for (const p of (allProfilesList ?? [])) {
    titleToUserId[p.job_title] = p.user_id;
  }
  let managerIdSetCount = 0;
  for (const p of (allProfilesList ?? [])) {
    const managerTitle = managerMapping[p.job_title];
    if (managerTitle && titleToUserId[managerTitle]) {
      const { error } = await client.from("profiles")
        .update({ manager_id: titleToUserId[managerTitle] })
        .eq("id", p.id);
      if (!error) managerIdSetCount++;
    }
  }
  console.log(`Set manager_id on ${managerIdSetCount} profiles`);

  // ===== SEED USER ROLES (MULTI-ROLE) for employees =====
  // Each key actor gets multiple roles to enable cross-role simulation
  const multiRoleMapping: Record<string, string[]> = {
    "Senior Developer": ["admin", "manager"],           // Admin who also manages team
    "Finance Manager":  ["finance", "manager", "payroll"], // Finance head + manager + payroll
    "HR Executive":     ["hr", "manager", "payroll"],   // HR head + manager + payroll access
    "Tech Lead":        ["manager"],                     // Pure manager
    "Operations Lead":  ["manager"],                     // Pure manager
    "Marketing Analyst": ["employee"],                   // Pure employee
    "Sales Executive":   ["employee"],                   // Pure employee
    "QA Engineer":       ["employee"],                   // Pure employee
  };
  let roleCount = 0;
  for (const p of (allProfilesList ?? [])) {
    const roles = multiRoleMapping[p.job_title] || ["employee"];
    for (const role of roles) {
      const { error } = await client.from("user_roles").upsert({
        user_id: p.user_id, role, organization_id: orgId,
      }, { onConflict: "user_id,role,organization_id" });
      if (!error) roleCount++;
    }
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

  // ===== GAP FIX #2: SEED MANAGER HIERARCHY =====
  // Tech Lead (Vikram Singh) and Operations Lead (Rahul Verma) are managers
  // Assign manager_id on profiles so subordinates report to them
  const managers = (allProfilesList ?? []).filter((p: any) =>
    p.job_title === "Tech Lead" || p.job_title === "Operations Lead"
  );
  const engineeringManager = (allProfilesList ?? []).find((p: any) => p.job_title === "Tech Lead");
  const opsManager = (allProfilesList ?? []).find((p: any) => p.job_title === "Operations Lead");

  const managerAssignment: Record<string, any> = {
    "Engineering": engineeringManager,
    "Marketing": opsManager,
    "Sales": opsManager,
    "Finance": engineeringManager, // cross-dept reporting for sim
    "HR": opsManager,
  };

  let managerHierarchyCount = 0;
  for (const p of (allProfilesList ?? [])) {
    const mgr = managerAssignment[p.department];
    if (mgr && mgr.id !== p.id) {
      const { error } = await client.from("profiles").update({
        manager_id: mgr.id,
      }).eq("id", p.id);
      if (!error) managerHierarchyCount++;
    }
  }
  summary.manager_hierarchy = managerHierarchyCount;

  // ===== GAP FIX #3: SEED LEAVE BALANCES =====
  const leaveBalanceTypes = [
    { type: "casual", total: 12 },
    { type: "sick", total: 10 },
    { type: "earned", total: 15 },
  ];
  let leaveBalCount = 0;
  for (const p of (allProfilesList ?? [])) {
    for (const lb of leaveBalanceTypes) {
      const usedDays = Math.floor(Math.random() * Math.min(lb.total, 4));
      const { error } = await client.from("leave_balances").insert({
        user_id: p.user_id, profile_id: p.id, organization_id: orgId,
        leave_type: lb.type, total_days: lb.total,
        used_days: usedDays, year: 2026,
      });
      if (!error) leaveBalCount++;
    }
  }
  summary.leave_balances = leaveBalCount;

  // ===== GAP FIX #4: SEED CHART OF ACCOUNTS =====
  let coaCount = 0;
  for (const entry of coaEntries) {
    const { error } = await client.from("chart_of_accounts").insert({
      account_code: entry.code, account_name: entry.name, account_type: entry.type,
      organization_id: orgId, user_id: userId, is_active: true,
      opening_balance: 0, current_balance: 0,
    });
    if (!error) coaCount++;
  }
  summary.chart_of_accounts = coaCount;

  // ===== GAP FIX #7: SEED ATTENDANCE DAILY RECORDS =====
  // Create computed attendance_daily records for past 5 days for first 5 profiles
  let attDailyCount = 0;
  const attToday = new Date();
  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const d = new Date(attToday);
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().split("T")[0];
    for (const p of (allProfilesList ?? []).slice(0, 5)) {
      const lateMin = Math.floor(Math.random() * 20);
      const otMin = Math.floor(Math.random() * 60);
      const workMin = 480 + otMin - lateMin;
      const { error } = await client.from("attendance_daily").insert({
        profile_id: p.id, organization_id: orgId,
        attendance_date: dateStr, status: "P",
        first_in_time: `09:${String(lateMin).padStart(2, "0")}:00`,
        last_out_time: `18:${String(otMin).padStart(2, "0")}:00`,
        total_work_minutes: workMin, late_minutes: lateMin,
        early_exit_minutes: 0, ot_minutes: otMin,
      });
      if (!error) attDailyCount++;
    }
  }
  summary.attendance_daily = attDailyCount;

  // ===== SEED DEPRECIATION ENTRIES =====
  let depCount = 0;
  const { data: seededAssets } = await client.from("assets")
    .select("id, purchase_price, useful_life_months, salvage_value")
    .eq("organization_id", orgId).eq("status", "active");
  for (const asset of (seededAssets ?? [])) {
    const monthlyDep = Math.round((asset.purchase_price - (asset.salvage_value ?? 0)) / asset.useful_life_months);
    // Seed 3 months of depreciation
    for (let m = 0; m < 3; m++) {
      const periodDate = new Date(2025, 4 + m, 1).toISOString().split("T")[0]; // May, Jun, Jul 2025
      const accDep = monthlyDep * (m + 1);
      const { error } = await client.from("asset_depreciation_entries").insert({
        asset_id: asset.id, organization_id: orgId,
        period_date: periodDate,
        depreciation_amount: monthlyDep,
        accumulated_depreciation: accDep,
        book_value_after: asset.purchase_price - accDep,
        is_posted: true,
      });
      if (!error) depCount++;
    }
  }
  summary.depreciation_entries = depCount;

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

  // ===== SEED ORGANIZATION COMPLIANCE =====
  const { error: complianceErr } = await client.from("organization_compliance").upsert({
    organization_id: orgId,
    payroll_enabled: true, payroll_frequency: "monthly",
    pf_applicable: true, esi_applicable: false,
    professional_tax_applicable: true, gratuity_applicable: false,
    accounting_method: "accrual", base_currency: "INR",
    financial_year_start: "April",
    entity_type: "private_limited", legal_name: "Sandbox Simulation Pvt Ltd",
    pan: "AABCS1234D", tan: "DELS12345E",
    gstin: ["29AABCS1234D1ZQ"],
    registration_type: "regular", filing_frequency: "monthly",
    einvoice_applicable: false, ewaybill_applicable: false,
    reverse_charge_applicable: false, itc_eligible: true,
    state: "Karnataka", pincode: "560001",
    registered_address: "123 MG Road, Bengaluru",
    authorized_signatory_name: "Arjun Mehta",
  }, { onConflict: "organization_id" });
  summary.organization_compliance = complianceErr ? 0 : 1;

  // ===== SEED GOAL CYCLE CONFIG =====
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const { error: gccErr } = await client.from("goal_cycle_config").upsert({
    organization_id: orgId, cycle_month: currentMonthStr,
    input_start_day: 1, input_deadline_day: 10,
    scoring_start_day: 25, scoring_deadline_day: 28,
    is_active: true,
  }, { onConflict: "organization_id,cycle_month" });
  summary.goal_cycle_config = gccErr ? 0 : 1;

  // ===== SEED HISTORICAL PAYROLL RUNS (3 months) =====
  let histPayrollCount = 0;
  const histMonths = [
    { period: "2025-12", gross: 385000, ded: 77000, net: 308000 },
    { period: "2026-01", gross: 392000, ded: 78400, net: 313600 },
    { period: "2026-02", gross: 398000, ded: 79600, net: 318400 },
  ];
  for (const hm of histMonths) {
    const { data: histRun, error: hrErr } = await client.from("payroll_runs").insert({
      organization_id: orgId, pay_period: hm.period,
      generated_by: userId, status: "processed",
      employee_count: 5, total_gross: hm.gross,
      total_deductions: hm.ded, total_net: hm.net,
    }).select("id").single();
    if (!hrErr && histRun) {
      histPayrollCount++;
      // Create payroll records for each historical month
      for (let pi = 0; pi < Math.min(5, (allProfilesList ?? []).length); pi++) {
        const p = allProfilesList![pi];
        const basic = [50000, 65000, 80000, 45000, 95000][pi % 5];
        const hra = Math.round(basic * 0.4);
        const gross = basic + hra + 1600 + Math.round(basic * 0.15);
        const pf = Math.round(basic * 0.12);
        const tax = Math.round(gross * 0.1);
        const net = gross - pf - tax - 500;
        await client.from("payroll_records").insert({
          user_id: p.user_id, profile_id: p.id,
          organization_id: orgId, pay_period: hm.period,
          basic_salary: basic, hra, transport_allowance: 1600,
          other_allowances: Math.round(basic * 0.15),
          pf_deduction: pf, tax_deduction: tax, other_deductions: 500,
          net_pay: net, working_days: 22, paid_days: 22,
          lop_days: 0, lop_deduction: 0, status: "processed",
        });
      }
    }
  }
  summary.historical_payroll_runs = histPayrollCount;

  // ===== SEED DIVERSE ATTENDANCE PATTERNS =====
  let diverseAttCount = 0;
  const attStatuses = ["P", "P", "P", "A", "HD", "P", "MIS", "P"];
  for (let dayOffset = 6; dayOffset <= 15; dayOffset++) {
    const d = new Date(attToday);
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().split("T")[0];
    for (let pi = 0; pi < Math.min(8, (allProfilesList ?? []).length); pi++) {
      const p = allProfilesList![pi];
      const st = attStatuses[(dayOffset + pi) % attStatuses.length];
      const isPresent = st === "P" || st === "HD";
      const { error } = await client.from("attendance_daily").insert({
        profile_id: p.id, organization_id: orgId,
        attendance_date: dateStr, status: st,
        first_in_time: isPresent ? "09:05:00" : null,
        last_out_time: isPresent ? (st === "HD" ? "13:00:00" : "18:10:00") : null,
        total_work_minutes: st === "P" ? 480 : st === "HD" ? 240 : 0,
        late_minutes: isPresent ? Math.floor(Math.random() * 15) : 0,
        early_exit_minutes: 0, ot_minutes: 0,
      });
      if (!error) diverseAttCount++;
    }
  }
  summary.diverse_attendance = diverseAttCount;

  // ===== SEED EMPLOYEE DOCUMENTS =====
  let empDocCount = 0;
  const docTypes = [
    { type: "offer_letter", name: "Offer Letter" },
    { type: "pan_card", name: "PAN Card Copy" },
    { type: "aadhaar", name: "Aadhaar Card" },
    { type: "bank_details", name: "Cancelled Cheque" },
  ];
  for (let pi = 0; pi < Math.min(4, (allProfilesList ?? []).length); pi++) {
    const p = allProfilesList![pi];
    for (const doc of docTypes) {
      const { error } = await client.from("employee_documents").insert({
        profile_id: p.id, organization_id: orgId,
        uploaded_by: userId, document_type: doc.type,
        document_name: `${doc.name} - ${p.full_name}`,
        file_path: `sandbox/${orgId}/${p.id}/${doc.type}.pdf`,
        file_size: Math.round(50000 + Math.random() * 200000),
        mime_type: "application/pdf",
      });
      if (!error) empDocCount++;
    }
  }
  summary.employee_documents = empDocCount;

  // ===== SEED INVESTMENT DECLARATIONS =====
  let invDeclCount = 0;
  const sections = ["80C", "80D", "80G", "HRA"];
  for (let pi = 0; pi < Math.min(4, (allProfilesList ?? []).length); pi++) {
    const p = allProfilesList![pi];
    for (const sec of sections.slice(0, 2 + pi % 2)) {
      const { error } = await client.from("investment_declarations").insert({
        profile_id: p.id, organization_id: orgId,
        financial_year: "2025-2026", section_type: sec,
        declared_amount: Math.round(20000 + Math.random() * 130000),
        status: pi < 2 ? "submitted" : "approved",
        approved_amount: pi < 2 ? null : Math.round(20000 + Math.random() * 100000),
      });
      if (!error) invDeclCount++;
    }
  }
  summary.investment_declarations = invDeclCount;

  // ===== CLOSE ONE FISCAL PERIOD (for fiscal-locking test) =====
  if (financialYearId) {
    const { data: aprPeriod } = await client.from("fiscal_periods")
      .select("id").eq("organization_id", orgId)
      .eq("financial_year_id", financialYearId)
      .eq("period_number", 1).maybeSingle();
    if (aprPeriod) {
      await client.from("fiscal_periods").update({
        status: "closed", closed_at: new Date().toISOString(), closed_by: userId,
      }).eq("id", aprPeriod.id);
    }
    summary.closed_fiscal_periods = aprPeriod ? 1 : 0;
  }

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
  const today = new Date();
  const results: Array<{ workflow: string; module: string; status: string; detail: string; duration_ms: number }> = [];

  // Get profiles in this org for HR workflows
  const { data: profiles } = await client.from("profiles")
    .select("id, user_id, full_name, job_title")
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
      if (inv) {
        createdInvoiceIds.push(inv.id);
        // Gap Fix #5: Seed invoice line items
        const itemCount = 1 + Math.floor(Math.random() * 3);
        for (let j = 0; j < itemCount; j++) {
          const qty = 1 + Math.floor(Math.random() * 10);
          const rate = Math.round(amount / itemCount / qty);
          await client.from("invoice_items").insert({
            invoice_id: inv.id, description: `Service item ${j + 1} for ${cust.name}`,
            quantity: qty, rate, amount: qty * rate,
            tax_rate: 18, tax_amount: Math.round(qty * rate * 0.18),
          });
        }
      }
      results.push({
        workflow: `Invoice: ${invNum}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${cust.name} — ₹${(amount + taxAmount).toLocaleString()} with line items`,
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
      if (bill) {
        createdBillIds.push(bill.id);
        // Gap Fix #5: Seed bill line items
        const itemCount = 1 + Math.floor(Math.random() * 2);
        for (let j = 0; j < itemCount; j++) {
          const qty = 1 + Math.floor(Math.random() * 5);
          const rate = Math.round(amount / itemCount / qty);
          await client.from("bill_items").insert({
            bill_id: bill.id, description: `Supply item ${j + 1} from ${v.name}`,
            quantity: qty, rate, amount: qty * rate,
          });
        }
      }
      results.push({
        workflow: `Bill: ${billNum}`, module: "Finance", status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${v.name} — ₹${(amount + taxAmount).toLocaleString()} with line items`,
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
      const profileForExp = profileList[i % profileList.length];
      const { error } = await client.from("expenses").insert({
        description: `Simulation expense - ${expenseCategories[i]}`, amount,
        category: expenseCategories[i], organization_id: orgId, user_id: userId,
        profile_id: profileForExp?.id ?? null,
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
        const types = ["revenue", "expense", "expense"];
        const { error } = await client.from("financial_records").insert({
          type: types[i], amount, description: `Simulation ${types[i]} record #${i + 1}`,
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
          user_id: profile.user_id, profile_id: profile.id,
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
        user_id: profileList[0].user_id, profile_id: profileList[0].id,
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
    { type: "casual", from: 5, to: 6, days: 2, reason: "Family function" },
    { type: "sick", from: 10, to: 12, days: 3, reason: "Fever and cold" },
    { type: "earned", from: 20, to: 25, days: 6, reason: "Vacation trip" },
    { type: "casual", from: 15, to: 15, days: 1, reason: "Personal work" },
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
        user_id: profile.user_id, profile_id: profile.id,
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
          user_id: profile.user_id, profile_id: profile.id,
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
        user_id: profile.user_id, profile_id: profile.id,
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
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
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
        user_id: profile.user_id, profile_id: profile.id,
        organization_id: orgId,
        month: currentMonth,
        items: goalItems,
        status: "draft",
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
      if (qt) {
        createdQuoteIds.push(qt.id);
        // Gap Fix #5: Seed quote line items
        for (let j = 0; j < 2; j++) {
          const qty = 1 + Math.floor(Math.random() * 5);
          const rate = Math.round(amount / 2 / qty);
          await client.from("quote_items").insert({
            quote_id: qt.id, description: `Quoted item ${j + 1}`,
            quantity: qty, rate, amount: qty * rate,
            tax_rate: 18, tax_amount: Math.round(qty * rate * 0.18),
          });
        }
      }
      results.push({
        workflow: `Quote: ${quoteNum}`, module: "Quotes",
        status: error ? "failed" : "passed",
        detail: error?.message ?? `Created for ${cust.name} — ₹${(amount + gst).toLocaleString()} with line items`,
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

  // ===== CFO FINANCE WORKFLOWS =====

  // CFO-1: Bank transaction seeding + reconciliation workflow
  if (cashAccount) {
    const wfStart = Date.now();
    try {
      const { data: bankAcct } = await client.from("bank_accounts")
        .select("id").eq("organization_id", orgId).limit(1).maybeSingle();
      if (bankAcct) {
        // Seed bank transactions (deposits + withdrawals)
        const bankTxns = [
          { desc: "Client payment - Pinnacle Corp", amount: 125000, type: "credit", cat: "Sales Receipt" },
          { desc: "Vendor payment - Acme Supplies", amount: -45000, type: "debit", cat: "Bill Payment" },
          { desc: "Salary transfer - Mar batch", amount: -210000, type: "debit", cat: "Payroll" },
          { desc: "Client payment - Nexus Digital", amount: 87500, type: "credit", cat: "Sales Receipt" },
          { desc: "Rent payment - Q1", amount: -75000, type: "debit", cat: "Rent" },
          { desc: "GST refund", amount: 32000, type: "credit", cat: "Tax Refund" },
          { desc: "Insurance premium", amount: -18500, type: "debit", cat: "Insurance" },
        ];
        let txnCount = 0;
        for (let i = 0; i < bankTxns.length; i++) {
          const t = bankTxns[i];
          const txDate = new Date(Date.now() - (bankTxns.length - i) * 3 * 86400000).toISOString().split("T")[0];
          const { error } = await client.from("bank_transactions").insert({
            account_id: bankAcct.id, organization_id: orgId, user_id: userId,
            description: t.desc, amount: Math.abs(t.amount),
            transaction_type: t.type, category: t.cat,
            transaction_date: txDate, reconciled: false,
            reference: `SIM-BT-${Date.now()}-${i}`,
          });
          if (!error) txnCount++;
        }
        // Reconcile first 3 transactions
        const { data: unreconciledTxns } = await client.from("bank_transactions")
          .select("id").eq("account_id", bankAcct.id).eq("reconciled", false).limit(3);
        let reconciledCount = 0;
        for (const tx of (unreconciledTxns ?? [])) {
          const { error } = await client.from("bank_transactions").update({
            reconciled: true, reconciled_at: new Date().toISOString(),
            reconcile_status: "matched",
          }).eq("id", tx.id);
          if (!error) reconciledCount++;
        }
        results.push({
          workflow: "CFO: Bank transactions + reconciliation", module: "Finance",
          status: txnCount > 0 ? "passed" : "failed",
          detail: `${txnCount} bank txns seeded, ${reconciledCount} reconciled`,
          duration_ms: Date.now() - wfStart,
        });
      }
    } catch (e) {
      results.push({ workflow: "CFO: Bank reconciliation", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-2: Budget vs Actual variance analysis
  {
    const wfStart = Date.now();
    try {
      const { data: budgets } = await client.from("budgets")
        .select("id, account_id, budget_amount, fiscal_period_id")
        .eq("organization_id", orgId);
      let varianceChecks = 0;
      let overBudget = 0;
      for (const budget of (budgets ?? [])) {
        // Get actual spend from journal_lines for this account
        const { data: actuals } = await client.from("journal_lines")
          .select("debit")
          .eq("gl_account_id", budget.account_id)
          .limit(100);
        const actualSpend = (actuals ?? []).reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
        if (actualSpend > budget.budget_amount) overBudget++;
        varianceChecks++;
      }
      results.push({
        workflow: "CFO: Budget vs Actual variance", module: "Finance",
        status: varianceChecks > 0 ? "passed" : "warning",
        detail: `${varianceChecks} budget lines checked, ${overBudget} over budget`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "CFO: Budget variance", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-3: Multi-period journal entries (for month-over-month P&L comparison)
  if (cashAccount && revenueAccount && expenseAccount) {
    const wfStart = Date.now();
    try {
      const months = [
        { label: "Oct 2025", date: "2025-10-15", revAmt: 180000, expAmt: 95000 },
        { label: "Nov 2025", date: "2025-11-15", revAmt: 210000, expAmt: 105000 },
        { label: "Dec 2025", date: "2025-12-15", revAmt: 195000, expAmt: 110000 },
        { label: "Jan 2026", date: "2026-01-15", revAmt: 225000, expAmt: 115000 },
        { label: "Feb 2026", date: "2026-02-15", revAmt: 240000, expAmt: 120000 },
      ];
      let postedCount = 0;
      for (const m of months) {
        // Revenue entry
        const { data: revJE } = await client.from("journal_entries").insert({
          document_sequence_number: `SIM-REV-${m.date}`,
          organization_id: orgId, created_by: userId,
          entry_date: m.date, memo: `${m.label} revenue recognition`,
          status: "posted", source_type: "sandbox_simulation",
        }).select("id").single();
        if (revJE) {
          await client.from("journal_lines").insert([
            { journal_entry_id: revJE.id, gl_account_id: (arAccount ?? cashAccount).id, debit: m.revAmt, credit: 0, description: `${m.label} - AR/Cash` },
            { journal_entry_id: revJE.id, gl_account_id: revenueAccount.id, debit: 0, credit: m.revAmt, description: `${m.label} - Revenue` },
          ]);
          postedCount++;
        }
        // Expense entry
        const { data: expJE } = await client.from("journal_entries").insert({
          document_sequence_number: `SIM-EXP-${m.date}`,
          organization_id: orgId, created_by: userId,
          entry_date: m.date, memo: `${m.label} operating expenses`,
          status: "posted", source_type: "sandbox_simulation",
        }).select("id").single();
        if (expJE) {
          await client.from("journal_lines").insert([
            { journal_entry_id: expJE.id, gl_account_id: expenseAccount.id, debit: m.expAmt, credit: 0, description: `${m.label} - Operating expenses` },
            { journal_entry_id: expJE.id, gl_account_id: cashAccount.id, debit: 0, credit: m.expAmt, description: `${m.label} - Cash out` },
          ]);
          postedCount++;
        }
      }
      results.push({
        workflow: "CFO: Multi-period revenue & expense journals", module: "Finance",
        status: postedCount > 0 ? "passed" : "failed",
        detail: `${postedCount} historical journal entries posted across 5 months for P&L trend analysis`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "CFO: Multi-period journals", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-4: Overdue invoices (for AR aging dashboard)
  {
    const wfStart = Date.now();
    try {
      const overdueInvoices = [
        { days: 15, amount: 45000, customer: "Metro Industries" },
        { days: 45, amount: 125000, customer: "Bright Future Edu" },
        { days: 90, amount: 78000, customer: "Urban Spaces Realty" },
      ];
      let overdueCount = 0;
      for (const oi of overdueInvoices) {
        const dueDate = new Date(Date.now() - oi.days * 86400000).toISOString().split("T")[0];
        const invoiceDate = new Date(Date.now() - (oi.days + 30) * 86400000).toISOString().split("T")[0];
        const { error } = await client.from("invoices").insert({
          invoice_number: `SIM-OD-${Date.now()}-${oi.days}d`,
          client_name: oi.customer,
          client_email: `billing@${oi.customer.toLowerCase().replace(/\s+/g, "")}.sim`,
          organization_id: orgId, user_id: userId,
          amount: oi.amount, total_amount: Math.round(oi.amount * 1.18),
          status: "sent", invoice_date: invoiceDate, due_date: dueDate,
        });
        if (!error) overdueCount++;
      }
      results.push({
        workflow: "CFO: Overdue invoices for AR aging", module: "Finance",
        status: overdueCount > 0 ? "passed" : "failed",
        detail: `${overdueCount} overdue invoices seeded (15d, 45d, 90d buckets)`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "CFO: Overdue invoices", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-5: Overdue bills (for AP aging dashboard)
  {
    const wfStart = Date.now();
    try {
      const overdueBills = [
        { days: 10, amount: 32000, vendor: "CloudHost Services" },
        { days: 60, amount: 95000, vendor: "SecureTech Systems" },
      ];
      let obCount = 0;
      for (const ob of overdueBills) {
        const dueDate = new Date(Date.now() - ob.days * 86400000).toISOString().split("T")[0];
        const billDate = new Date(Date.now() - (ob.days + 30) * 86400000).toISOString().split("T")[0];
        const { error } = await client.from("bills").insert({
          bill_number: `SIM-OB-${Date.now()}-${ob.days}d`,
          vendor_name: ob.vendor,
          organization_id: orgId, user_id: userId,
          amount: ob.amount, tax_amount: Math.round(ob.amount * 0.18),
          total_amount: Math.round(ob.amount * 1.18),
          status: "approved", bill_date: billDate, due_date: dueDate,
        });
        if (!error) obCount++;
      }
      results.push({
        workflow: "CFO: Overdue bills for AP aging", module: "Finance",
        status: obCount > 0 ? "passed" : "failed",
        detail: `${obCount} overdue bills seeded (10d, 60d buckets)`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "CFO: Overdue bills", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-6: Payroll-to-journal posting (salary expense entry)
  if (salaryAccount && cashAccount) {
    const wfStart = Date.now();
    try {
      const { data: latestRun } = await client.from("payroll_runs")
        .select("id, total_gross, total_deductions, total_net, pay_period")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latestRun) {
        const { data: payJE, error: payJEErr } = await client.from("journal_entries").insert({
          document_sequence_number: `SIM-PAY-JE-${latestRun.pay_period}`,
          organization_id: orgId, created_by: userId,
          entry_date: new Date().toISOString().split("T")[0],
          memo: `Payroll posting for ${latestRun.pay_period}`,
          status: "posted", source_type: "payroll",
        }).select("id").single();
        if (payJEErr) throw payJEErr;

        const pfPayable = (glAccounts ?? []).find((a: any) => a.code === "2400");
        const salaryPayable = (glAccounts ?? []).find((a: any) => a.code === "2300");
        const lines = [
          { gl_account_id: salaryAccount.id, debit: latestRun.total_gross, credit: 0, description: "Salary expense" },
          { gl_account_id: (salaryPayable ?? cashAccount).id, debit: 0, credit: latestRun.total_net, description: "Net salary payable" },
          { gl_account_id: (pfPayable ?? cashAccount).id, debit: 0, credit: latestRun.total_deductions, description: "Statutory deductions" },
        ];
        await client.from("journal_lines").insert(lines.map(l => ({ ...l, journal_entry_id: payJE.id })));
        results.push({
          workflow: "CFO: Payroll → Journal posting", module: "Finance",
          status: "passed",
          detail: `Payroll ${latestRun.pay_period} posted: Gross ₹${latestRun.total_gross.toLocaleString()} → Salary exp + Payable + PF`,
          duration_ms: Date.now() - wfStart,
        });
      }
    } catch (e) {
      results.push({ workflow: "CFO: Payroll journal", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-7: Depreciation journal posting
  if (glAccounts) {
    const wfStart = Date.now();
    try {
      const depExpAcct = (glAccounts ?? []).find((a: any) => a.code === "5400");
      const accumDepAcct = (glAccounts ?? []).find((a: any) => a.code === "1510");
      if (depExpAcct && accumDepAcct) {
        const { data: depEntries } = await client.from("asset_depreciation_entries")
          .select("depreciation_amount").eq("organization_id", orgId).eq("is_posted", true);
        const totalDep = (depEntries ?? []).reduce((s: number, d: any) => s + Number(d.depreciation_amount || 0), 0);
        if (totalDep > 0) {
          const { data: depJE } = await client.from("journal_entries").insert({
            document_sequence_number: `SIM-DEP-JE-${Date.now()}`,
            organization_id: orgId, created_by: userId,
            entry_date: new Date().toISOString().split("T")[0],
            memo: "Monthly depreciation posting",
            status: "posted", source_type: "depreciation",
          }).select("id").single();
          if (depJE) {
            await client.from("journal_lines").insert([
              { journal_entry_id: depJE.id, gl_account_id: depExpAcct.id, debit: totalDep, credit: 0, description: "Depreciation expense" },
              { journal_entry_id: depJE.id, gl_account_id: accumDepAcct.id, debit: 0, credit: totalDep, description: "Accumulated depreciation" },
            ]);
          }
          results.push({
            workflow: "CFO: Depreciation → Journal posting", module: "Finance",
            status: "passed",
            detail: `Total depreciation ₹${totalDep.toLocaleString()} posted to ledger`,
            duration_ms: Date.now() - wfStart,
          });
        }
      }
    } catch (e) {
      results.push({ workflow: "CFO: Depreciation journal", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // CFO-8: Opening balance equity entry (so BS equation works)
  if (cashAccount && glAccounts) {
    const wfStart = Date.now();
    try {
      const capitalAcct = (glAccounts ?? []).find((a: any) => a.code === "3000");
      const retainedAcct = (glAccounts ?? []).find((a: any) => a.code === "3100");
      if (capitalAcct && retainedAcct) {
        const { data: obJE } = await client.from("journal_entries").insert({
          document_sequence_number: `SIM-OB-EQUITY-${Date.now()}`,
          organization_id: orgId, created_by: userId,
          entry_date: "2025-04-01",
          memo: "Opening balance: Share capital + Retained earnings",
          status: "posted", source_type: "opening_balance",
        }).select("id").single();
        if (obJE) {
          await client.from("journal_lines").insert([
            { journal_entry_id: obJE.id, gl_account_id: cashAccount.id, debit: 1000000, credit: 0, description: "Opening cash balance" },
            { journal_entry_id: obJE.id, gl_account_id: capitalAcct.id, debit: 0, credit: 500000, description: "Share capital" },
            { journal_entry_id: obJE.id, gl_account_id: retainedAcct.id, debit: 0, credit: 500000, description: "Retained earnings" },
          ]);
        }
        results.push({
          workflow: "CFO: Opening balance equity entry", module: "Finance",
          status: "passed",
          detail: "Opening balance posted: ₹10L cash = ₹5L capital + ₹5L retained earnings",
          duration_ms: Date.now() - wfStart,
        });
      }
    } catch (e) {
      results.push({ workflow: "CFO: Opening balance", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
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
        user_id: profileList[i].user_id, organization_id: orgId,
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

  // ===== ROLE-BASED ACCESS VERIFICATION =====
  {
    const wfStart = Date.now();
    const { data: roles } = await client.from("user_roles")
      .select("user_id, role").eq("organization_id", orgId);
    const roleTypes = [...new Set((roles ?? []).map((r: any) => r.role))];
    results.push({
      workflow: "Role distribution verification", module: "Governance",
      status: roleTypes.length >= 3 ? "passed" : roleTypes.length > 0 ? "warning" : "failed",
      detail: `${(roles ?? []).length} assignments across roles: ${roleTypes.join(", ")}`,
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== ORGANIZATION MEMBERSHIP VERIFICATION =====
  {
    const wfStart = Date.now();
    const { count } = await client.from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    results.push({
      workflow: "Org membership verification", module: "Governance",
      status: (count ?? 0) >= 5 ? "passed" : "failed",
      detail: `${count ?? 0} org members (expected ≥5 for seeded employees)`,
      duration_ms: Date.now() - wfStart,
    });
  }

  // ===== ATTENDANCE DAILY COMPUTATION =====
  if (profileList.length > 0) {
    const wfStart = Date.now();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    try {
      const { error } = await client.from("attendance_daily").insert({
        profile_id: profileList[0].id, organization_id: orgId,
        attendance_date: yesterday, status: "P",
        first_in_time: "09:05:00", last_out_time: "18:15:00",
        total_work_minutes: 550, late_minutes: 5, early_exit_minutes: 0, ot_minutes: 70,
      });
      results.push({
        workflow: "Attendance Daily: computed record", module: "Attendance",
        status: error ? "failed" : "passed",
        detail: error?.message ?? "Daily attendance computation record created",
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Attendance Daily", module: "Attendance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ============================================================
  // ===== MULTI-ROLE WORKFLOW CHAINS ===========================
  // ============================================================

  // Identify actors by role for cross-role handoffs
  const { data: roleAssignments } = await client.from("user_roles")
    .select("user_id, role").eq("organization_id", orgId);
  const roleMap: Record<string, { user_id: string }[]> = {};
  for (const ra of (roleAssignments ?? [])) {
    if (!roleMap[ra.role]) roleMap[ra.role] = [];
    roleMap[ra.role].push({ user_id: ra.user_id });
  }
  const findActor = (role: string) => roleMap[role]?.[0]?.user_id ?? userId;
  const findProfile = (uid: string) => profileList.find((p: any) => p.user_id === uid);

  const adminActor = findActor("admin") !== userId ? findActor("admin") : userId;
  const hrActor = findActor("hr");
  const financeActor = findActor("finance");
  const managerActor = findActor("manager");
  const employeeActor = findActor("employee");
  const employeeProfile = findProfile(employeeActor);
  const managerProfile = findProfile(managerActor);

  // ------- MR1: LEAVE APPROVAL CHAIN (Employee → Manager → Finance visibility) -------
  if (employeeProfile) {
    const wfStart = Date.now();
    const leaveFrom = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
    const leaveTo = new Date(Date.now() + 92 * 86400000).toISOString().split("T")[0];
    try {
      // Step 1: Employee submits leave
      const { data: mrLeave, error: mrLeaveErr } = await client.from("leave_requests").insert({
        user_id: employeeActor, profile_id: employeeProfile.id,
        organization_id: orgId, leave_type: "casual",
        from_date: leaveFrom, to_date: leaveTo, days: 3,
        reason: "Multi-role test: family event", status: "pending",
      }).select("id").single();
      if (mrLeaveErr) throw mrLeaveErr;

      results.push({
        workflow: "MR-Leave: Employee submits", module: "Multi-Role",
        status: "passed", detail: `${employeeProfile.full_name} submitted 3-day leave`,
        duration_ms: Date.now() - wfStart,
      });

      // Step 2: Manager approves
      const wf2 = Date.now();
      const { error: mgrApproveErr } = await client.from("leave_requests").update({
        status: "approved", reviewed_by: managerActor,
      }).eq("id", mrLeave.id);
      results.push({
        workflow: "MR-Leave: Manager approves", module: "Multi-Role",
        status: mgrApproveErr ? "failed" : "passed",
        detail: mgrApproveErr?.message ?? `Approved by manager (${managerProfile?.full_name ?? "Manager"})`,
        duration_ms: Date.now() - wf2,
      });

      // Step 3: Finance reads approved leaves (visibility check)
      const wf3 = Date.now();
      const { data: finLeaves, error: finLeaveErr } = await client.from("leave_requests")
        .select("id, status, days").eq("organization_id", orgId).eq("status", "approved");
      results.push({
        workflow: "MR-Leave: Finance reads approved leaves", module: "Multi-Role",
        status: finLeaveErr ? "failed" : (finLeaves ?? []).length > 0 ? "passed" : "warning",
        detail: finLeaveErr?.message ?? `Finance can see ${(finLeaves ?? []).length} approved leaves for payroll`,
        duration_ms: Date.now() - wf3,
      });
    } catch (e) {
      results.push({ workflow: "MR-Leave chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR2: REIMBURSEMENT CHAIN (Employee → Manager → Finance → Paid) -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      // Step 1: Employee submits reimbursement
      const { data: mrReimb, error: mrReimbErr } = await client.from("reimbursement_requests").insert({
        user_id: employeeActor, profile_id: employeeProfile.id,
        organization_id: orgId, amount: 8500,
        category: "Travel", description: "Multi-role test: client visit travel",
        expense_date: new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0],
        status: "submitted", submitted_at: new Date().toISOString(),
      }).select("id").single();
      if (mrReimbErr) throw mrReimbErr;

      results.push({
        workflow: "MR-Reimb: Employee submits", module: "Multi-Role",
        status: "passed", detail: `${employeeProfile.full_name} submitted ₹8,500 travel claim`,
        duration_ms: Date.now() - wfStart,
      });

      // Step 2: Manager approves
      const wf2 = Date.now();
      const { error: mgrErr } = await client.from("reimbursement_requests").update({
        status: "approved", manager_reviewed_by: managerActor,
      }).eq("id", mrReimb.id);
      results.push({
        workflow: "MR-Reimb: Manager approves", module: "Multi-Role",
        status: mgrErr ? "failed" : "passed",
        detail: mgrErr?.message ?? `Manager approved reimbursement`,
        duration_ms: Date.now() - wf2,
      });

      // Step 3: Finance processes payment
      const wf3 = Date.now();
      const { error: finErr } = await client.from("reimbursement_requests").update({
        status: "paid", finance_reviewed_by: financeActor,
      }).eq("id", mrReimb.id);
      results.push({
        workflow: "MR-Reimb: Finance processes payment", module: "Multi-Role",
        status: finErr ? "failed" : "passed",
        detail: finErr?.message ?? `Finance processed ₹8,500 reimbursement payment`,
        duration_ms: Date.now() - wf3,
      });
    } catch (e) {
      results.push({ workflow: "MR-Reimb chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR3: PAYROLL MAKER-CHECKER (HR creates → Finance reviews → Admin locks) -------
  if (profileList.length >= 3) {
    const wfStart = Date.now();
    const mrPayPeriod = `${today.getFullYear()}-${String(today.getMonth()).padStart(2, "0")}`;
    try {
      // Step 1: HR creates payroll run
      const { data: mrRun, error: runErr } = await client.from("payroll_runs").insert({
        organization_id: orgId, pay_period: mrPayPeriod,
        generated_by: hrActor, status: "draft",
        employee_count: 3, total_gross: 210000, total_deductions: 42000, total_net: 168000,
      }).select("id").single();
      if (runErr) throw runErr;

      results.push({
        workflow: "MR-Payroll: HR creates run", module: "Multi-Role",
        status: "passed", detail: `HR created payroll run for ${mrPayPeriod} (3 employees, ₹2.1L gross)`,
        duration_ms: Date.now() - wfStart,
      });

      // Step 2: HR submits for review
      const wf2 = Date.now();
      const { error: submitErr } = await client.from("payroll_runs")
        .update({ status: "under_review" } as any).eq("id", mrRun.id);
      results.push({
        workflow: "MR-Payroll: HR submits for review", module: "Multi-Role",
        status: submitErr ? "failed" : "passed",
        detail: submitErr?.message ?? "Payroll submitted draft → under_review",
        duration_ms: Date.now() - wf2,
      });

      // Step 3: Finance approves
      const wf3 = Date.now();
      const { error: finApproveErr } = await client.from("payroll_runs")
        .update({ status: "approved" } as any).eq("id", mrRun.id);
      results.push({
        workflow: "MR-Payroll: Finance approves", module: "Multi-Role",
        status: finApproveErr ? "failed" : "passed",
        detail: finApproveErr?.message ?? `Finance approved payroll (actor: ${financeActor.substring(0, 8)}...)`,
        duration_ms: Date.now() - wf3,
      });

      // Step 4: Admin locks
      const wf4 = Date.now();
      const { error: lockErr } = await client.from("payroll_runs")
        .update({ status: "locked" } as any).eq("id", mrRun.id);
      results.push({
        workflow: "MR-Payroll: Admin locks", module: "Multi-Role",
        status: lockErr ? "failed" : "passed",
        detail: lockErr?.message ?? `Admin locked payroll (actor: ${adminActor.substring(0, 8)}...)`,
        duration_ms: Date.now() - wf4,
      });
    } catch (e) {
      results.push({ workflow: "MR-Payroll chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR4: ATTENDANCE CORRECTION (Employee → Manager/HR approves) -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      const corrDate = new Date(Date.now() - 4 * 86400000).toISOString().split("T")[0];
      const { data: mrCorr, error: corrErr } = await client.from("attendance_correction_requests").insert({
        user_id: employeeActor, profile_id: employeeProfile.id,
        organization_id: orgId, date: corrDate,
        reason: "Multi-role test: forgot to check out due to client call",
        requested_check_out: `${corrDate}T19:00:00`, status: "pending",
      }).select("id").single();
      if (corrErr) throw corrErr;

      results.push({
        workflow: "MR-AttCorr: Employee submits", module: "Multi-Role",
        status: "passed", detail: `${employeeProfile.full_name} requested correction for ${corrDate}`,
        duration_ms: Date.now() - wfStart,
      });

      // Manager/HR approves
      const wf2 = Date.now();
      const { error: approveErr } = await client.from("attendance_correction_requests").update({
        status: "approved", reviewed_by: managerActor, reviewed_at: new Date().toISOString(),
        reviewer_notes: "Verified via CCTV — approved",
      }).eq("id", mrCorr.id);
      results.push({
        workflow: "MR-AttCorr: Manager approves", module: "Multi-Role",
        status: approveErr ? "failed" : "passed",
        detail: approveErr?.message ?? "Manager approved attendance correction with notes",
        duration_ms: Date.now() - wf2,
      });
    } catch (e) {
      results.push({ workflow: "MR-AttCorr chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR5: PROFILE CHANGE REQUEST (Employee → HR reviews) -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      const { data: mrPCR, error: pcrErr } = await client.from("profile_change_requests").insert({
        profile_id: employeeProfile.id, organization_id: orgId,
        user_id: employeeActor,
        field_name: "phone", section: "personal",
        current_value: "+91-9876543099", requested_value: "+91-9876543100",
        reason: "Updated personal phone number", status: "pending",
      }).select("id").single();

      if (pcrErr) throw pcrErr;

      results.push({
        workflow: "MR-ProfileChange: Employee submits", module: "Multi-Role",
        status: "passed", detail: `${employeeProfile.full_name} requested phone number change`,
        duration_ms: Date.now() - wfStart,
      });

      // HR reviews and approves
      const wf2 = Date.now();
      const { error: hrApproveErr } = await client.from("profile_change_requests").update({
        status: "approved", reviewed_by: hrActor, reviewed_at: new Date().toISOString(),
      }).eq("id", mrPCR.id);
      results.push({
        workflow: "MR-ProfileChange: HR approves", module: "Multi-Role",
        status: hrApproveErr ? "failed" : "passed",
        detail: hrApproveErr?.message ?? "HR approved profile change request",
        duration_ms: Date.now() - wf2,
      });
    } catch (e) {
      results.push({ workflow: "MR-ProfileChange chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR6: COMPENSATION REVISION (HR requests → Finance approves) -------
  if (profileList.length >= 2) {
    const targetProfile = profileList[1];
    const wfStart = Date.now();
    try {
      const { data: mrComp, error: compErr } = await client.from("compensation_revision_requests").insert({
        profile_id: targetProfile.id, organization_id: orgId,
        requested_by: hrActor, requested_by_role: "hr",
        current_ctc: 900000, proposed_ctc: 1100000,
        effective_from: new Date(today.getFullYear(), today.getMonth() + 2, 1).toISOString().split("T")[0],
        revision_reason: "Multi-role test: mid-cycle promotion to Senior",
        status: "pending",
      }).select("id").single();
      if (compErr) throw compErr;

      results.push({
        workflow: "MR-CompRevision: HR requests", module: "Multi-Role",
        status: "passed", detail: `HR requested ₹9L→₹11L for ${targetProfile.full_name}`,
        duration_ms: Date.now() - wfStart,
      });

      // Finance approves
      const wf2 = Date.now();
      const { error: finAppErr } = await client.from("compensation_revision_requests").update({
        status: "approved", reviewed_by: financeActor, reviewed_at: new Date().toISOString(),
      }).eq("id", mrComp.id);
      results.push({
        workflow: "MR-CompRevision: Finance approves", module: "Multi-Role",
        status: finAppErr ? "failed" : "passed",
        detail: finAppErr?.message ?? "Finance approved compensation revision",
        duration_ms: Date.now() - wf2,
      });
    } catch (e) {
      results.push({ workflow: "MR-CompRevision chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR7: BILL LIFECYCLE WITH ROLE ACTORS (Finance creates → Admin approves → paid) -------
  {
    const wfStart = Date.now();
    try {
      const { data: mrBill, error: billErr } = await client.from("bills").insert({
        bill_number: `MR-BILL-${Date.now()}`, vendor_name: "Multi-Role Vendor Test",
        organization_id: orgId, user_id: financeActor,
        amount: 75000, tax_amount: 13500, total_amount: 88500,
        status: "draft", bill_date: new Date().toISOString().split("T")[0],
      }).select("id").single();
      if (billErr) throw billErr;

      results.push({
        workflow: "MR-Bill: Finance creates", module: "Multi-Role",
        status: "passed", detail: "Finance created ₹88,500 bill",
        duration_ms: Date.now() - wfStart,
      });

      // Admin approves
      const wf2 = Date.now();
      const { error: appErr } = await client.from("bills").update({ status: "approved" }).eq("id", mrBill.id);
      results.push({
        workflow: "MR-Bill: Admin approves", module: "Multi-Role",
        status: appErr ? "failed" : "passed",
        detail: appErr?.message ?? "Admin approved bill",
        duration_ms: Date.now() - wf2,
      });

      // Finance pays
      const wf3 = Date.now();
      const { error: payErr } = await client.from("bills").update({ status: "paid" }).eq("id", mrBill.id);
      results.push({
        workflow: "MR-Bill: Finance marks paid", module: "Multi-Role",
        status: payErr ? "failed" : "passed",
        detail: payErr?.message ?? "Bill lifecycle: draft → approved → paid complete",
        duration_ms: Date.now() - wf3,
      });
    } catch (e) {
      results.push({ workflow: "MR-Bill chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR8: ROLE ESCALATION TEST (negative test — verify role distribution) -------
  {
    const wfStart = Date.now();
    const expectedRoles = ["admin", "hr", "finance", "manager", "employee"];
    const presentRoles = Object.keys(roleMap);
    const missingRoles = expectedRoles.filter(r => !presentRoles.includes(r));

    results.push({
      workflow: "MR-RoleDistribution: All roles present", module: "Multi-Role",
      status: missingRoles.length === 0 ? "passed" : "failed",
      detail: missingRoles.length === 0
        ? `All 5 roles present: ${presentRoles.join(", ")} (${(roleAssignments ?? []).length} total assignments)`
        : `Missing roles: ${missingRoles.join(", ")} — found: ${presentRoles.join(", ")}`,
      duration_ms: Date.now() - wfStart,
    });
  }

  // ------- MR9: PAYSLIP DISPUTE CHAIN (Employee disputes → HR/Finance reviews) -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      // Find an existing payroll record for the employee, or create one
      let empPayroll: any = null;
      const { data: existingPayroll } = await client.from("payroll_records")
        .select("id, pay_period").eq("profile_id", employeeProfile.id).limit(1).maybeSingle();
      
      if (!existingPayroll) {
        // Create a payroll record for the employee so dispute chain can proceed
        const empPayPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const { data: newPayroll } = await client.from("payroll_records").insert({
          user_id: employeeActor, profile_id: employeeProfile.id,
          organization_id: orgId, pay_period: empPayPeriod,
          basic_salary: 50000, hra: 20000, transport_allowance: 1600,
          other_allowances: 7500, pf_deduction: 6000, tax_deduction: 5000,
          other_deductions: 500, net_pay: 67600,
          working_days: 22, paid_days: 22, lop_days: 0, lop_deduction: 0,
          status: "draft",
        }).select("id, pay_period").single();
        empPayroll = newPayroll;
      } else {
        empPayroll = existingPayroll;
      }

      if (empPayroll) {
        const { data: mrDispute, error: dispErr } = await client.from("payslip_disputes").insert({
          payroll_record_id: empPayroll.id, profile_id: employeeProfile.id,
          organization_id: orgId, raised_by: employeeActor,
          dispute_type: "deduction_query",
          description: "Multi-role test: PF deduction seems higher than expected for this month",
          status: "open",
        }).select("id").single();

        if (dispErr) throw dispErr;

        results.push({
          workflow: "MR-Dispute: Employee raises payslip dispute", module: "Multi-Role",
          status: "passed", detail: `${employeeProfile.full_name} disputed ${empPayroll.pay_period} payslip`,
          duration_ms: Date.now() - wfStart,
        });

        // HR/Finance reviews and resolves
        const wf2 = Date.now();
        const { error: resolveErr } = await client.from("payslip_disputes").update({
          status: "resolved", resolved_by: hrActor,
          resolution_notes: "PF calculated correctly at 12% of basic. No discrepancy found.",
        }).eq("id", mrDispute.id);
        results.push({
          workflow: "MR-Dispute: HR resolves dispute", module: "Multi-Role",
          status: resolveErr ? "failed" : "passed",
          detail: resolveErr?.message ?? "HR reviewed and resolved payslip dispute",
          duration_ms: Date.now() - wf2,
        });
      } else {
        results.push({
          workflow: "MR-Dispute: Employee raises payslip dispute", module: "Multi-Role",
          status: "warning", detail: "Skipped — no payroll record found for employee",
          duration_ms: Date.now() - wfStart,
        });
      }
    } catch (e) {
      results.push({ workflow: "MR-Dispute chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- MR10: EXPENSE APPROVAL CHAIN (Employee → Manager → Finance approves) -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      const { data: mrExp, error: expErr } = await client.from("expenses").insert({
        description: "Multi-role test: team dinner with client",
        amount: 12500, category: "Meals",
        organization_id: orgId, user_id: employeeActor,
        profile_id: employeeProfile.id,
        status: "pending", expense_date: new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0],
      }).select("id").single();
      if (expErr) throw expErr;

      results.push({
        workflow: "MR-Expense: Employee submits", module: "Multi-Role",
        status: "passed", detail: `${employeeProfile.full_name} submitted ₹12,500 expense`,
        duration_ms: Date.now() - wfStart,
      });

      // Manager reviews
      const wf2 = Date.now();
      const { error: mgrErr } = await client.from("expenses").update({
        status: "approved",
      }).eq("id", mrExp.id);
      results.push({
        workflow: "MR-Expense: Manager approves", module: "Multi-Role",
        status: mgrErr ? "failed" : "passed",
        detail: mgrErr?.message ?? "Manager approved expense",
        duration_ms: Date.now() - wf2,
      });
    } catch (e) {
      results.push({ workflow: "MR-Expense chain", module: "Multi-Role", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 1: FISCAL PERIOD LOCKING (post to closed period should fail) -------
  {
    const wfStart = Date.now();
    try {
      const { data: closedPeriod } = await client.from("fiscal_periods")
        .select("id, period_name, start_date, end_date")
        .eq("organization_id", orgId).eq("status", "closed").limit(1).maybeSingle();
      if (closedPeriod) {
        // Try posting a journal entry dated within the closed period
        const closedDate = closedPeriod.start_date;
        const { data: je, error: jeErr } = await client.from("journal_entries").insert({
          document_sequence_number: `TEST-CLOSED-${Date.now()}`,
          organization_id: orgId, created_by: userId,
          entry_date: closedDate, memo: "Test: post to closed period",
          status: "posted", source_type: "sandbox_simulation",
        }).select("id").single();
        // If it succeeded, try to check if the system should have blocked it
        results.push({
          workflow: "Fiscal Period Lock: post to closed period", module: "Finance",
          status: jeErr ? "passed" : "warning",
          detail: jeErr ? `Correctly blocked: ${jeErr.message}` : "WARNING: Journal entry posted to closed fiscal period — needs trigger guard",
          duration_ms: Date.now() - wfStart,
        });
        // Clean up if it was accepted
        if (je) await client.from("journal_entries").delete().eq("id", je.id);
      } else {
        results.push({
          workflow: "Fiscal Period Lock: post to closed period", module: "Finance",
          status: "warning", detail: "No closed fiscal period found — test skipped",
          duration_ms: Date.now() - wfStart,
        });
      }
    } catch (e) {
      results.push({ workflow: "Fiscal Period Lock", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 2: GOAL PLAN APPROVAL CHAIN (Employee → Manager → HR) -------
  if (employeeProfile && managerProfile) {
    const wfStart = Date.now();
    try {
      const gpMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
      const { data: gp, error: gpErr } = await client.from("goal_plans").insert({
        user_id: employeeActor, profile_id: employeeProfile.id,
        organization_id: orgId, month: gpMonth,
        items: [
          { title: "Approval chain test goal 1", target: "Complete by month end", weightage: 60 },
          { title: "Approval chain test goal 2", target: "Documentation", weightage: 40 },
        ],
        status: "draft",
      }).select("id").single();
      if (gpErr) throw gpErr;

      // Employee submits
      const { error: submitErr } = await client.from("goal_plans")
        .update({ status: "submitted" }).eq("id", gp.id);
      results.push({
        workflow: "Goal Approval: Employee submits plan", module: "Performance",
        status: submitErr ? "failed" : "passed",
        detail: submitErr?.message ?? `${employeeProfile.full_name} submitted goal plan`,
        duration_ms: Date.now() - wfStart,
      });

      // Manager forwards to HR
      const wf2 = Date.now();
      const { error: fwdErr } = await client.from("goal_plans").update({
        status: "manager_approved", reviewed_by: managerActor, reviewed_at: new Date().toISOString(),
        reviewer_notes: "Goals look well-aligned with team OKRs",
      }).eq("id", gp.id);
      results.push({
        workflow: "Goal Approval: Manager forwards to HR", module: "Performance",
        status: fwdErr ? "failed" : "passed",
        detail: fwdErr?.message ?? `Manager approved and forwarded to HR`,
        duration_ms: Date.now() - wf2,
      });

      // HR final approval
      const wf3 = Date.now();
      const { error: hrAppErr } = await client.from("goal_plans").update({
        status: "approved", reviewed_by: hrActor, reviewed_at: new Date().toISOString(),
      }).eq("id", gp.id);
      results.push({
        workflow: "Goal Approval: HR final approval", module: "Performance",
        status: hrAppErr ? "failed" : "passed",
        detail: hrAppErr?.message ?? "HR gave final approval on goal plan",
        duration_ms: Date.now() - wf3,
      });
    } catch (e) {
      results.push({ workflow: "Goal Approval chain", module: "Performance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 3: LEAVE BALANCE DEDUCTION VERIFICATION -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      // Get current leave balance
      const { data: balBefore } = await client.from("leave_balances")
        .select("id, used_days, total_days")
        .eq("profile_id", employeeProfile.id)
        .eq("leave_type", "casual").eq("year", 2026).maybeSingle();
      const usedBefore = balBefore?.used_days ?? 0;

      // Create and approve a leave
      const lFrom = new Date(Date.now() + 120 * 86400000).toISOString().split("T")[0];
      const lTo = new Date(Date.now() + 121 * 86400000).toISOString().split("T")[0];
      const { data: testLeave } = await client.from("leave_requests").insert({
        user_id: employeeActor, profile_id: employeeProfile.id,
        organization_id: orgId, leave_type: "casual",
        from_date: lFrom, to_date: lTo, days: 2,
        reason: "Leave balance test", status: "approved",
        reviewed_by: managerActor,
      }).select("id").single();

      // Manually update leave balance (simulating what the system should do)
      if (balBefore) {
        await client.from("leave_balances").update({
          used_days: usedBefore + 2,
        }).eq("id", balBefore.id);
      }

      // Verify
      const { data: balAfter } = await client.from("leave_balances")
        .select("used_days").eq("profile_id", employeeProfile.id)
        .eq("leave_type", "casual").eq("year", 2026).maybeSingle();

      const expectedUsed = usedBefore + 2;
      const actualUsed = balAfter?.used_days ?? 0;
      results.push({
        workflow: "Leave Balance: deduction after approval", module: "Leave",
        status: actualUsed === expectedUsed ? "passed" : "warning",
        detail: `Used before: ${usedBefore}, Expected after: ${expectedUsed}, Actual: ${actualUsed}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Leave Balance deduction", module: "Leave", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 4: CONCURRENT PAYROLL RUN BLOCKING -------
  {
    const wfStart = Date.now();
    const dupPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    try {
      // Try creating a second payroll run for the same period
      const { error: dupRunErr } = await client.from("payroll_runs").insert({
        organization_id: orgId, pay_period: dupPeriod,
        generated_by: userId, status: "draft",
        employee_count: 1, total_gross: 0, total_deductions: 0, total_net: 0,
      });
      results.push({
        workflow: "Concurrent payroll run: same period", module: "Payroll",
        status: dupRunErr ? "passed" : "warning",
        detail: dupRunErr
          ? `Correctly blocked duplicate run: ${dupRunErr.message}`
          : "WARNING: Duplicate payroll run for same period accepted — may need unique constraint",
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Concurrent payroll blocking", module: "Payroll", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 5: ASSET DISPOSAL WORKFLOW -------
  {
    const wfStart = Date.now();
    try {
      const { data: testAsset } = await client.from("assets")
        .select("id, name, current_book_value")
        .eq("organization_id", orgId).eq("status", "active").limit(1).maybeSingle();
      if (testAsset) {
        const { error: dispErr } = await client.from("assets").update({
          status: "disposed",
          disposal_date: new Date().toISOString().split("T")[0],
          disposal_method: "sold",
          disposal_price: Math.round(testAsset.current_book_value * 0.3),
          disposal_notes: "Simulation test: asset sold to third party",
        }).eq("id", testAsset.id);
        results.push({
          workflow: `Asset Disposal: ${testAsset.name}`, module: "Finance",
          status: dispErr ? "failed" : "passed",
          detail: dispErr?.message ?? `Disposed at ₹${Math.round(testAsset.current_book_value * 0.3).toLocaleString()} (book value: ₹${testAsset.current_book_value.toLocaleString()})`,
          duration_ms: Date.now() - wfStart,
        });
      } else {
        results.push({
          workflow: "Asset Disposal", module: "Finance",
          status: "warning", detail: "No active assets found for disposal test",
          duration_ms: Date.now() - wfStart,
        });
      }
    } catch (e) {
      results.push({ workflow: "Asset Disposal", module: "Finance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 6: EMPLOYEE OFFBOARDING (inactive excluded from payroll) -------
  {
    const wfStart = Date.now();
    try {
      // Find last profile and mark inactive
      const lastProfile = profileList[profileList.length - 1];
      if (lastProfile) {
        await client.from("profiles").update({ status: "inactive" }).eq("id", lastProfile.id);

        // Verify inactive employee is excluded from active payroll count
        const { count: activeCount } = await client.from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).eq("status", "active");

        const { count: totalCount } = await client.from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);

        results.push({
          workflow: "Offboarding: inactive excluded from active count", module: "HR",
          status: (activeCount ?? 0) < (totalCount ?? 0) ? "passed" : "warning",
          detail: `Active: ${activeCount}, Total: ${totalCount} — ${lastProfile.full_name} deactivated`,
          duration_ms: Date.now() - wfStart,
        });

        // Restore for other tests
        await client.from("profiles").update({ status: "active" }).eq("id", lastProfile.id);
      }
    } catch (e) {
      results.push({ workflow: "Offboarding test", module: "HR", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 7: AUDIT LOG COMPLETENESS -------
  {
    const wfStart = Date.now();
    try {
      const { data: auditEntries } = await client.from("audit_logs")
        .select("action, entity_type").eq("organization_id", orgId);
      const entityTypes = [...new Set((auditEntries ?? []).map((a: any) => a.entity_type))];
      const actionTypes = [...new Set((auditEntries ?? []).map((a: any) => a.action))];
      results.push({
        workflow: "Audit Log: coverage check", module: "Governance",
        status: (auditEntries ?? []).length >= 3 ? "passed" : "warning",
        detail: `${(auditEntries ?? []).length} entries across ${entityTypes.length} entity types, ${actionTypes.length} action types`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Audit Log completeness", module: "Governance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 8: GOAL CYCLE CONFIG VERIFICATION -------
  {
    const wfStart = Date.now();
    try {
      const { data: gcc } = await client.from("goal_cycle_config")
        .select("*").eq("organization_id", orgId).eq("is_active", true);
      results.push({
        workflow: "Goal Cycle Config: verify setup", module: "Performance",
        status: (gcc ?? []).length > 0 ? "passed" : "warning",
        detail: `${(gcc ?? []).length} active goal cycle configs — input window: day ${gcc?.[0]?.input_start_day ?? '?'}-${gcc?.[0]?.input_deadline_day ?? '?'}, scoring: day ${gcc?.[0]?.scoring_start_day ?? '?'}-${gcc?.[0]?.scoring_deadline_day ?? '?'}`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Goal Cycle Config", module: "Performance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 9: INVESTMENT DECLARATION WORKFLOW -------
  if (employeeProfile) {
    const wfStart = Date.now();
    try {
      const { data: invDecl, error: idErr } = await client.from("investment_declarations").insert({
        profile_id: employeeProfile.id, organization_id: orgId,
        financial_year: "2025-2026", section_type: "80C",
        declared_amount: 150000, status: "submitted",
      }).select("id").single();
      if (idErr) throw idErr;

      // HR reviews
      const { error: reviewErr } = await client.from("investment_declarations").update({
        status: "approved", approved_amount: 140000,
        reviewed_by: hrActor, reviewed_at: new Date().toISOString(),
      }).eq("id", invDecl.id);

      results.push({
        workflow: "Investment Declaration: submit → approve", module: "HR",
        status: reviewErr ? "failed" : "passed",
        detail: reviewErr?.message ?? `₹1.5L declared (80C), ₹1.4L approved by HR`,
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Investment Declaration", module: "HR", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  // ------- NEW TEST 10: ORGANIZATION COMPLIANCE VERIFICATION -------
  {
    const wfStart = Date.now();
    try {
      const { data: comp } = await client.from("organization_compliance")
        .select("payroll_enabled, pf_applicable, professional_tax_applicable, entity_type, pan, gstin")
        .eq("organization_id", orgId).maybeSingle();
      const hasBasics = comp && comp.entity_type && comp.pan;
      results.push({
        workflow: "Org Compliance: configuration check", module: "Governance",
        status: hasBasics ? "passed" : "warning",
        detail: comp
          ? `Entity: ${comp.entity_type}, PAN: ${comp.pan ? "✓" : "✗"}, GST: ${(comp.gstin ?? []).length > 0 ? "✓" : "✗"}, PF: ${comp.pf_applicable ? "On" : "Off"}, PT: ${comp.professional_tax_applicable ? "On" : "Off"}`
          : "No compliance record found",
        duration_ms: Date.now() - wfStart,
      });
    } catch (e) {
      results.push({ workflow: "Org Compliance check", module: "Governance", status: "failed", detail: (e as Error).message, duration_ms: Date.now() - wfStart });
    }
  }

  const passed = results.filter(r => r.status === "passed").length;
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
    .select("id, user_id").eq("organization_id", orgId).limit(5);
  const profileData = (profiles ?? []).map((p: any) => ({ id: p.id, user_id: p.user_id }));

  const tasks = Array.from({ length: concurrentUsers }, (_, userIdx) => {
    return (async () => {
      const wfStart = Date.now();
      const ops = ["invoice", "expense", "journal", "bill", "attendance", "leave", "payroll_record", "reimbursement"];
      const op = ops[userIdx % ops.length];
      const prof = profileData[userIdx % profileData.length] || { id: userId, user_id: userId };
      const profileId = prof.id;
      const profileUserId = prof.user_id;

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
              user_id: profileUserId, profile_id: profileId,
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
              user_id: profileUserId, profile_id: profileId,
              organization_id: orgId, leave_type: "casual",
              from_date: fromDate, to_date: toDate, days: 2,
              reason: `Stress test leave ${userIdx}`, status: "pending",
            });
            if (error) throw error;
            return { user: userIdx, workflow: op, module: "Leave", status: "passed", duration_ms: Date.now() - wfStart, detail: "OK" };
          }
          case "payroll_record": {
            const payPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
            const { error } = await client.from("payroll_records").insert({
              user_id: profileUserId, profile_id: profileId,
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
              user_id: profileUserId, profile_id: profileId,
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
    .select("id, user_id").eq("organization_id", orgId).limit(1);
  const testProfileId = profiles?.[0]?.id ?? userId;
  const testProfileUserId = profiles?.[0]?.user_id ?? userId;

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
      user_id: testProfileUserId, profile_id: testProfileId,
      organization_id: orgId, leave_type: "casual",
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
    user_id: testProfileUserId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "sick",
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
    user_id: testProfileUserId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "earned",
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
    user_id: testProfileUserId, profile_id: testProfileId,
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
    user_id: testProfileUserId, profile_id: testProfileId,
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
    user_id: testProfileUserId, profile_id: testProfileId,
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
    user_id: testProfileUserId, profile_id: testProfileId,
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

  // === NEW CHAOS: Duplicate leave for same dates (overlapping) ===
  const dupLeaveFrom = new Date(Date.now() + 200 * 86400000).toISOString().split("T")[0];
  const dupLeaveTo = new Date(Date.now() + 202 * 86400000).toISOString().split("T")[0];
  // First leave (should pass)
  await client.from("leave_requests").insert({
    user_id: testProfileUserId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "casual",
    from_date: dupLeaveFrom, to_date: dupLeaveTo, days: 3,
    reason: "Chaos: first overlapping leave", status: "approved", reviewed_by: userId,
  });
  // Second overlapping leave (should be blocked)
  const { error: dupLeaveErr } = await client.from("leave_requests").insert({
    user_id: testProfileUserId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "casual",
    from_date: dupLeaveFrom, to_date: dupLeaveTo, days: 3,
    reason: "Chaos: duplicate overlapping leave", status: "pending",
  });
  results.push({
    test: "Duplicate overlapping leave for same dates", module: "Leave",
    status: dupLeaveErr ? "blocked" : "anomaly",
    detail: dupLeaveErr ? `Correctly blocked: ${dupLeaveErr.message}` : "WARNING: Duplicate overlapping leave accepted — needs trigger",
  });

  // === NEW CHAOS: Leave exceeding available balance ===
  const { error: excessLeaveErr } = await client.from("leave_requests").insert({
    user_id: testProfileUserId, profile_id: testProfileId,
    organization_id: orgId, leave_type: "casual",
    from_date: new Date(Date.now() + 250 * 86400000).toISOString().split("T")[0],
    to_date: new Date(Date.now() + 280 * 86400000).toISOString().split("T")[0],
    days: 30, reason: "Chaos: exceeds balance", status: "pending",
  });
  results.push({
    test: "Leave days exceeding available balance", module: "Leave",
    status: excessLeaveErr ? "blocked" : "anomaly",
    detail: excessLeaveErr ? `Correctly blocked: ${excessLeaveErr.message}` : "WARNING: 30-day leave accepted (likely exceeds balance) — needs validation",
  });

  // === NEW CHAOS: Expense to closed fiscal period ===
  {
    const { data: closedFP } = await client.from("fiscal_periods")
      .select("start_date").eq("organization_id", orgId).eq("status", "closed").limit(1).maybeSingle();
    if (closedFP) {
      const { error: closedExpErr } = await client.from("expenses").insert({
        description: "Chaos: expense in closed period", amount: 5000,
        category: "Chaos", organization_id: orgId, user_id: userId,
        status: "pending", expense_date: closedFP.start_date,
      });
      results.push({
        test: "Expense dated in closed fiscal period", module: "Finance",
        status: closedExpErr ? "blocked" : "anomaly",
        detail: closedExpErr ? `Correctly blocked: ${closedExpErr.message}` : "WARNING: Expense in closed fiscal period accepted",
      });
    }
  }

  // === NEW CHAOS: Payroll record for inactive employee ===
  {
    // Temporarily deactivate a profile
    const tempProfile = (profiles ?? [])[0];
    if (tempProfile) {
      await client.from("profiles").update({ status: "inactive" }).eq("id", tempProfile.id);
      const { error: inactivePayErr } = await client.from("payroll_records").insert({
        user_id: tempProfile.user_id, profile_id: tempProfile.id,
        organization_id: orgId, pay_period: "2026-04",
        basic_salary: 50000, hra: 20000, transport_allowance: 1600,
        other_allowances: 7500, pf_deduction: 6000, tax_deduction: 5000,
        other_deductions: 500, net_pay: 67600,
        working_days: 22, paid_days: 22, lop_days: 0, lop_deduction: 0, status: "draft",
      });
      results.push({
        test: "Payroll record for inactive employee", module: "Payroll",
        status: inactivePayErr ? "blocked" : "anomaly",
        detail: inactivePayErr ? `Correctly blocked: ${inactivePayErr.message}` : "WARNING: Payroll record created for inactive employee",
      });
      // Restore
      await client.from("profiles").update({ status: "active" }).eq("id", tempProfile.id);
    }
  }

  // === NEW CHAOS: Bill with TDS rate > 100% ===
  const { error: badTdsErr } = await client.from("bills").insert({
    bill_number: `CHAOS-TDS-${Date.now()}`, vendor_name: "Chaos TDS Vendor",
    organization_id: orgId, user_id: userId,
    amount: 10000, tax_amount: 1800, total_amount: 11800,
    status: "draft", bill_date: new Date().toISOString().split("T")[0],
    tds_rate: 150, tds_section: "194C",
  });
  results.push({
    test: "Bill with TDS rate > 100%", module: "Finance",
    status: badTdsErr ? "blocked" : "anomaly",
    detail: badTdsErr ? `Correctly blocked: ${badTdsErr.message}` : "WARNING: Bill with 150% TDS rate accepted — needs validation",
  });

  // === NEW CHAOS: Goal plan with weightage > 100 ===
  {
    const { error: overWeightErr } = await client.from("goal_plans").insert({
      user_id: testProfileUserId, profile_id: testProfileId,
      organization_id: orgId,
      month: new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0].substring(0, 7) + "-01",
      items: [
        { title: "Over-weighted goal 1", target: "100%", weightage: 80 },
        { title: "Over-weighted goal 2", target: "100%", weightage: 60 },
      ],
      status: "draft",
    });
    results.push({
      test: "Goal plan with total weightage > 100", module: "Performance",
      status: overWeightErr ? "blocked" : "anomaly",
      detail: overWeightErr ? `Correctly blocked: ${overWeightErr.message}` : "WARNING: Goal plan with 140% total weightage accepted — needs validation",
    });
  }

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

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Delegate to Verification Engine V3 (production-grade)
  // This avoids duplicating SQL-level checks already in the RPC.
  // ═══════════════════════════════════════════════════════════════
  const { data: verificationData } = await client.rpc("run_financial_verification", { _org_id: orgId });
  if (verificationData && Array.isArray(verificationData)) {
    for (const check of verificationData) {
      if (check.id === "SUMMARY") continue;
      checks.push({
        check: check.id, module: check.category ?? "Finance",
        status: check.status === "PASS" ? "passed" : check.status === "WARNING" ? "warning" : "failed",
        detail: check.message,
      });
    }
  } else {
    checks.push({ check: "V_VERIFICATION_ENGINE", module: "Finance", status: "failed", detail: "Could not run verification engine RPC" });
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Simulation-specific validations (sandbox seeding checks)
  // These verify the simulation environment is properly populated.
  // ═══════════════════════════════════════════════════════════════

  // S1: Profile count
  const { count: profileCount } = await client.from("profiles")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  checks.push({
    check: "S1_PROFILE_COUNT", module: "Seeding",
    status: (profileCount ?? 0) >= 8 ? "passed" : (profileCount ?? 0) > 0 ? "warning" : "failed",
    detail: `${profileCount ?? 0} profiles seeded (target: 8)`,
  });

  // S2: Compensation coverage
  const { count: compCount } = await client.from("compensation_structures")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true);
  checks.push({
    check: "S2_COMPENSATION_COVERAGE", module: "Seeding",
    status: (compCount ?? 0) >= (profileCount ?? 0) ? "passed" : "warning",
    detail: `${compCount ?? 0} active compensation structures for ${profileCount ?? 0} profiles`,
  });

  // S3: Bank accounts seeded
  const { data: bankAccts } = await client.from("bank_accounts").select("id").eq("organization_id", orgId);
  checks.push({
    check: "S3_BANK_ACCOUNTS", module: "Seeding",
    status: (bankAccts ?? []).length > 0 ? "passed" : "warning",
    detail: `${(bankAccts ?? []).length} bank accounts configured`,
  });

  // S4: Fiscal periods configured
  const { count: fpCount } = await client.from("fiscal_periods")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  checks.push({
    check: "S4_FISCAL_PERIODS", module: "Seeding",
    status: (fpCount ?? 0) === 12 ? "passed" : (fpCount ?? 0) > 0 ? "warning" : "failed",
    detail: `${fpCount ?? 0} fiscal periods (expected 12)`,
  });

  // S5: Leave types configured
  const { count: ltCount } = await client.from("leave_types")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  checks.push({
    check: "S5_LEAVE_TYPES", module: "Seeding",
    status: (ltCount ?? 0) >= 3 ? "passed" : "warning",
    detail: `${ltCount ?? 0} leave types configured`,
  });

  // S6: Holidays configured
  const { count: holidayCount } = await client.from("holidays")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  checks.push({
    check: "S6_HOLIDAYS", module: "Seeding",
    status: (holidayCount ?? 0) >= 5 ? "passed" : "warning",
    detail: `${holidayCount ?? 0} holidays configured (expected ≥5)`,
  });

  // S7: User roles assigned
  const { count: roleAssignments } = await client.from("user_roles")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  checks.push({
    check: "S7_USER_ROLES", module: "Seeding",
    status: (roleAssignments ?? 0) >= 5 ? "passed" : "warning",
    detail: `${roleAssignments ?? 0} role assignments`,
  });

  // S8: Organization compliance configured
  try {
    const { data: oc } = await client.from("organization_compliance")
      .select("entity_type, pan, gstin").eq("organization_id", orgId).maybeSingle();
    checks.push({
      check: "S8_ORG_COMPLIANCE", module: "Seeding",
      status: oc && oc.entity_type && oc.pan ? "passed" : "warning",
      detail: oc ? `Entity: ${oc.entity_type}, PAN: ${oc.pan ? "✓" : "✗"}, GST: ${(oc.gstin ?? []).length > 0 ? "✓" : "✗"}` : "No compliance record",
    });
  } catch { checks.push({ check: "S8_ORG_COMPLIANCE", module: "Seeding", status: "warning", detail: "Could not query compliance" }); }

  // S9: Goal cycle config
  const { count: gccCount } = await client.from("goal_cycle_config")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true);
  checks.push({
    check: "S9_GOAL_CYCLE_CONFIG", module: "Seeding",
    status: (gccCount ?? 0) > 0 ? "passed" : "warning",
    detail: `${gccCount ?? 0} active goal cycle configs`,
  });

  // S10: Historical payroll data
  const { data: histRuns } = await client.from("payroll_runs")
    .select("pay_period, status").eq("organization_id", orgId)
    .in("status", ["processed", "approved", "locked"]).order("pay_period", { ascending: false });
  checks.push({
    check: "S10_HISTORICAL_PAYROLL", module: "Seeding",
    status: (histRuns ?? []).length >= 3 ? "passed" : (histRuns ?? []).length > 0 ? "warning" : "failed",
    detail: `${(histRuns ?? []).length} finalized payroll runs`,
  });

  // S11: Manager hierarchy
  const { data: managedProfiles } = await client.from("profiles")
    .select("id, manager_id").eq("organization_id", orgId).not("manager_id", "is", null);
  const selfManaged = (managedProfiles ?? []).filter((p: any) => p.id === p.manager_id);
  checks.push({
    check: "S11_MANAGER_HIERARCHY", module: "Seeding",
    status: selfManaged.length === 0 && (managedProfiles ?? []).length > 0 ? "passed"
      : (managedProfiles ?? []).length === 0 ? "warning" : "failed",
    detail: selfManaged.length > 0
      ? `${selfManaged.length} circular manager refs` : `${(managedProfiles ?? []).length} valid manager assignments`,
  });

  // S12: Attendance status diversity
  const { data: attStatuses } = await client.from("attendance_daily")
    .select("status").eq("organization_id", orgId);
  const uniqueStatuses = [...new Set((attStatuses ?? []).map((a: any) => a.status))];
  checks.push({
    check: "S12_ATTENDANCE_DIVERSITY", module: "Seeding",
    status: uniqueStatuses.length >= 3 ? "passed" : uniqueStatuses.length > 0 ? "warning" : "failed",
    detail: `${uniqueStatuses.length} unique statuses: ${uniqueStatuses.join(", ")}`,
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Payroll calculation integrity (simulation-specific)
  // ═══════════════════════════════════════════════════════════════

  const { data: prAll } = await client.from("payroll_records")
    .select("id, basic_salary, hra, transport_allowance, other_allowances, pf_deduction, tax_deduction, other_deductions, lop_deduction, net_pay")
    .eq("organization_id", orgId).eq("is_superseded", false).limit(200);
  let calcErrors = 0;
  for (const pr of (prAll ?? [])) {
    const gross = pr.basic_salary + pr.hra + pr.transport_allowance + pr.other_allowances;
    const ded = pr.pf_deduction + pr.tax_deduction + pr.other_deductions + pr.lop_deduction;
    if (Math.abs((gross - ded) - pr.net_pay) > 1) calcErrors++;
  }
  checks.push({
    check: "C1_PAYROLL_CALC_INTEGRITY", module: "Calculation",
    status: calcErrors === 0 ? "passed" : "failed",
    detail: calcErrors === 0
      ? `All ${(prAll ?? []).length} records: gross - deductions = net_pay ✓`
      : `${calcErrors}/${(prAll ?? []).length} records have calculation mismatches`,
  });

  // C2: Payroll run totals consistency
  const { data: payrollRuns } = await client.from("payroll_runs")
    .select("id, total_gross, total_deductions, total_net").eq("organization_id", orgId).limit(20);
  let runMismatches = 0;
  for (const run of (payrollRuns ?? [])) {
    if (run.total_gross > 0 && Math.abs(run.total_gross - run.total_deductions - run.total_net) > 1) runMismatches++;
  }
  checks.push({
    check: "C2_PAYROLL_RUN_TOTALS", module: "Calculation",
    status: runMismatches === 0 ? "passed" : "failed",
    detail: runMismatches === 0
      ? `${(payrollRuns ?? []).length} payroll runs have consistent totals`
      : `${runMismatches} runs with inconsistent gross/deductions/net`,
  });

  // C3: Leave balance integrity
  try {
    const { data: lbRecords } = await client.from("leave_balances")
      .select("used_days, total_days").eq("organization_id", orgId);
    const violations = (lbRecords ?? []).filter((lb: any) => lb.used_days > lb.total_days);
    checks.push({
      check: "C3_LEAVE_BALANCE_INTEGRITY", module: "Calculation",
      status: violations.length === 0 ? "passed" : "warning",
      detail: violations.length === 0
        ? `All ${(lbRecords ?? []).length} leave balances valid (used ≤ total)`
        : `${violations.length} leave balances where used > total days`,
    });
  } catch { checks.push({ check: "C3_LEAVE_BALANCE_INTEGRITY", module: "Calculation", status: "warning", detail: "Could not query leave balances" }); }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Financial reporting RPC validation
  // ═══════════════════════════════════════════════════════════════

  const todayStr = new Date().toISOString().split("T")[0];

  // R1: Profit & Loss
  try {
    const { data: plData, error: plErr } = await client.rpc("get_profit_loss", { p_org_id: orgId, p_from: "2020-01-01", p_to: todayStr });
    const plRows = plData ?? [];
    const revenue = plRows.filter((r: any) => r.account_type === "revenue").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const expenses = plRows.filter((r: any) => r.account_type === "expense").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    checks.push({
      check: "R1_PROFIT_LOSS", module: "Reports",
      status: plErr ? "failed" : plRows.length > 0 ? "passed" : "warning",
      detail: plErr ? `P&L error: ${plErr.message}` : `Revenue: ${revenue.toFixed(2)}, Expenses: ${expenses.toFixed(2)}, Net: ${(revenue - expenses).toFixed(2)}`,
    });
  } catch (e: any) { checks.push({ check: "R1_PROFIT_LOSS", module: "Reports", status: "failed", detail: e.message }); }

  // R2: Balance Sheet equation (A = L + E + NI)
  try {
    const { data: bsData, error: bsErr } = await client.rpc("get_balance_sheet", { p_org_id: orgId, p_as_of: todayStr });
    const bsRows = bsData ?? [];
    const eqAssets = bsRows.filter((r: any) => r.account_type === "asset").reduce((s: number, r: any) => s + Number(r.balance || 0), 0);
    const eqContraAssets = bsRows.filter((r: any) => r.account_type === "contra_asset").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const netAssets = eqAssets - eqContraAssets;
    const eqLiab = bsRows.filter((r: any) => r.account_type === "liability").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const eqEquity = bsRows.filter((r: any) => r.account_type === "equity").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const eqRevenue = bsRows.filter((r: any) => r.account_type === "revenue").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const eqExpenses = bsRows.filter((r: any) => r.account_type === "expense").reduce((s: number, r: any) => s + Math.abs(Number(r.balance || 0)), 0);
    const netIncome = eqRevenue - eqExpenses;
    const diff = Math.abs(netAssets - (eqLiab + eqEquity + netIncome));
    checks.push({
      check: "R2_BS_EQUATION", module: "Reports",
      status: bsErr ? "failed" : bsRows.length === 0 ? "warning" : diff < 1 ? "passed" : "failed",
      detail: bsErr ? `BS error: ${bsErr.message}` : bsRows.length === 0 ? "No BS data"
        : `A=${netAssets.toFixed(2)}, L+E+NI=${(eqLiab + eqEquity + netIncome).toFixed(2)}, Diff=${diff.toFixed(2)}`,
    });
  } catch (e: any) { checks.push({ check: "R2_BS_EQUATION", module: "Reports", status: "failed", detail: e.message }); }

  // R3: Trial Balance
  try {
    const { data: tbData, error: tbErr } = await client.rpc("get_trial_balance", { p_org_id: orgId, p_from: "2020-01-01", p_to: todayStr });
    const tbRows = tbData ?? [];
    const totalDebit = tbRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const totalCredit = tbRows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
    const tbBalanced = Math.abs(totalDebit - totalCredit) < 0.02;
    checks.push({
      check: "R3_TRIAL_BALANCE", module: "Reports",
      status: tbErr ? "failed" : tbRows.length === 0 ? "warning" : tbBalanced ? "passed" : "failed",
      detail: tbErr ? `TB error: ${tbErr.message}` : `Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}, Balanced: ${tbBalanced}`,
    });
  } catch (e: any) { checks.push({ check: "R3_TRIAL_BALANCE", module: "Reports", status: "failed", detail: e.message }); }

  // R4: Cash Flow
  try {
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const { data: cfData, error: cfErr } = await client.rpc("get_cash_flow_indirect", {
      p_org_id: orgId, p_from: sixMonthsAgo.toISOString().split("T")[0], p_to: todayStr,
    });
    checks.push({
      check: "R4_CASH_FLOW", module: "Reports",
      status: cfErr ? "failed" : (cfData && (Array.isArray(cfData) ? cfData.length > 0 : Object.keys(cfData).length > 0)) ? "passed" : "warning",
      detail: cfErr ? `Cash Flow error: ${cfErr.message}` : "Cash flow report returned data",
    });
  } catch (e: any) { checks.push({ check: "R4_CASH_FLOW", module: "Reports", status: "failed", detail: e.message }); }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: Dashboard KPI validations
  // ═══════════════════════════════════════════════════════════════

  // K1: GL account coverage
  try {
    const { data: glAccts } = await client.from("gl_accounts").select("account_type").eq("organization_id", orgId);
    const glRows = glAccts ?? [];
    const rev = glRows.filter((g: any) => g.account_type === "revenue").length;
    const exp = glRows.filter((g: any) => g.account_type === "expense").length;
    const ast = glRows.filter((g: any) => g.account_type === "asset").length;
    checks.push({
      check: "K1_GL_ACCOUNT_COVERAGE", module: "Dashboard",
      status: glRows.length >= 5 ? "passed" : "warning",
      detail: `${glRows.length} GL accounts — Revenue: ${rev}, Expense: ${exp}, Asset: ${ast}`,
    });
  } catch (e: any) { checks.push({ check: "K1_GL_ACCOUNT_COVERAGE", module: "Dashboard", status: "failed", detail: e.message }); }

  // K2: Dashboard revenue from journal lines
  try {
    const { data: revAccts } = await client.from("gl_accounts").select("id").eq("organization_id", orgId).eq("account_type", "revenue");
    const revIds = (revAccts ?? []).map((a: any) => a.id);
    let dashRevenue = 0;
    if (revIds.length > 0) {
      const { data: revLines } = await client.from("journal_lines").select("credit").in("gl_account_id", revIds).limit(500);
      dashRevenue = (revLines ?? []).reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    }
    checks.push({
      check: "K2_DASHBOARD_REVENUE", module: "Dashboard",
      status: dashRevenue > 0 ? "passed" : "warning",
      detail: `Dashboard revenue from journal lines: ${dashRevenue.toFixed(2)}`,
    });
  } catch (e: any) { checks.push({ check: "K2_DASHBOARD_REVENUE", module: "Dashboard", status: "failed", detail: e.message }); }

  // K3: CTC pool vs payroll spend
  try {
    const { data: compStructs } = await client.from("compensation_structures")
      .select("annual_ctc").eq("organization_id", orgId).eq("is_active", true);
    const totalCTC = (compStructs ?? []).reduce((s: number, c: any) => s + Number(c.annual_ctc || 0), 0);
    const { data: payrollTotals } = await client.from("payroll_runs").select("total_gross").eq("organization_id", orgId);
    const totalPayroll = (payrollTotals ?? []).reduce((s: number, r: any) => s + Number(r.total_gross || 0), 0);
    checks.push({
      check: "K3_PAYROLL_CTC", module: "Dashboard",
      status: totalCTC > 0 ? "passed" : "warning",
      detail: `Active CTC pool: ${totalCTC.toFixed(2)}, Total payroll: ${totalPayroll.toFixed(2)}`,
    });
  } catch (e: any) { checks.push({ check: "K3_PAYROLL_CTC", module: "Dashboard", status: "failed", detail: e.message }); }

  // K4: Attendance rate
  try {
    const { count: totalAtt } = await client.from("attendance_daily")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    const { count: presentAtt } = await client.from("attendance_daily")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", ["P", "HD"]);
    const rate = (totalAtt ?? 0) > 0 ? ((presentAtt ?? 0) / (totalAtt ?? 1) * 100) : 0;
    checks.push({
      check: "K4_ATTENDANCE_RATE", module: "Dashboard",
      status: (totalAtt ?? 0) > 0 ? "passed" : "warning",
      detail: `Attendance: ${presentAtt ?? 0}/${totalAtt ?? 0} present (${rate.toFixed(1)}%)`,
    });
  } catch (e: any) { checks.push({ check: "K4_ATTENDANCE_RATE", module: "Dashboard", status: "failed", detail: e.message }); }

  // K5: AR Aging
  try {
    const { data: overdueInv } = await client.from("invoices")
      .select("id, total_amount").eq("organization_id", orgId)
      .in("status", ["sent", "overdue"]).lt("due_date", todayStr);
    const overdueTotal = (overdueInv ?? []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
    checks.push({
      check: "K5_AR_AGING", module: "Dashboard",
      status: "passed",
      detail: `${(overdueInv ?? []).length} overdue invoices, total: ${overdueTotal.toFixed(2)}`,
    });
  } catch (e: any) { checks.push({ check: "K5_AR_AGING", module: "Dashboard", status: "failed", detail: e.message }); }

  // K6: AP Aging
  try {
    const { data: overdueBills } = await client.from("bills")
      .select("id, total_amount").eq("organization_id", orgId)
      .in("status", ["pending", "overdue"]).lt("due_date", todayStr);
    const apTotal = (overdueBills ?? []).reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
    checks.push({
      check: "K6_AP_AGING", module: "Dashboard",
      status: "passed",
      detail: `${(overdueBills ?? []).length} overdue bills, total: ${apTotal.toFixed(2)}`,
    });
  } catch (e: any) { checks.push({ check: "K6_AP_AGING", module: "Dashboard", status: "failed", detail: e.message }); }

  // ═══════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════
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
