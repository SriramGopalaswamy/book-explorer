/**
 * HR & Payroll Tools
 *
 * Covers: employees, attendance, leaves, payroll processing,
 * TDS, payslips, payroll analytics.
 *
 * Maps to Supabase tables:
 *   profiles, attendance_records, leave_requests, leave_balances,
 *   payroll_records, payroll_runs, payroll_entries, compensation_structures
 */

import { getSupabaseClient, resolveOrgId, query } from "../supabase-client.js";
import { McpTool, ok, fail } from "../types.js";

function db() {
  return getSupabaseClient();
}

export const hrTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "list_employees",
    description:
      "List all employees in the organization with their role, department, and status.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        department: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "inactive", "terminated"],
          default: "active",
        },
        limit: { type: "number", default: 100 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("profiles")
          .select(
            "id, full_name, email, department, designation, date_of_joining, status, employee_id"
          )
          .order("full_name")
          .limit((args.limit as number) ?? 100)
          .range(
            (args.offset as number) ?? 0,
            ((args.offset as number) ?? 0) + ((args.limit as number) ?? 100) - 1
          );

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.department) q = q.eq("department", args.department as string);
        if (args.status) q = q.eq("status", args.status as string);

        const data = await query(() => q);
        return ok({ employees: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_employee",
    description:
      "Fetch full profile details for a single employee including compensation, " +
      "designation, contact info, and joining date.",
    inputSchema: {
      type: "object",
      properties: {
        employee_id: { type: "string", description: "Employee UUID" },
        organization_id: { type: "string" },
      },
      required: ["employee_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("profiles")
          .select("*")
          .eq("id", args.employee_id as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const data = await query(() => q.single());
        return ok({ employee: data });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_attendance_summary",
    description:
      "Get attendance statistics for an employee or the entire team for a date range. " +
      "Returns present days, absent days, late arrivals, and leave days.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        employee_id: { type: "string", description: "Omit to get org-wide summary" },
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["start_date", "end_date"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("attendance_records")
          .select("employee_id, date, status, check_in_time, check_out_time, hours_worked")
          .gte("date", args.start_date as string)
          .lte("date", args.end_date as string);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.employee_id) q = q.eq("employee_id", args.employee_id as string);

        const records = await query(() => q) as Array<{
          employee_id: string;
          status: string;
          hours_worked?: number;
        }>;

        const present = records.filter((r) => r.status === "present").length;
        const absent = records.filter((r) => r.status === "absent").length;
        const late = records.filter((r) => r.status === "late").length;
        const onLeave = records.filter((r) => r.status === "leave").length;
        const totalHours = records.reduce((s, r) => s + (r.hours_worked ?? 0), 0);

        return ok({
          period: { start_date: args.start_date, end_date: args.end_date },
          employee_id: args.employee_id ?? "all",
          present_days: present,
          absent_days: absent,
          late_days: late,
          leave_days: onLeave,
          total_records: records.length,
          total_hours_worked: totalHours,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "get_leave_balances",
    description:
      "Get leave balance for an employee: casual leave, sick leave, earned leave, etc.",
    inputSchema: {
      type: "object",
      properties: {
        employee_id: { type: "string" },
        organization_id: { type: "string" },
      },
      required: ["employee_id"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("leave_balances")
          .select("*")
          .eq("employee_id", args.employee_id as string);

        if (orgId) q = q.eq("organization_id", orgId);

        const data = await query(() => q);
        return ok({ leave_balances: data, employee_id: args.employee_id });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 5
  {
    name: "list_leave_requests",
    description:
      "List leave requests with filters for status, employee, and date range.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        employee_id: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "approved", "rejected", "cancelled"],
        },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("leave_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit((args.limit as number) ?? 50);

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.employee_id) q = q.eq("employee_id", args.employee_id as string);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.start_date) q = q.gte("start_date", args.start_date as string);
        if (args.end_date) q = q.lte("end_date", args.end_date as string);

        const data = await query(() => q);
        return ok({ leave_requests: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 6
  {
    name: "get_employee_stats",
    description:
      "Return workforce statistics: headcount by department, average tenure, " +
      "new hires this month, attrition rate.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);

        let q = db()
          .from("profiles")
          .select("id, department, date_of_joining, status, employment_type");

        if (orgId) q = q.eq("organization_id", orgId);

        const employees = await query(() => q) as Array<{
          department: string;
          status: string;
          date_of_joining: string;
          employment_type: string;
        }>;

        const active = employees.filter((e) => e.status === "active");
        const byDept: Record<string, number> = {};
        for (const e of active) {
          byDept[e.department ?? "Unassigned"] = (byDept[e.department ?? "Unassigned"] ?? 0) + 1;
        }

        const thisMonth = new Date();
        thisMonth.setDate(1);
        const newHires = active.filter(
          (e) => e.date_of_joining && new Date(e.date_of_joining) >= thisMonth
        ).length;

        return ok({
          total_employees: employees.length,
          active_employees: active.length,
          inactive_employees: employees.length - active.length,
          headcount_by_department: byDept,
          new_hires_this_month: newHires,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },
];

export const payrollTools: McpTool[] = [
  // ------------------------------------------------------------------ 1
  {
    name: "get_payroll_summary",
    description:
      "Get payroll summary for a pay period: total gross, deductions (PF/ESI/PT/TDS), " +
      "and net pay. Answers 'What is total payroll cost this month?'",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        pay_period: {
          type: "string",
          description: "YYYY-MM format (e.g. 2024-03)",
        },
        department: { type: "string" },
      },
      required: ["pay_period"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const [year, month] = (args.pay_period as string).split("-");

        let q = db()
          .from("payroll_records")
          .select(
            "employee_id, gross_salary, basic_salary, hra, pf_deduction, esi_deduction, pt_deduction, tds_deduction, net_salary, status, department"
          )
          .eq("month", parseInt(month, 10))
          .eq("year", parseInt(year, 10));

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.department) q = q.eq("department", args.department as string);

        const records = await query(() => q) as Array<{
          gross_salary: number;
          basic_salary: number;
          pf_deduction: number;
          esi_deduction: number;
          pt_deduction: number;
          tds_deduction: number;
          net_salary: number;
          status: string;
        }>;

        const processed = records.filter((r) => r.status !== "cancelled");
        const totals = processed.reduce(
          (acc, r) => ({
            gross: acc.gross + (r.gross_salary ?? 0),
            net: acc.net + (r.net_salary ?? 0),
            pf: acc.pf + (r.pf_deduction ?? 0),
            esi: acc.esi + (r.esi_deduction ?? 0),
            pt: acc.pt + (r.pt_deduction ?? 0),
            tds: acc.tds + (r.tds_deduction ?? 0),
          }),
          { gross: 0, net: 0, pf: 0, esi: 0, pt: 0, tds: 0 }
        );

        return ok({
          pay_period: args.pay_period,
          employee_count: processed.length,
          total_gross_salary: totals.gross,
          total_net_salary: totals.net,
          deductions: {
            pf: totals.pf,
            esi: totals.esi,
            pt: totals.pt,
            tds: totals.tds,
            total: totals.pf + totals.esi + totals.pt + totals.tds,
          },
          employer_pf: totals.pf,
          total_payroll_cost: totals.gross + totals.pf,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    name: "get_payroll_records",
    description:
      "Retrieve individual payroll records for a pay period with optional employee filter.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        pay_period: { type: "string", description: "YYYY-MM" },
        employee_id: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "under_review", "approved", "pending", "processed", "locked"],
        },
      },
      required: ["pay_period"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const [year, month] = (args.pay_period as string).split("-");

        let q = db()
          .from("payroll_records")
          .select("*")
          .eq("month", parseInt(month, 10))
          .eq("year", parseInt(year, 10))
          .order("created_at");

        if (orgId) q = q.eq("organization_id", orgId);
        if (args.employee_id) q = q.eq("employee_id", args.employee_id as string);
        if (args.status) q = q.eq("status", args.status as string);

        const data = await query(() => q);
        return ok({ payroll_records: data, count: (data as unknown[]).length });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    name: "get_tds_liability",
    description:
      "Calculate total TDS deducted for the financial year or quarter. " +
      "Answers 'What TDS do we owe this quarter?'",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        financial_year: {
          type: "string",
          description: "e.g. '2024-25'",
        },
        quarter: {
          type: "number",
          enum: [1, 2, 3, 4],
          description: "Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar",
        },
      },
      required: ["financial_year"],
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const [fyStart] = (args.financial_year as string).split("-");
        const startYear = parseInt(fyStart, 10);

        // Quarter month ranges (Indian FY: Apr-Mar)
        const quarterMonths: Record<number, { months: number[]; year: number }[]> = {
          1: [{ months: [4, 5, 6], year: startYear }],
          2: [{ months: [7, 8, 9], year: startYear }],
          3: [{ months: [10, 11, 12], year: startYear }],
          4: [{ months: [1, 2, 3], year: startYear + 1 }],
        };

        let q = db()
          .from("payroll_records")
          .select("month, year, tds_deduction, employee_id, status")
          .neq("status", "cancelled");

        if (orgId) q = q.eq("organization_id", orgId);

        if (args.quarter) {
          const ranges = quarterMonths[args.quarter as number];
          // Filter by year and months for the quarter
          const months = ranges.flatMap((r) => r.months);
          q = q.in("month", months).eq("year", ranges[0].year);
        } else {
          // Whole financial year
          q = q
            .or(
              `and(year.eq.${startYear},month.gte.4),and(year.eq.${startYear + 1},month.lte.3)`
            );
        }

        const records = await query(() => q) as Array<{
          month: number;
          year: number;
          tds_deduction: number;
          employee_id: string;
        }>;

        const totalTds = records.reduce((s, r) => s + (r.tds_deduction ?? 0), 0);

        // Group by month
        const byMonth: Record<string, number> = {};
        for (const r of records) {
          const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
          byMonth[key] = (byMonth[key] ?? 0) + r.tds_deduction;
        }

        return ok({
          financial_year: args.financial_year,
          quarter: args.quarter ?? "Full Year",
          total_tds_deducted: totalTds,
          employee_count: new Set(records.map((r) => r.employee_id)).size,
          breakdown_by_month: byMonth,
        });
      } catch (e) {
        return fail(e);
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    name: "get_payroll_analytics",
    description:
      "Get payroll cost trends over multiple months: gross salary, headcount, " +
      "average salary, PF/ESI trend.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        months: {
          type: "number",
          description: "Number of past months to include (default 6)",
          default: 6,
        },
      },
    },
    handler: async (args) => {
      try {
        const orgId = resolveOrgId(args.organization_id as string | undefined);
        const monthsBack = (args.months as number) ?? 6;
        const now = new Date();

        let q = db()
          .from("payroll_records")
          .select("month, year, gross_salary, net_salary, pf_deduction, tds_deduction, status")
          .neq("status", "cancelled")
          .order("year", { ascending: true })
          .order("month", { ascending: true });

        if (orgId) q = q.eq("organization_id", orgId);

        const records = await query(() => q) as Array<{
          month: number;
          year: number;
          gross_salary: number;
          net_salary: number;
          pf_deduction: number;
          tds_deduction: number;
        }>;

        // Group by YYYY-MM
        const grouped: Record<
          string,
          { gross: number; net: number; pf: number; tds: number; count: number }
        > = {};
        for (const r of records) {
          const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
          if (!grouped[key]) grouped[key] = { gross: 0, net: 0, pf: 0, tds: 0, count: 0 };
          grouped[key].gross += r.gross_salary ?? 0;
          grouped[key].net += r.net_salary ?? 0;
          grouped[key].pf += r.pf_deduction ?? 0;
          grouped[key].tds += r.tds_deduction ?? 0;
          grouped[key].count += 1;
        }

        // Take last N months
        const months = Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-monthsBack)
          .map(([period, d]) => ({
            period,
            total_gross: d.gross,
            total_net: d.net,
            total_pf: d.pf,
            total_tds: d.tds,
            employee_count: d.count,
            average_gross: d.count > 0 ? d.gross / d.count : 0,
          }));

        return ok({ payroll_trend: months, months_analyzed: months.length });
      } catch (e) {
        return fail(e);
      }
    },
  },
];
