import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import type { BulkUploadConfig, BulkUploadColumn } from "@/components/bulk-upload/BulkUploadDialog";

// ─── Payroll ───────────────────────────────────────
const payrollColumns: BulkUploadColumn[] = [
  { key: "employee_id", label: "Employee ID", required: true },
  { key: "basic_salary", label: "Basic Salary", required: true },
  { key: "hra", label: "HRA" },
  { key: "transport_allowance", label: "Transport Allowance" },
  { key: "other_allowances", label: "Other Allowances" },
  { key: "pf_deduction", label: "PF Deduction" },
  { key: "tax_deduction", label: "Tax Deduction" },
  { key: "other_deductions", label: "Other Deductions" },
];

const payrollTemplate = `employee_id,basic_salary,hra,transport_allowance,other_allowances,pf_deduction,tax_deduction,other_deductions
emp001,50000,20000,1600,5000,6000,5000,0
emp002,60000,24000,1600,6000,7200,7000,0`;

// ─── Payroll Register ──────────────────────────────
const payrollRegisterColumns: BulkUploadColumn[] = [
  { key: "employee_id", label: "Employee Name/Email", required: true },
  { key: "basic_salary", label: "Basic Salary", required: true },
  { key: "hra", label: "HRA" },
  { key: "transport_allowance", label: "Transport Allowance" },
  { key: "other_allowances", label: "Other Allowances" },
  { key: "employer_pf", label: "Employer PF" },
  { key: "pf_deduction", label: "PF Deduction" },
  { key: "tax_deduction", label: "Tax Deduction" },
  { key: "other_deductions", label: "Other Deductions" },
  { key: "lwp_days", label: "LWP Days" },
  { key: "working_days", label: "Working Days" },
];

const payrollRegisterTemplate = `employee_id,basic_salary,hra,transport_allowance,other_allowances,employer_pf,pf_deduction,tax_deduction,other_deductions,lwp_days,working_days
John Doe,50000,20000,1600,5000,6000,6000,5000,0,0,26
Jane Smith,60000,24000,1600,6000,7200,7200,7000,0,1,26`;

