import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import type { BulkUploadConfig, BulkUploadColumn } from "@/components/bulk-upload/BulkUploadDialog";

// ─── Payroll ───────────────────────────────────────
// Columns match the user's Excel file layout.
// basic_salary is DERIVED from PF (see onUpload) — never read from an annual CTC column.
const payrollColumns: BulkUploadColumn[] = [
  // Employee identification
  {
    key: "employee_id",
    label: "Employee Name",
    required: true,
    aliases: ["employee_name", "emp_name", "name", "employee"],
  },
  {
    key: "email_id",
    label: "Email ID",
    aliases: ["email", "email_address", "emp_email", "employee_email", "login_email"],
  },

  // Monthly salary inputs (MONTHLY figures only — do NOT use annual CTC columns here)
  {
    key: "monthly_gross",
    label: "Monthly Fixed Salary",
    required: true,
    aliases: [
      "monthly_fixed_salary",   // "Monthly fixed Salary" (standard)
      "montly_fixed_salary",    // common typo in Excel (missing 'h')
      "monthly_fixed_sala",     // truncated display variant
      "montly_fixed_sala",      // truncated + typo variant
      "fixed_salary",
      "monthly_salary",
      "fixed_gross",
    ],
  },
  {
    key: "gross_earnings_monthly",
    label: "Gross Earnings",
    aliases: [
      "gross_earnings",
      "gross_earn",             // truncated display variant
      "total_earnings",
      "monthly_gross_earnings",
      "total_gross",
    ],
  },

  // Statutory deductions — monthly amounts as deducted from payslip
  // Note: "PF- optout" is automatically treated as 0 (basic derived from 40% of gross instead)
  {
    key: "pf_employee_monthly",
    label: "Employee PF Deduction (Monthly)",
    aliases: [
      "employee_pf_deduction_monthly",
      "employee_pf_deduction_me",  // truncated display variant
      "employee_pf_monthly",
      "pf_deduction_monthly",
      "pf_monthly",
      "epf_monthly",
      "employee_pf",
      "pf_employee",
    ],
  },
  {
    key: "professional_tax_monthly",
    label: "Profession Tax Monthly",
    aliases: [
      "profession_tax_monthly",
      "profession_tax_me",         // truncated display variant
      "professional_tax_monthly",
      "pt_monthly",
      "professional_tax",
      "profession_tax",
      "tax_monthly",
      "prof_tax",
    ],
  },
  // TDS (income tax deducted at source) — monthly amount
  {
    key: "tds_monthly",
    label: "TDS (Monthly)",
    aliases: [
      "tds",
      "tds_monthly",
      "income_tax_monthly",
      "tax_deduction_monthly",
      "income_tax",
      "tds_amount",
    ],
  },
  // Other / miscellaneous deductions not covered by PF, PT, TDS or LOP
  // (salary advances recovered, welfare fund, canteen, etc.)
  {
    key: "other_deductions_col",
    label: "Other Deductions",
    aliases: [
      "other_deductions",
      "other_ded",
      "misc_deductions",
      "miscellaneous_deductions",
      "other deductions",
      "other_deduction",
    ],
  },
  // "Total Deductions" is present in the template so users can paste data directly.
  // When the individual PF/PT columns are absent (or zero), this total is used to
  // derive statutory components via back-calculation.
  {
    key: "total_deductions_col",
    label: "Total Deductions",
    aliases: [
      "total_deductions",
      "deductions",
      "total_deduction",
      "deduction_total",
    ],
  },

  // Variable pay — "no" values are safely treated as 0
  {
    key: "incentive_monthly",
    label: "Incentive Monthly",
    aliases: ["incentive_monthly", "incentive_mon", "monthly_incentive", "variable_pay", "incentive"],
  },
  {
    key: "bonus_monthly",
    label: "Bonus Monthly",
    aliases: ["bonus_monthly", "bonus_mon", "monthly_bonus", "bonus"],
  },

  // Attendance / Loss of Pay
  {
    key: "working_days_col",
    label: "Working Days",
    aliases: ["working_days", "total_working_days", "work_days"],
  },
  {
    key: "paid_days_col",
    label: "Paid Days",
    aliases: ["paid_days", "actual_paid_days", "total_paid_days"],
  },
  {
    key: "lwp_days_col",
    label: "LWP Days",
    aliases: ["lwp_days", "lop_days", "loss_of_pay_days", "lwp_day"],
  },
  {
    key: "lwp_deduction_col",
    label: "LWP Deduction",
    aliases: ["lwp_deduction", "lop_deduction", "loss_of_pay_deduction", "lwp_amount"],
  },

  // Take-home
  {
    key: "net_pay_file",
    label: "Net Pay",
    aliases: ["net_pay", "take_home", "take_home_pay", "net_payable", "net_salary"],
  },
];

