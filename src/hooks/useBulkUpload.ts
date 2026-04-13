import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import type { BulkUploadConfig, BulkUploadColumn } from "@/components/bulk-upload/BulkUploadDialog";

// ─── Payroll ───────────────────────────────────────
const payrollColumns: BulkUploadColumn[] = [
  { key: "employee_id", label: "Employee ID", required: true, aliases: ["employee_name", "emp_name", "name", "employee"] },
  { key: "email_id", label: "Email", aliases: ["email", "email_address", "emp_email", "employee_email", "login_email"] },
  { key: "basic_salary", label: "Basic Salary", required: true, aliases: ["total_annual_ctc_", "total_annual_ctc", "annual_ctc", "ctc", "salary", "gross_salary"] },
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
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const formatPayPeriod = (p: string) => {
  const [y, m] = p.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
};

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

    const findProfileByEmail = (email: string) => {
      if (!profiles || !email) return null;
      return profiles.find(p => p.email?.toLowerCase().trim() === email.toLowerCase().trim()) ?? null;
    };

    const findProfileByName = (empId: string) => {
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

      // When an email is supplied, use exact match only — do NOT fall back to
      // name matching, since a failed email lookup means the address is wrong
      // and a name fallback could silently match the wrong employee.
      let profile;
      if (row.email_id) {
        profile = findProfileByEmail(row.email_id);
        if (!profile) {
          errors.push(`Row ${row.employee_id}: No employee found with email "${row.email_id}"`);
          continue;
        }
      } else {
        profile = findProfileByName(row.employee_id);
        if (!profile) {
          errors.push(`Row ${row.employee_id}: No matching employee profile found`);
          continue;
        }
      }

      const payload = {
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
      };

      // Find an existing non-superseded record for this employee + period.
      // We cannot use upsert(onConflict) because the unique constraint on
      // (profile_id, pay_period) was dropped when the is_superseded pattern
      // was introduced to support dispute-driven payslip revisions.
      const { data: existing } = await supabase
        .from("payroll_records")
        .select("id, status")
        .eq("profile_id", profile.id)
        .eq("pay_period", payPeriod)
        .eq("is_superseded", false)
        .maybeSingle();

      let data: { id: string }[] | null;
      let error: { message: string } | null;

      if (existing) {
        if (existing.status === "locked") {
          errors.push(`Row ${row.employee_id}: Payslip is locked and cannot be overwritten. Raise a dispute to revise it.`);
          continue;
        }
        ({ data, error } = await supabase
          .from("payroll_records")
          .update(payload)
          .eq("id", existing.id)
          .select("id") as any);
      } else {
        ({ data, error } = await supabase
          .from("payroll_records")
          .insert(payload)
          .select("id") as any);
      }

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
    description: `Upload salary records for multiple employees for ${formatPayPeriod(payPeriod)}.`,
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