export function usePayrollRegisterBulkUpload(payPeriod: string): BulkUploadConfig {
  const { user } = useAuth();
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    if (!user) throw new Error("Not authenticated");

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = currentProfile?.organization_id;
    if (!orgId) return { success: 0, errors: ["No organization found."] };

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, email, full_name")
      .eq("organization_id", orgId);

    const findProfile = (empId: string) => {
      if (!profiles || !empId) return null;
      const needle = empId.toLowerCase().trim();
      let match = profiles.find(p => p.full_name?.toLowerCase().trim() === needle);
      if (match) return match;
      match = profiles.find(p => p.full_name?.toLowerCase().startsWith(needle));
      if (match) return match;
      match = profiles.find(p => p.full_name?.toLowerCase().includes(needle));
      if (match) return match;
      match = profiles.find(p => p.email?.toLowerCase().startsWith(needle));
      if (match) return match;
      const words = needle.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 0) {
        match = profiles.find(p => {
          const name = p.full_name?.toLowerCase() || "";
          return words.every(w => name.includes(w));
        });
        if (match) return match;
      }
      return null;
    };

    // Find or create payroll_run for this period
    const { data: existingRun } = await supabase
      .from("payroll_runs")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("pay_period", payPeriod)
      .maybeSingle();

    const terminalStatuses = ["under_review", "approved", "locked"];
    if (existingRun && terminalStatuses.includes(existingRun.status)) {
      return {
        success: 0,
        errors: [
          `A payroll run for ${payPeriod} already exists with status '${existingRun.status}'. ` +
          `It cannot be overwritten. Delete it first or choose a different period.`,
        ],
      };
    }

    let runId: string;
    let createdNewRun = false;

    if (existingRun) {
      runId = existingRun.id;
    } else {
      const { data: newRun, error: runError } = await supabase
        .from("payroll_runs")
        .insert({
          organization_id: orgId,
          pay_period: payPeriod,
          generated_by: user.id,
          status: "completed",
          notes: "Uploaded via Payroll Register Bulk Upload",
        })
        .select("id")
        .single();

      if (runError || !newRun) {
        return { success: 0, errors: [`Failed to create payroll run: ${runError?.message}`] };
      }
      runId = newRun.id;
      createdNewRun = true;
    }

    const errors: string[] = [];
    let success = 0;
    const insertedEntryIds: string[] = [];

    for (const row of rows) {
      const basic = parseFloat(row.basic_salary) || 0;
      const hra = parseFloat(row.hra) || 0;
      const transport = parseFloat(row.transport_allowance) || 0;
      const otherAllow = parseFloat(row.other_allowances) || 0;
      const employerPf = parseFloat(row.employer_pf) || 0;
      const pf = parseFloat(row.pf_deduction) || 0;
      const tax = parseFloat(row.tax_deduction) || 0;
      const otherDed = parseFloat(row.other_deductions) || 0;
      const lwpDays = parseInt(row.lwp_days) || 0;
      const workingDays = parseInt(row.working_days) || 26;

      const gross = basic + hra + transport + otherAllow;
      const totalDed = pf + tax + otherDed;
      const netPay = Math.max(gross - totalDed, 0);
      const paidDays = Math.max(workingDays - lwpDays, 0);

      const earningsBreakdown = [
        { name: "Basic Salary", monthly: basic, annual: basic * 12, is_taxable: true },
        ...(hra > 0 ? [{ name: "HRA", monthly: hra, annual: hra * 12, is_taxable: true }] : []),
        ...(transport > 0 ? [{ name: "Transport Allowance", monthly: transport, annual: transport * 12, is_taxable: true }] : []),
        ...(otherAllow > 0 ? [{ name: "Other Allowances", monthly: otherAllow, annual: otherAllow * 12, is_taxable: true }] : []),
        ...(employerPf > 0 ? [{ name: "Employer PF", monthly: employerPf, annual: employerPf * 12, employer_contribution: true }] : []),
      ];

      const deductionsBreakdown = [
        ...(pf > 0 ? [{ name: "PF Deduction", monthly: pf, annual: pf * 12, is_taxable: false }] : []),
        ...(tax > 0 ? [{ name: "Tax Deduction", monthly: tax, annual: tax * 12, is_taxable: false }] : []),
        ...(otherDed > 0 ? [{ name: "Other Deductions", monthly: otherDed, annual: otherDed * 12, is_taxable: false }] : []),
      ];

      const profile = findProfile(row.employee_id);
      if (!profile) {
        errors.push(`Row ${row.employee_id}: No matching employee profile found`);
        if (errors.length > rows.length * 0.5 && insertedEntryIds.length > 0) {
          await supabase.from("payroll_entries").delete().in("id", insertedEntryIds);
          if (createdNewRun) await supabase.from("payroll_runs").delete().eq("id", runId);
          return { success: 0, errors: [...errors, "Bulk upload aborted: too many errors. All changes rolled back."] };
        }
        continue;
      }

      const { data: entry, error: entryError } = await supabase
        .from("payroll_entries")
        .upsert({
          payroll_run_id: runId,
          profile_id: profile.id,
          organization_id: orgId,
          compensation_structure_id: null,
          annual_ctc: gross * 12,
          gross_earnings: gross,
          total_deductions: totalDed,
          net_pay: netPay,
          lwp_days: lwpDays,
          lwp_deduction: 0,
          working_days: workingDays,
          paid_days: paidDays,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          status: "computed",
        }, { onConflict: "payroll_run_id,profile_id" })
        .select("id")
        .single();

      if (entryError) {
        errors.push(`Row ${row.employee_id}: ${entryError.message}`);
        if (errors.length > rows.length * 0.5 && insertedEntryIds.length > 0) {
          await supabase.from("payroll_entries").delete().in("id", insertedEntryIds);
          if (createdNewRun) await supabase.from("payroll_runs").delete().eq("id", runId);
          return { success: 0, errors: [...errors, "Bulk upload aborted: too many errors. All changes rolled back."] };
        }
      } else {
        if (entry?.id) insertedEntryIds.push(entry.id);
        success++;
      }
    }

    // Re-aggregate run totals from all current entries
    const { data: allEntries } = await supabase
      .from("payroll_entries")
      .select("gross_earnings, total_deductions, net_pay")
      .eq("payroll_run_id", runId);

    if (allEntries && allEntries.length > 0) {
      const totalGross = allEntries.reduce((s, e) => s + (e.gross_earnings || 0), 0);
      const totalDeductions = allEntries.reduce((s, e) => s + (e.total_deductions || 0), 0);
      const totalNet = allEntries.reduce((s, e) => s + (e.net_pay || 0), 0);

      await supabase.from("payroll_runs").update({
        total_gross: totalGross,
        total_deductions: totalDeductions,
        total_net: totalNet,
        employee_count: allEntries.length,
        status: "completed",
      }).eq("id", runId);
    }

    qc.invalidateQueries({ queryKey: ["payroll-runs"] });
    qc.invalidateQueries({ queryKey: ["payroll-entries"] });
    qc.invalidateQueries({ queryKey: ["payroll"] });
    return { success, errors };
  }, [user, payPeriod, qc]);

  return {
    module: "payroll_register",
    title: "Upload Payroll Register",
    description: "Upload a pre-computed payroll register. Creates a completed payroll run ready for the approval workflow — no engine calculation needed.",
    columns: payrollRegisterColumns,
    templateFileName: "payroll_register_template.csv",
    templateContent: payrollRegisterTemplate,
    onUpload,
  };
}