// Template column names mirror this company's exact Excel file headers.
// Columns like Department, Job Title, Total Annual CTC, Annual CTC, Employer PF Annual,
// Bonus Yearly, and Total Deductions are included so users can paste their data directly —
// they are present in the template but ignored during upload (not mapped in payrollColumns).
// "PF- optout" in the PF column is handled gracefully (basic derived from 40% of gross).
// "no" in Incentive/Bonus columns is treated as 0.
const payrollTemplate = `Employee Name,Email ID,Department,Job Title,Total Annual CTC,Annual CTC,Employer PF Annual,Bonus Yearly,Incentive monthly,Bonus monthly,Monthly fixed Salary,Gross Earnings,Profession Tax monthly,Employee PF deduction monthly,TDS,Other Deductions,Total Deductions,LWP Days,LWP Deduction,Working Days,Paid Days,Net Pay
Ravi Kumar,ravi@company.com,Engineering,Developer,564000,564000,21600,no,2000,no,45000,47000,200,1800,0,0,2000,0,,26,26,45000
Priya Sharma,priya@company.com,HR,HR Manager,360000,360000,18720,no,no,no,30000,30000,200,1560,500,0,2260,1,1154,26,25,26540
Dilli Ram Nirola,admin@grx10.com,Management,Director,540000,540000,PF- optout,no,no,no,45000,45000,200,0,1500,0,1700,0,,31,31,43300`;

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
      // ── Parse monthly inputs from file ──────────────────────────────────────
      // All values here must be MONTHLY figures.
      // Annual CTC / Total Annual CTC columns are intentionally NOT mapped — they
      // would produce 12× inflated salary figures on the payslip.
      const pf_monthly_raw   = parseFloat(row.pf_employee_monthly) || 0;
      const prof_tax_raw     = parseFloat(row.professional_tax_monthly) || 0;
      const tds_monthly_raw  = parseFloat(row.tds_monthly) || 0;
      let   other_ded_raw    = parseFloat(row.other_deductions_col) || 0;
      const total_ded_file   = parseFloat(row.total_deductions_col) || 0;
      const monthly_gross   = parseFloat(row.monthly_gross) || 0;
      // gross_earnings_monthly includes variable pay; falls back to monthly_gross.
      // Track whether it was explicitly provided — when it is, LWP is already
      // factored in (Gross Earnings = Fixed − LWP + variable), so we must NOT
      // subtract LWP again in cross-checks or net-pay fallback.
      const grossEarningsExplicit = parseFloat(row.gross_earnings_monthly);
      const hasExplicitGross = !isNaN(grossEarningsExplicit) && grossEarningsExplicit > 0;
      const gross_earn     = hasExplicitGross ? grossEarningsExplicit : monthly_gross;
      const incentive      = parseFloat(row.incentive_monthly) || 0;
      const bonus          = parseFloat(row.bonus_monthly) || 0;
      const working_days_val = parseFloat(row.working_days_col) || 26;
      const paid_days_val    = parseFloat(row.paid_days_col) || working_days_val;
      const lwp_days_val     = parseFloat(row.lwp_days_col) || 0;
      const lwp_ded_val      = parseFloat(row.lwp_deduction_col) || 0;
      const net_from_file    = parseFloat(row.net_pay_file) || 0;

      // ── Derive monthly Basic Salary from Employee PF (Indian statutory) ─────
      // Rule: EPF employee contribution = 12% of min(basic, ₹15,000 wage ceiling)
      //   • If PF < ₹1,800  → basic = PF ÷ 12% (exact, basic is under ceiling)
      //   • If PF ≥ ₹1,800  → wage ceiling hit; basic ≥ ₹15,000; use 62% of gross
      //   • If no PF data    → default to 62% of monthly gross (company standard)
      let basic: number;
      if (pf_monthly_raw > 0 && pf_monthly_raw < 1800) {
        basic = Math.round(pf_monthly_raw / 0.12);
      } else if (pf_monthly_raw >= 1800) {
        basic = Math.max(Math.round(monthly_gross * 0.62), 15000);
      } else {
        basic = Math.round(monthly_gross * 0.62);
      }

      // HRA = 24.8% of monthly gross (company standard)
      const hra = Math.round(monthly_gross * 0.248);

      // Other Allowances = balance of fixed monthly gross after Basic + HRA
      // This absorbs Special Allowance, Transport, and other fixed components.
      const other_allowances = Math.max(0, Math.round(monthly_gross - basic - hra));

      // ── Resolve individual deduction components ────────────────────────────
      // Individual PF/PT columns take precedence. When they are absent (both 0)
      // but "Total Deductions" was supplied in the file, back-calculate statutory
      // components so the payslip shows proper named heads instead of a catch-all.
      let pf_monthly = pf_monthly_raw;
      let prof_tax   = prof_tax_raw;

      if (pf_monthly === 0 && prof_tax === 0 && total_ded_file > 0) {
        // Try to split total_ded_file into PF + PT using statutory rules.
        // Two PF conventions: (a) 12% of actual basic, (b) ₹1,800 ceiling flat.
        const grossForPT  = gross_earn || monthly_gross;
        const ptDerived   = grossForPT > 15000 ? 200 : grossForPT > 10000 ? 150 : 0;
        const pfActual    = Math.round(Math.min(basic, 15000) * 0.12);
        const pfCeiling   = 1800;

        for (const pf of [pfActual, pfCeiling]) {
          if (Math.abs(pf + ptDerived - total_ded_file) <= 1) {
            pf_monthly = pf;
            prof_tax   = ptDerived;
            break;
          }
          if (Math.abs(pf - total_ded_file) <= 1) {
            pf_monthly = pf;
            break;
          }
        }
        if (pf_monthly === 0 && ptDerived > 0 && Math.abs(ptDerived - total_ded_file) <= 1) {
          prof_tax = ptDerived;
        }
        // If no pattern matched, leave pf_monthly and prof_tax as 0 —
        // the display layer will still show the correct total via net_pay reconciliation.
      }

      // ── Deduction consistency checks ───────────────────────────────────────
      // (1) Component sum check: when individual deduction columns and Total Deductions
      //     are both provided, verify consistency. If components exceed total → error.
      //     If components are less than total, auto-fill PT (Karnataka slab) and absorb
      //     the remaining gap into other deductions — the file may not break out every head.
      if (total_ded_file > 0 && (pf_monthly_raw > 0 || prof_tax_raw > 0 || tds_monthly_raw > 0 || other_ded_raw > 0)) {
        const componentSum = pf_monthly_raw + prof_tax_raw + tds_monthly_raw + other_ded_raw;
        if (componentSum > total_ded_file + 2) {
          errors.push(
            `Row ${row.employee_id || row.email_id}: Individual deductions (₹${componentSum}) ` +
            `exceed Total Deductions (₹${total_ded_file}). Please fix the values in the file.`
          );
          continue;
        }
        const gap = total_ded_file - componentSum;
        if (gap > 2) {
          // Auto-fill PT from Karnataka slab when not provided in file
          if (prof_tax === 0) {
            const grossForPT = gross_earn || monthly_gross;
            const ptExpected = grossForPT > 15000 ? 200 : grossForPT > 10000 ? 150 : 0;
            if (ptExpected > 0 && gap >= ptExpected) {
              prof_tax = ptExpected;
            }
          }
          // Remaining gap → unitemized deductions included in file's Total
          const remaining = total_ded_file - (pf_monthly + prof_tax + tds_monthly_raw + other_ded_raw);
          if (remaining > 0) other_ded_raw += remaining;
        }
      }

      // (2) Net pay cross-check: gross − total_deductions ≈ net_pay.
      //     When Gross Earnings was explicitly provided, LWP is already factored in
      //     (Gross = Fixed − LWP + variable), so we must NOT subtract it again.
      //     A mismatch > ₹5 suggests a data entry error worth flagging.
      if (net_from_file > 0 && total_ded_file > 0 && gross_earn > 0) {
        const lwpForCheck = hasExplicitGross ? 0 : lwp_ded_val;
        const expectedNet = Math.round(gross_earn - total_ded_file - lwpForCheck);
        if (Math.abs(expectedNet - net_from_file) > 5) {
          errors.push(
            `Row ${row.employee_id || row.email_id}: Net Pay mismatch — ` +
            `Gross (₹${gross_earn}) − Total Deductions (₹${total_ded_file})` +
            `${lwpForCheck ? ` − LWP (₹${lwpForCheck})` : ''} = ₹${expectedNet}, ` +
            `but file says ₹${net_from_file}. Please verify.`
          );
          continue;
        }
      }

      // Variable pay (Incentives + Bonus) stored in transport_allowance field.
      // On the payslip this is labelled "Incentives". The transport_allowance
      // column is repurposed here because the company payslip does not show a
      // separate Transport line — transport is already embedded in other_allowances.
      const incentives = incentive + bonus;

      // ── Net Pay ──────────────────────────────────────────────────────────────
      // Prefer the file value; compute as fallback including TDS + other deductions.
      // When Gross Earnings was explicitly provided, LWP is already factored in.
      const lwpForCalc = hasExplicitGross ? 0 : lwp_ded_val;
      const net_pay = net_from_file > 0
        ? net_from_file
        : Math.max(0, Math.round(gross_earn - pf_monthly - prof_tax - tds_monthly_raw - other_ded_raw - lwpForCalc));

      // ── Employee matching ────────────────────────────────────────────────────
      // When email is supplied use exact match only — do NOT fall back to name
      // matching on email failure, as that could silently write to the wrong person.
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
        // Earnings
        basic_salary: basic,
        hra,
        transport_allowance: incentives, // repurposed: stores variable pay (shown as "Incentives")
        other_allowances,                // fixed special allowance (absorbs transport)
        // Deductions
        pf_deduction: pf_monthly,        // PF Contribution (direct from file)
        tax_deduction: tds_monthly_raw,  // TDS (income tax deducted at source)
        other_deductions: prof_tax + other_ded_raw, // Professional Tax + Other deductions combined
        // Attendance / LOP
        lop_days: lwp_days_val,
        lop_deduction: lwp_ded_val,
        working_days: working_days_val,
        paid_days: paid_days_val,
        net_pay,
        status: "draft",
      };

      // Find the active (non-superseded) record for this employee + period, if any.
      // The UNIQUE constraint on (profile_id, pay_period) exists in the DB, so we must
      // UPDATE existing active records rather than INSERT duplicates.
      // We also check for ANY record (including superseded) to detect constraint conflicts.
      const { data: existing } = await supabase
        .from("payroll_records")
        .select("id, status, is_superseded")
        .eq("profile_id", profile.id)
        .eq("pay_period", payPeriod)
        .order("is_superseded", { ascending: true }) // false (active) first
        .limit(1)
        .maybeSingle();

      let data: { id: string }[] | null;
      let error: { message: string } | null;

      const activeExisting = existing && existing.is_superseded === false ? existing : null;
      const supersededExisting = existing && existing.is_superseded === true ? existing : null;

      if (activeExisting) {
        if (activeExisting.status === "locked") {
          errors.push(`Row ${row.employee_id}: Payslip is locked and cannot be overwritten. Raise a dispute to revise it.`);
          continue;
        }
        ({ data, error } = await supabase
          .from("payroll_records")
          .update(payload)
          .eq("id", activeExisting.id)
          .select("id") as any);
      } else if (supersededExisting) {
        // A superseded record exists — mark it as no longer superseded and update it,
        // rather than inserting a second row that would violate the unique constraint.
        ({ data, error } = await supabase
          .from("payroll_records")
          .update({ ...payload, is_superseded: false })
          .eq("id", supersededExisting.id)
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
      } else if (data?.[0]?.id) {
        insertedIds.push(data[0].id);
        success++;
      } else {
        // Insert/update went through but Supabase returned no row — likely an RLS
        // visibility issue on the RETURNING clause. Count as error so the user knows.
        errors.push(`Row ${row.employee_id}: record was not saved (possible permission issue — check RLS policies).`);
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

// ─── Employee Details (Update Existing) ────────────────
// Updates extended fields for existing employees keyed by email.
// Maps directly to the profiles + employee_details tables.
const employeeDetailsColumns: BulkUploadColumn[] = [
  {
    key: "email",
    label: "Email ID",
    required: true,
    aliases: ["email_id", "employee_email", "emp_email"],
  },
  {
    key: "full_name",
    label: "Employee Name",
    aliases: ["employees_name", "employee_name", "name", "emp_name"],
  },
  {
    key: "employee_id",
    label: "Employee ID",
    aliases: ["emp_id", "emp_code", "employee_code"],
  },
  {
    key: "join_date",
    label: "Date of Joining",
    aliases: ["date_of_joining", "doj", "joining_date", "date_joining"],
  },
  {
    key: "designation",
    label: "Designation",
    aliases: ["job_title", "position", "title", "role"],
  },
  {
    key: "gender",
    label: "Gender",
    aliases: ["sex"],
  },
  {
    key: "aadhar_no",
    label: "Aadhar Card No",
    aliases: ["aadhaar_no", "aadhar_number", "aadhaar_number", "aadhaar_card_no", "aadhar_card_no"],
  },
  {
    key: "pan_number",
    label: "Pan Card No",
    aliases: ["pan_no", "pan_card_no", "pan", "pan_card"],
  },
  {
    key: "date_of_birth",
    label: "Date of Birth",
    aliases: ["dob", "birth_date", "birthdate"],
  },
  {
    key: "uan",
    label: "UAN",
    aliases: ["uan_number", "uan_no", "universal_account_number"],
  },
  {
    key: "bank_account",
    label: "Bank Account",
    aliases: ["bank_account_no", "bank_account_number", "account_number", "account_no"],
  },
  {
    key: "ifsc_code",
    label: "IFSC Code",
    aliases: ["ifsc", "bank_ifsc", "ifsc_no"],
  },
  {
    key: "mobile_no",
    label: "Mobile No",
    aliases: ["phone", "mobile", "contact_number", "mobile_number", "phone_number"],
  },
  {
    key: "emergency_contact",
    label: "Emergency Contact",
    aliases: ["emergency_contact_name", "emergency_name", "emergency"],
  },
  {
    key: "permanent_address",
    label: "Permanent Address",
    aliases: ["address", "address_line1", "residence_address", "home_address"],
  },
  {
    key: "location",
    label: "Location",
    aliases: ["work_location", "office_location", "branch"],
  },
];

const employeeDetailsTemplate = `email_id,employees_name,employee_id,date_of_joining,designation,gender,aadhar_card_no,pan_card_no,date_of_birth,uan,bank_account,ifsc_code,mobile_no,emergency_contact,permanent_address,location
john@company.com,John Doe,EMP001,2024-01-15,Software Engineer,Male,123456789012,ABCDE1234F,1990-05-20,123456789012,9876543210,SBIN0001234,+91 98765 43210,Jane Doe,123 Main St Mumbai,Mumbai`;

// Helper: normalise a date string to YYYY-MM-DD.
// Accepts YYYY-MM-DD or DD/MM/YYYY (common Indian Excel format).
function normaliseDateStr(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // DD/MM/YYYY
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

export function useEmployeeDetailsBulkUpload(): BulkUploadConfig {
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let success = 0;

    // Resolve the caller's org once — used for tenant isolation on every update.
    const { data: { user } } = await supabase.auth.getUser();
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    const callerOrgId = callerProfile?.organization_id ?? null;

    for (const row of rows) {
      const email = row.email?.trim();

      if (!email) {
        errors.push(`Row missing Email ID — skipped`);
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`"${email}": Invalid email format — skipped`);
        continue;
      }

      // ── Field-level validation — invalid fields are skipped, not the row ──
      // Only email + employee-not-found are hard failures that skip the whole row.
      const skippedFields: string[] = [];

      // PAN — store as-is (no format enforcement)
      const pan: string | null = row.pan_number?.trim() ? row.pan_number.trim().toUpperCase() : null;

      // Aadhaar — accept full 12-digit, store only last 4
      let aadhaarLastFour: string | null = null;
      if (row.aadhar_no?.trim()) {
        const digits = row.aadhar_no.trim().replace(/[\s\-]/g, "");
        if (!/^\d{12}$/.test(digits)) {
          skippedFields.push(`Aadhaar skipped (must be 12 digits)`);
        } else {
          aadhaarLastFour = digits.slice(-4);
        }
      }

      // UAN — "NO"/"no" means explicitly not enrolled in EPF; blank means not provided (no change)
      let uan: string | null = null;
      if (row.uan?.trim()) {
        const rawUan = row.uan.trim();
        if (rawUan.toUpperCase() === "NO") {
          uan = "Opted out";
        } else {
          uan = rawUan.replace(/\s/g, "");
          if (!/^\d{12}$/.test(uan)) {
            skippedFields.push(`UAN skipped (must be 12 digits or "NO" for opted-out)`);
            uan = null;
          }
        }
      }

      // IFSC
      let ifsc: string | null = null;
      if (row.ifsc_code?.trim()) {
        ifsc = row.ifsc_code.trim().toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
          skippedFields.push(`IFSC "${ifsc}" skipped (expected format: ABCD0123456)`);
          ifsc = null;
        }
      }

      // ── Resolve the profile by email (org-scoped via RLS) ─
      const { data: profile, error: profileLookupError } = await supabase
        .from("profiles")
        .select("id, organization_id")
        .ilike("email", email)
        .maybeSingle();

      if (profileLookupError) {
        errors.push(`"${email}": Lookup failed — ${profileLookupError.message}`);
        continue;
      }
      if (!profile) {
        errors.push(`"${email}": Employee not found — skipped`);
        continue;
      }
      // Explicit tenant check (defence-in-depth on top of RLS)
      if (callerOrgId && profile.organization_id !== callerOrgId) {
        errors.push(`"${email}": Employee belongs to a different organisation — skipped`);
        continue;
      }
      const profileId = profile.id;

      // ── Profile-level fields ──────────────────────────────
      const profileUpdate: Record<string, string> = {};
      if (row.full_name?.trim()) profileUpdate.full_name = row.full_name.trim();
      if (row.designation?.trim()) profileUpdate.job_title = row.designation.trim();
      if (row.mobile_no?.trim()) profileUpdate.phone = row.mobile_no.trim();
      if (row.location?.trim()) profileUpdate.location = row.location.trim();

      const joinDateNorm = normaliseDateStr(row.join_date || "");
      if (joinDateNorm) profileUpdate.join_date = joinDateNorm;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update(profileUpdate as any)
          .eq("id", profileId)
          .eq("organization_id", callerOrgId ?? profile.organization_id);
        if (profileUpdateError) {
          errors.push(`"${email}": Profile update failed — ${profileUpdateError.message}`);
          continue;
        }
      }

      // ── employee_details fields ───────────────────────────
      const detailsPayload: Record<string, string | null> = { profile_id: profileId };
      let hasDetails = false;

      if (row.employee_id?.trim()) { detailsPayload.employee_id_number = row.employee_id.trim(); hasDetails = true; }
      if (row.gender?.trim()) { detailsPayload.gender = row.gender.trim(); hasDetails = true; }
      if (row.emergency_contact?.trim()) { detailsPayload.emergency_contact_name = row.emergency_contact.trim(); hasDetails = true; }
      if (row.permanent_address?.trim()) { detailsPayload.address_line1 = row.permanent_address.trim(); hasDetails = true; }
      if (row.bank_account?.trim()) { detailsPayload.bank_account_number = row.bank_account.trim(); hasDetails = true; }

      const dobNorm = normaliseDateStr(row.date_of_birth || "");
      if (dobNorm) { detailsPayload.date_of_birth = dobNorm; hasDetails = true; }

      if (pan) { detailsPayload.pan_number = pan; hasDetails = true; }
      if (aadhaarLastFour) { detailsPayload.aadhaar_last_four = aadhaarLastFour; hasDetails = true; }
      if (uan) { detailsPayload.uan_number = uan; hasDetails = true; }
      if (ifsc) { detailsPayload.bank_ifsc = ifsc; hasDetails = true; }

      if (hasDetails) {
        const { error: detailsError } = await supabase
          .from("employee_details")
          .upsert(detailsPayload as any, { onConflict: "profile_id" });
        if (detailsError) {
          errors.push(`"${email}": Details update failed — ${detailsError.message}`);
          continue;
        }
      }

      success++;
      // Field-level skips go into warnings (row was saved, only these fields were not)
      if (skippedFields.length > 0) {
        warnings.push(`"${email}": ${skippedFields.join("; ")}`);
      }
    }

    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["employee-details"] });
    return { success, errors, warnings };
  }, [qc]);

  return {
    module: "employee-details",
    title: "Update Employee Details",
    description:
      "Update extended details for existing employees. Email ID is used as the primary key to match records. Aadhaar: only the last 4 digits are stored.",
    columns: employeeDetailsColumns,
    templateFileName: "employee_details_template.csv",
    templateContent: employeeDetailsTemplate,
    onUpload,
  };
}
