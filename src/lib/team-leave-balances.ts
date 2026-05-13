import type { LeaveType } from "@/hooks/useLeaves";

export interface RawTeamBalanceRow {
  id: string;
  profile_id: string | null;
  leave_type: string;
  total_days: number | string;
  used_days: number | string;
  year: number;
  profiles?: {
    full_name: string | null;
    employee_id: string | null;
    department: string | null;
    location: string | null;
    status: string | null;
  } | null;
}

export interface TypeCell {
  total: number;
  used: number;
  remaining: number;
  hasRow: boolean;
}

export interface PivotedEmployee {
  profileId: string;
  fullName: string;
  employeeId: string;
  department: string;
  location: string;
  status: string;
  byType: Record<string, TypeCell>;
  totalAllotted: number;
  totalUsed: number;
  totalRemaining: number;
}

const EMPTY_CELL: TypeCell = { total: 0, used: 0, remaining: 0, hasRow: false };

export function pivotLeaveBalances(
  rows: RawTeamBalanceRow[],
  leaveTypeKeys: string[],
): PivotedEmployee[] {
  const byProfile = new Map<string, PivotedEmployee>();

  for (const row of rows) {
    if (!row.profile_id) continue;
    const profile = row.profiles ?? null;
    let emp = byProfile.get(row.profile_id);
    if (!emp) {
      emp = {
        profileId: row.profile_id,
        fullName: profile?.full_name ?? "—",
        employeeId: profile?.employee_id ?? "—",
        department: profile?.department ?? "—",
        location: profile?.location ?? "—",
        status: profile?.status ?? "—",
        byType: {},
        totalAllotted: 0,
        totalUsed: 0,
        totalRemaining: 0,
      };
      byProfile.set(row.profile_id, emp);
    }

    const total = Number(row.total_days) || 0;
    const used = Number(row.used_days) || 0;
    emp.byType[row.leave_type] = {
      total,
      used,
      remaining: total - used,
      hasRow: true,
    };
  }

  for (const emp of byProfile.values()) {
    for (const key of leaveTypeKeys) {
      if (!emp.byType[key]) emp.byType[key] = { ...EMPTY_CELL };
      const cell = emp.byType[key];
      emp.totalAllotted += cell.total;
      emp.totalUsed += cell.used;
      emp.totalRemaining += cell.remaining;
    }
  }

  return Array.from(byProfile.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );
}

export interface FilterOptions {
  search?: string;
  department?: string;
  status?: string;
}

export function filterPivot(
  pivot: PivotedEmployee[],
  opts: FilterOptions,
): PivotedEmployee[] {
  const q = opts.search?.trim().toLowerCase() ?? "";
  return pivot.filter((emp) => {
    if (opts.department && opts.department !== "all" && emp.department !== opts.department) {
      return false;
    }
    if (opts.status && opts.status !== "all" && emp.status !== opts.status) {
      return false;
    }
    if (q) {
      const hay = `${emp.fullName} ${emp.employeeId} ${emp.department}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function uniqueDepartments(pivot: PivotedEmployee[]): string[] {
  const set = new Set<string>();
  for (const emp of pivot) if (emp.department && emp.department !== "—") set.add(emp.department);
  return Array.from(set).sort();
}

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function buildLongFormatCsv(
  pivot: PivotedEmployee[],
  leaveTypes: Pick<LeaveType, "key" | "label">[],
  year: number,
): string {
  const headers = [
    "Employee ID",
    "Full Name",
    "Department",
    "Location",
    "Status",
    "Year",
    "Leave Type Key",
    "Leave Type Label",
    "Total Days",
    "Used Days",
    "Remaining Days",
  ];
  const lines: string[] = [headers.join(",")];
  for (const emp of pivot) {
    for (const lt of leaveTypes) {
      const cell = emp.byType[lt.key];
      if (!cell || !cell.hasRow) continue;
      lines.push(
        [
          emp.employeeId,
          emp.fullName,
          emp.department,
          emp.location,
          emp.status,
          year,
          lt.key,
          lt.label,
          fmt(cell.total),
          fmt(cell.used),
          fmt(cell.remaining),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

export function buildWideFormatCsv(
  pivot: PivotedEmployee[],
  leaveTypes: Pick<LeaveType, "key" | "label">[],
  year: number,
): string {
  const headers = ["Employee ID", "Full Name", "Department", "Location", "Status", "Year"];
  for (const lt of leaveTypes) {
    headers.push(`${lt.label} Total`, `${lt.label} Used`, `${lt.label} Remaining`);
  }
  headers.push("Overall Total", "Overall Used", "Overall Remaining");

  const lines: string[] = [headers.join(",")];
  for (const emp of pivot) {
    const cols: (string | number)[] = [
      emp.employeeId,
      emp.fullName,
      emp.department,
      emp.location,
      emp.status,
      year,
    ];
    for (const lt of leaveTypes) {
      const cell = emp.byType[lt.key] ?? EMPTY_CELL;
      cols.push(fmt(cell.total), fmt(cell.used), fmt(cell.remaining));
    }
    cols.push(fmt(emp.totalAllotted), fmt(emp.totalUsed), fmt(emp.totalRemaining));
    lines.push(cols.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