// ─── Attendance ────────────────────────────────────
const attendanceColumns: BulkUploadColumn[] = [
  { key: "employee_id", label: "Employee ID", required: true },
  { key: "date", label: "Date", required: true },
  { key: "status", label: "Status", required: true },
  { key: "check_in", label: "Check In" },
  { key: "check_out", label: "Check Out" },
  { key: "notes", label: "Notes" },
];

const attendanceTemplate = `employee_id,date,status,check_in,check_out,notes
emp001,2026-02-01,present,09:00:00,18:00:00,Regular day
emp002,2026-02-01,late,09:30:00,18:00:00,Late arrival
emp003,2026-02-01,leave,,,On sick leave`;

// ─── Users & Roles (Combined) ─────────────────────
const usersAndRolesColumns: BulkUploadColumn[] = [
  { key: "email", label: "Email", required: true },
  { key: "full_name", label: "Full Name" },
  { key: "department", label: "Department" },
  { key: "job_title", label: "Job Title" },
  { key: "role", label: "Role", required: true },
];

const usersAndRolesTemplate = `email,full_name,department,job_title,role
john@grx10.com,John Doe,Engineering,Developer,employee
jane@grx10.com,Jane Smith,HR,HR Manager,hr
existing@grx10.com,,,,manager`;

// ─── Holidays ──────────────────────────────────────
const holidayColumns: BulkUploadColumn[] = [
  { key: "name", label: "Holiday Name", required: true },
  { key: "date", label: "Date (YYYY-MM-DD)", required: true },
];

const holidayTemplate = `name,date
Republic Day,2026-01-26
Independence Day,2026-08-15
Christmas,2026-12-25`;

