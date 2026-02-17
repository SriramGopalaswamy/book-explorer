import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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

// ─── Roles ─────────────────────────────────────────
const rolesColumns: BulkUploadColumn[] = [
  { key: "email", label: "User Email", required: true },
  { key: "role", label: "Role", required: true },
];

const rolesTemplate = `email,role
user1@example.com,employee
user2@example.com,hr
user3@example.com,manager`;

// ─── Hook ──────────────────────────────────────────
export function usePayrollBulkUpload(payPeriod: string): BulkUploadConfig {
  const { user } = useAuth();
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    if (!user) throw new Error("Not authenticated");

    // Fetch employee profiles to map employee_id → profile_id
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
    const errors: string[] = [];
    let success = 0;

    for (const row of rows) {
      const basic = parseFloat(row.basic_salary) || 0;
      const hra = parseFloat(row.hra) || 0;
      const transport = parseFloat(row.transport_allowance) || 0;
      const otherAllow = parseFloat(row.other_allowances) || 0;
      const pf = parseFloat(row.pf_deduction) || 0;
      const tax = parseFloat(row.tax_deduction) || 0;
      const otherDed = parseFloat(row.other_deductions) || 0;
      const net = basic + hra + transport + otherAllow - pf - tax - otherDed;

      // Try to find profile by matching employee_id to email prefix or full name
      const empId = row.employee_id?.toLowerCase();
      const profile = profiles?.find(
        (p) => p.email?.toLowerCase().startsWith(empId) || p.full_name?.toLowerCase().includes(empId)
      );

      const { error } = await supabase.from("payroll_records").insert({
        user_id: user.id,
        profile_id: profile?.id || null,
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
      });

      if (error) errors.push(`Row ${row.employee_id}: ${error.message}`);
      else success++;
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

    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
    const errors: string[] = [];
    let success = 0;

    for (const row of rows) {
      const empId = row.employee_id?.toLowerCase();
      const profile = profiles?.find(
        (p) => p.email?.toLowerCase().startsWith(empId) || p.full_name?.toLowerCase().includes(empId)
      );

      const checkInDate = row.check_in && row.date
        ? `${row.date}T${row.check_in}` : null;
      const checkOutDate = row.check_out && row.date
        ? `${row.date}T${row.check_out}` : null;

      const { error } = await supabase.from("attendance_records").insert({
        user_id: user.id,
        profile_id: profile?.id || null,
        date: row.date,
        status: row.status || "present",
        check_in: checkInDate,
        check_out: checkOutDate,
        notes: row.notes || null,
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

export function useRolesBulkUpload(): BulkUploadConfig {
  const qc = useQueryClient();

  const onUpload = useCallback(async (rows: Record<string, string>[]) => {
    const validRoles = ["admin", "hr", "manager", "employee", "finance"];
    const errors: string[] = [];
    let success = 0;

    for (const row of rows) {
      const role = row.role?.toLowerCase().trim();
      if (!validRoles.includes(role)) {
        errors.push(`${row.email}: Invalid role "${row.role}". Must be one of: ${validRoles.join(", ")}`);
        continue;
      }

      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "set_role_by_email", email: row.email, role },
      });

      if (error || data?.error) {
        errors.push(`${row.email}: ${data?.error || error?.message || "Failed"}`);
      } else {
        success++;
      }
    }

    qc.invalidateQueries({ queryKey: ["user-roles"] });
    return { success, errors };
  }, [qc]);

  return {
    module: "roles",
    title: "Bulk Upload Roles",
    description: "Assign roles to multiple users at once using a CSV file with email and role columns.",
    columns: rolesColumns,
    templateFileName: "roles_template.csv",
    templateContent: rolesTemplate,
    onUpload,
  };
}