// ─── Hook ──────────────────────────────────────────
export function usePayrollBulkUpload(payPeriod: string): BulkUploadConfig {
  const { user } = useAuth();
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    if (!user) throw new Error("Not authenticated");

    // Get the user's organization_id to scope profile lookups to current tenant
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = currentProfile?.organization_id;

    // Fetch employee profiles scoped to current organization to prevent cross-tenant matches
    const { data: profiles } = await (orgId
      ? supabase.from("profiles").select("id, user_id, email, full_name").eq("organization_id", orgId)
      : supabase.from("profiles").select("id, user_id, email, full_name"));
    const errors: string[] = [];
    let success = 0;

    const findProfile = (empId: string) => {
      if (!profiles || !empId) return null;
      const needle = empId.toLowerCase().trim();
      let match = profiles.find(p => p.full_name?.toLowerCase().trim() === needle);
      if (match) return match;
      match = profiles.find(p => p.full_name?.toLowerCase().startsWith(needle));
      if (match) return match;
      match = profiles.find(p => p.full_name?.toLowerCase().includes(needle));
      if (match) return match;
      match = profiles.find(p => p.email?.toLowerCase().startsWith(needle));
      if (match) return match;
      const words = needle.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 0) {
        match = profiles.find(p => {
          const name = p.full_name?.toLowerCase() || "";
          return words.every(w => name.includes(w));
        });
        if (match) return match;
      }
      return null;
    };

    const insertedIds: string[] = [];

    for (const row of rows) {
      const basic = parseFloat(row.basic_salary) || 0;
      const hra = parseFloat(row.hra) || 0;
      const transport = parseFloat(row.transport_allowance) || 0;
      const otherAllow = parseFloat(row.other_allowances) || 0;
      const pf = parseFloat(row.pf_deduction) || 0;
      const tax = parseFloat(row.tax_deduction) || 0;
      const otherDed = parseFloat(row.other_deductions) || 0;
      const net = basic + hra + transport + otherAllow - pf - tax - otherDed;

      const profile = findProfile(row.employee_id);

      if (!profile) {
        errors.push(`Row ${row.employee_id}: No matching employee profile found`);
        continue;
      }

      const { data, error } = await supabase.from("payroll_records").upsert({
        user_id: profile.user_id,
        profile_id: profile.id,
        organization_id: orgId || null,
        pay_period: payPeriod,
        basic_salary: basic,
        hra,
        transport_allowance: transport,
        other_allowances: otherAllow,
        pf_deduction: pf,
        tax_deduction: tax,
        other_deductions: otherDed,
        net_pay: net,
        status: "draft",
      }, { onConflict: "profile_id,pay_period" }).select("id");

      if (error) {
        errors.push(`Row ${row.employee_id}: ${error.message}`);
        // If error rate exceeds 50%, rollback all inserted records
        if (errors.length > rows.length * 0.5 && insertedIds.length > 0) {
          await supabase.from("payroll_records").delete().in("id", insertedIds);
          errors.push("Bulk upload aborted: too many errors. All changes rolled back.");
          return { success: 0, errors };
        }
      } else {
        if (data?.[0]?.id) insertedIds.push(data[0].id);
        success++;
      }
    }

    qc.invalidateQueries({ queryKey: ["payroll"] });
    return { success, errors };
  }, [user, payPeriod, qc]);

  return {
    module: "payroll",
    title: "Bulk Upload Payroll",
    description: "Upload salary records for multiple employees at once using a CSV file.",
    columns: payrollColumns,
    templateFileName: "payroll_template.csv",
    templateContent: payrollTemplate,
    onUpload,
  };
}

export function useAttendanceBulkUpload(): BulkUploadConfig {
  const { user } = useAuth();
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    if (!user) throw new Error("Not authenticated");

    // Get the user's organization_id
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = currentProfile?.organization_id;

    const { data: profiles } = await (orgId
      ? supabase.from("profiles").select("id, user_id, email, full_name").eq("organization_id", orgId)
      : supabase.from("profiles").select("id, user_id, email, full_name"));
    const errors: string[] = [];
    let success = 0;

    /**
     * Flexible profile matching:
     * 1. Exact full_name match (case-insensitive)
     * 2. full_name starts with the employee_id value
     * 3. employee_id is contained in full_name (partial match)
     * 4. Email prefix match
     * This handles cases like "Akshata S Dod..." matching "Akshata S Doddamani"
     */
    const findProfile = (empId: string) => {
      if (!profiles || !empId) return null;
      const needle = empId.toLowerCase().trim();
      // 1. Exact full_name
      let match = profiles.find(p => p.full_name?.toLowerCase().trim() === needle);
      if (match) return match;
      // 2. full_name starts with employee_id
      match = profiles.find(p => p.full_name?.toLowerCase().startsWith(needle));
      if (match) return match;
      // 3. employee_id contained in full_name
      match = profiles.find(p => p.full_name?.toLowerCase().includes(needle));
      if (match) return match;
      // 4. Email prefix match
      match = profiles.find(p => p.email?.toLowerCase().startsWith(needle));
      if (match) return match;
      // 5. All words in employee_id appear in full_name (handles reordering / partial)
      const words = needle.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 0) {
        match = profiles.find(p => {
          const name = p.full_name?.toLowerCase() || "";
          return words.every(w => name.includes(w));
        });
        if (match) return match;
      }
      return null;
    };

    for (const row of rows) {
      const profile = findProfile(row.employee_id);

      if (!profile) {
        errors.push(`Row ${row.employee_id}: No matching employee profile found`);
        continue;
      }

      // user_id is NOT NULL — use the matched profile's user_id, or fall back to current user
      const resolvedUserId = profile.user_id || user.id;

      // Normalize time values — strip any date prefix, ensure HH:mm:ss format
      const normalizeTime = (t: string | undefined): string | null => {
        if (!t || !t.trim()) return null;
        const match = t.trim().match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) return match[1].length === 5 ? match[1] + ":00" : match[1];
        return null;
      };

      const checkInTime = normalizeTime(row.check_in);
      const checkOutTime = normalizeTime(row.check_out);
      const checkInDate = checkInTime && row.date ? `${row.date}T${checkInTime}` : null;
      const checkOutDate = checkOutTime && row.date ? `${row.date}T${checkOutTime}` : null;

      console.log(`[Attendance Upload] ${row.employee_id} | date=${row.date} | raw_in="${row.check_in}" → ${checkInTime} → ${checkInDate} | raw_out="${row.check_out}" → ${checkOutTime} → ${checkOutDate}`);

      // Use upsert with profile_id+date conflict to handle re-uploads cleanly
      const { error } = await supabase.from("attendance_records")
        .upsert({
          user_id: resolvedUserId,
          profile_id: profile.id,
          date: row.date,
          status: row.status || "present",
          check_in: checkInDate,
          check_out: checkOutDate,
          notes: row.notes || null,
          organization_id: orgId || null,
        }, {
          onConflict: "profile_id,date",
          ignoreDuplicates: false,
        });

      if (error) errors.push(`Row ${row.employee_id} ${row.date}: ${error.message}`);
      else success++;
    }

    qc.invalidateQueries({ queryKey: ["attendance"] });
    return { success, errors };
  }, [user, qc]);

  return {
    module: "attendance",
    title: "Bulk Upload Attendance",
    description: "Upload attendance records for multiple employees and dates using a CSV file.",
    columns: attendanceColumns,
    templateFileName: "attendance_template.csv",
    templateContent: attendanceTemplate,
    onUpload,
  };
}

export function useHolidaysBulkUpload(): BulkUploadConfig {
  const qc = useQueryClient();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    let success = 0;

    if (!orgId) {
      return { success: 0, errors: ["No organization found. Please try again."] };
    }

    for (const row of rows) {
      const name = row.name?.trim();
      const date = row.date?.trim();
      if (!name || !date) {
        errors.push(`Missing name or date: "${name}", "${date}"`);
        continue;
      }
      const year = new Date(date).getFullYear();
      if (isNaN(year)) {
        errors.push(`Invalid date for "${name}": "${date}"`);
        continue;
      }

      const { error } = await supabase.from("holidays").insert({ name, date, year, organization_id: orgId });
      if (error) errors.push(`${name}: ${error.message}`);
      else success++;
    }

    qc.invalidateQueries({ queryKey: ["holidays"] });
    return { success, errors };
  }, [qc, orgId]);

  return {
    module: "holidays",
    title: "Bulk Upload Holidays",
    description: "Upload multiple holidays at once using a CSV or Excel file with name and date columns.",
    columns: holidayColumns,
    templateFileName: "holidays_template.csv",
    templateContent: holidayTemplate,
    onUpload,
  };
}

// ─── Expenses ──────────────────────────────────────
const expenseColumns: BulkUploadColumn[] = [
  { key: "employee_id", label: "Employee Name/Email", required: true },
  { key: "category", label: "Category", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "expense_date", label: "Date (YYYY-MM-DD)", required: true },
  { key: "description", label: "Description" },
  { key: "notes", label: "Notes" },
];

const expenseTemplate = `employee_id,category,amount,expense_date,description,notes
John Doe,Travel,5000,2026-03-01,Client visit to Mumbai,Cab + Hotel
Jane Smith,Office Supplies,1200,2026-03-02,Stationery purchase,`;

export function useExpensesBulkUpload(): BulkUploadConfig {
  const { user } = useAuth();
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    if (!user) throw new Error("Not authenticated");

    // Get the user's organization_id to scope profile lookups to current tenant
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = currentProfile?.organization_id;

    // Fetch profiles scoped to current organization to prevent cross-tenant matches
    const { data: profiles } = await (orgId
      ? supabase.from("profiles").select("id, user_id, email, full_name, organization_id").eq("organization_id", orgId)
      : supabase.from("profiles").select("id, user_id, email, full_name, organization_id"));
    const errors: string[] = [];
    let success = 0;

    const findProfile = (empId: string) => {
      if (!profiles || !empId) return null;
      const needle = empId.toLowerCase().trim();
      let match = profiles.find(p => p.full_name?.toLowerCase().trim() === needle);
      if (match) return match;
      match = profiles.find(p => p.full_name?.toLowerCase().startsWith(needle));
      if (match) return match;
      match = profiles.find(p => p.full_name?.toLowerCase().includes(needle));
      if (match) return match;
      match = profiles.find(p => p.email?.toLowerCase().startsWith(needle));
      if (match) return match;
      const words = needle.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 0) {
        match = profiles.find(p => {
          const name = p.full_name?.toLowerCase() || "";
          return words.every(w => name.includes(w));
        });
        if (match) return match;
      }
      return null;
    };

    for (const row of rows) {
      const profile = findProfile(row.employee_id);
      if (!profile) {
        errors.push(`Row ${row.employee_id}: No matching employee profile found`);
        continue;
      }

      const amount = parseFloat(row.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Row ${row.employee_id}: Invalid amount "${row.amount}"`);
        continue;
      }

      const { error } = await supabase.from("expenses").insert({
        user_id: profile.user_id,
        profile_id: profile.id,
        organization_id: profile.organization_id,
        category: row.category?.trim() || "Miscellaneous",
        amount,
        expense_date: row.expense_date || new Date().toISOString().split("T")[0],
        description: row.description?.trim() || null,
        notes: row.notes?.trim() || null,
        status: "pending",
      });

      if (error) errors.push(`Row ${row.employee_id}: ${error.message}`);
      else success++;
    }

    qc.invalidateQueries({ queryKey: ["expenses-all"] });
    qc.invalidateQueries({ queryKey: ["expenses-my"] });
    return { success, errors };
  }, [user, qc]);

  return {
    module: "expenses",
    title: "Bulk Upload Expenses",
    description: "Upload multiple expense records at once. Employee matching uses name or email. Receipts can be attached individually after import.",
    columns: expenseColumns,
    templateFileName: "expenses_template.csv",
    templateContent: expenseTemplate,
    onUpload,
  };
}

export function useUsersAndRolesBulkUpload(): BulkUploadConfig {
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    const validRoles = ["admin", "hr", "manager", "employee", "finance"];
    const errors: string[] = [];
    let success = 0;
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const email = row.email?.trim();
      const role = row.role?.toLowerCase().trim() || "employee";
      const full_name = row.full_name?.trim() || "";
      const department = row.department?.trim() || null;
      const job_title = row.job_title?.trim() || null;

      if (!email) {
        errors.push(`Row missing email`);
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row "${email}": Invalid email format`);
        continue;
      }
      if (!validRoles.includes(role)) {
        errors.push(`${email}: Invalid role "${row.role}". Must be one of: ${validRoles.join(", ")}`);
        continue;
      }

      if (full_name) {
        const { data, error } = await supabase.functions.invoke("manage-roles", {
          body: { action: "bulk_create_users", users: [{ email, full_name, department, job_title, role }] },
        });
        if (error) {
          errors.push(`${email}: ${error.message}`);
        } else if (data?.errors?.length) {
          errors.push(...data.errors.map((e: string) => `${email}: ${e}`));
        } else {
          success++;
          if (data?.updated > 0) updated++;
          else created++;
        }
      } else {
        const { data, error } = await supabase.functions.invoke("manage-roles", {
          body: { action: "set_role_by_email", email, role },
        });
        if (error || data?.error) {
          errors.push(`${email}: ${data?.error || error?.message || "Failed"}`);
        } else {
          success++;
          updated++;
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["user-roles"] });
    return { success, errors, created, updated };
  }, [qc]);

  return {
    module: "users",
    title: "Bulk Add Users & Assign Roles",
    description: "Add new users or update roles for existing users. Provide full_name to create a new account, or leave it blank to just update the role of an existing user.",
    columns: usersAndRolesColumns,
    templateFileName: "users_roles_template.csv",
    templateContent: usersAndRolesTemplate,
    onUpload,
  };
}

// ─── Employees ─────────────────────────────────────
const employeeColumns: BulkUploadColumn[] = [
  { key: "full_name", label: "Full Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "job_title", label: "Job Title" },
  { key: "department", label: "Department" },
  { key: "status", label: "Status (active/inactive)" },
  { key: "join_date", label: "Join Date (YYYY-MM-DD)" },
  { key: "phone", label: "Phone" },
  { key: "manager", label: "Manager (Name or Email)" },
];

const employeeTemplate = `full_name,email,job_title,department,status,join_date,phone,manager
John Doe,john@company.com,Software Engineer,Engineering,active,2026-01-15,+91 98765 43210,manager@company.com
Jane Smith,jane@company.com,HR Manager,Human Resources,active,2026-02-01,+91 91234 56789,John Doe`;

export function useEmployeeBulkUpload(): BulkUploadConfig {
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    let success = 0;
    let created = 0;

    for (const row of rows) {
      const full_name = row.full_name?.trim();
      const email = row.email?.trim();

      if (!full_name || !email) {
        errors.push(`Row "${full_name || email || "?"}": Full name and email are required`);
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row "${full_name}": Invalid email format "${email}"`);
        continue;
      }

      const payload: Record<string, any> = {
        action: "create_user",
        full_name,
        email,
        role: "employee",
      };

      if (row.job_title?.trim()) payload.job_title = row.job_title.trim();
      if (row.department?.trim()) payload.department = row.department.trim();
      if (row.phone?.trim()) payload.phone = row.phone.trim();
      if (row.join_date?.trim()) payload.join_date = row.join_date.trim();
      if (row.status?.trim()) {
        const s = row.status.trim().toLowerCase();
        if (["active", "inactive"].includes(s)) payload.status = s;
      }
      // Accept manager as name or email — detect by presence of '@'
      const managerVal = (row.manager || row.manager_email || "").trim();
      if (managerVal) {
        if (managerVal.includes("@")) {
          payload.manager_email = managerVal;
        } else {
          // Treat as manager name — resolve to email via profiles lookup
          const { data: managerProfile } = await supabase
            .from("profiles")
            .select("email")
            .ilike("full_name", managerVal)
            .limit(1)
            .maybeSingle();
          if (managerProfile?.email) {
            payload.manager_email = managerProfile.email;
          } else {
            errors.push(`${email}: Manager "${managerVal}" not found`);
            continue;
          }
        }
      }

      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: payload,
      });

      if (error || data?.error) {
        errors.push(`${email}: ${data?.error || error?.message || "Failed to create"}`);
      } else {
        success++;
        created++;
      }
    }

    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    return { success, errors, created };
  }, [qc]);

  return {
    module: "employees",
    title: "Bulk Upload Employees",
    description: "Upload multiple employees at once. Each row creates a new user account. The template matches the Add Employee form fields.",
    columns: employeeColumns,
    templateFileName: "employees_template.csv",
    templateContent: employeeTemplate,
    onUpload,
  };
}
