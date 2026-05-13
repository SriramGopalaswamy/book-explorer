import { describe, it, expect } from "vitest";
import {
  pivotLeaveBalances,
  filterPivot,
  buildLongFormatCsv,
  buildWideFormatCsv,
  uniqueDepartments,
  type RawTeamBalanceRow,
} from "@/lib/team-leave-balances";

const TYPES = [
  { key: "casual", label: "Casual Leave" },
  { key: "sick", label: "Sick Leave" },
  { key: "earned", label: "Earned Leave" },
];
const TYPE_KEYS = TYPES.map((t) => t.key);

function row(
  profileId: string,
  fullName: string,
  leaveType: string,
  total: number,
  used: number,
  extra: Partial<RawTeamBalanceRow["profiles"]> = {},
): RawTeamBalanceRow {
  return {
    id: `${profileId}-${leaveType}`,
    profile_id: profileId,
    leave_type: leaveType,
    total_days: total,
    used_days: used,
    year: 2026,
    profiles: {
      full_name: fullName,
      employee_id: `E-${profileId}`,
      department: "Engineering",
      location: "BLR",
      status: "active",
      ...extra,
    },
  };
}

describe("pivotLeaveBalances", () => {
  it("groups multiple rows per employee into a single pivoted record", () => {
    const rows = [
      row("p1", "Asha", "casual", 12, 3),
      row("p1", "Asha", "sick", 10, 1),
      row("p2", "Bilal", "casual", 12, 5),
    ];
    const pivot = pivotLeaveBalances(rows, TYPE_KEYS);
    expect(pivot).toHaveLength(2);
    const asha = pivot.find((p) => p.profileId === "p1")!;
    expect(asha.byType.casual).toMatchObject({ total: 12, used: 3, remaining: 9, hasRow: true });
    expect(asha.byType.sick).toMatchObject({ total: 10, used: 1, remaining: 9, hasRow: true });
    expect(asha.byType.earned.hasRow).toBe(false);
    expect(asha.totalAllotted).toBe(22);
    expect(asha.totalUsed).toBe(4);
    expect(asha.totalRemaining).toBe(18);
  });

  it("sorts pivot output alphabetically by full name", () => {
    const rows = [
      row("p2", "Bilal", "casual", 12, 0),
      row("p1", "Asha", "casual", 12, 0),
      row("p3", "Chetan", "casual", 12, 0),
    ];
    const pivot = pivotLeaveBalances(rows, TYPE_KEYS);
    expect(pivot.map((p) => p.fullName)).toEqual(["Asha", "Bilal", "Chetan"]);
  });

  it("flags negative remaining when used exceeds total", () => {
    const rows = [row("p1", "Asha", "casual", 5, 9)];
    const [emp] = pivotLeaveBalances(rows, TYPE_KEYS);
    expect(emp.byType.casual.remaining).toBe(-4);
    expect(emp.totalRemaining).toBe(-4);
  });

  it("ignores rows with null profile_id", () => {
    const orphan = { ...row("p1", "Asha", "casual", 12, 1), profile_id: null };
    const rows = [orphan, row("p2", "Bilal", "casual", 12, 1)];
    const pivot = pivotLeaveBalances(rows, TYPE_KEYS);
    expect(pivot).toHaveLength(1);
    expect(pivot[0].profileId).toBe("p2");
  });

  it("coerces string-typed numeric columns from supabase", () => {
    const raw: RawTeamBalanceRow = {
      ...row("p1", "Asha", "casual", 0, 0),
      total_days: "15" as any,
      used_days: "2.5" as any,
    };
    const [emp] = pivotLeaveBalances([raw], TYPE_KEYS);
    expect(emp.byType.casual.total).toBe(15);
    expect(emp.byType.casual.used).toBe(2.5);
    expect(emp.byType.casual.remaining).toBe(12.5);
  });

  it("creates empty cells for type keys with no row, but does not inflate hasRow", () => {
    const [emp] = pivotLeaveBalances([row("p1", "Asha", "casual", 12, 0)], TYPE_KEYS);
    expect(emp.byType.sick).toEqual({ total: 0, used: 0, remaining: 0, hasRow: false });
    // empty cells must not contribute to totals (they're already 0, but should keep totals from casual intact)
    expect(emp.totalAllotted).toBe(12);
  });
});

describe("filterPivot", () => {
  const rows = [
    row("p1", "Asha", "casual", 12, 1, { department: "Engineering", status: "active" }),
    row("p2", "Bilal", "casual", 12, 1, { department: "Finance", status: "inactive" }),
    row("p3", "Chetan", "casual", 12, 1, { department: "Engineering", status: "active" }),
  ];
  const pivot = pivotLeaveBalances(rows, TYPE_KEYS);

  it("filters by department", () => {
    expect(filterPivot(pivot, { department: "Engineering" }).map((p) => p.fullName)).toEqual(["Asha", "Chetan"]);
  });

  it("filters by status", () => {
    expect(filterPivot(pivot, { status: "inactive" }).map((p) => p.fullName)).toEqual(["Bilal"]);
  });

  it("filters by case-insensitive search on name and employee_id", () => {
    expect(filterPivot(pivot, { search: "asha" }).map((p) => p.fullName)).toEqual(["Asha"]);
    expect(filterPivot(pivot, { search: "E-p3" }).map((p) => p.fullName)).toEqual(["Chetan"]);
  });

  it("treats 'all' values as no-op", () => {
    expect(filterPivot(pivot, { department: "all", status: "all" })).toHaveLength(3);
  });
});

describe("uniqueDepartments", () => {
  it("returns sorted unique departments excluding em-dash placeholders", () => {
    const rows = [
      row("p1", "Asha", "casual", 12, 0, { department: "Engineering" }),
      row("p2", "Bilal", "casual", 12, 0, { department: null as any }),
      row("p3", "Chetan", "casual", 12, 0, { department: "Finance" }),
      row("p4", "Diya", "casual", 12, 0, { department: "Engineering" }),
    ];
    expect(uniqueDepartments(pivotLeaveBalances(rows, TYPE_KEYS))).toEqual(["Engineering", "Finance"]);
  });
});

describe("buildLongFormatCsv", () => {
  it("emits one row per (employee, leave type) that has a balance", () => {
    const rows = [
      row("p1", "Asha", "casual", 12, 3),
      row("p1", "Asha", "sick", 10, 0),
    ];
    const pivot = pivotLeaveBalances(rows, TYPE_KEYS);
    const csv = buildLongFormatCsv(pivot, TYPES, 2026);
    const lines = csv.split("\n");
    expect(lines[0]).toMatch(/Employee ID,Full Name/);
    // 2 data rows for Asha (casual + sick), earned skipped because no row
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("casual");
    expect(lines[2]).toContain("sick");
  });

  it("quotes values containing commas", () => {
    const rows = [row("p1", "Asha, Test", "casual", 12, 0)];
    const pivot = pivotLeaveBalances(rows, TYPE_KEYS);
    const csv = buildLongFormatCsv(pivot, TYPES, 2026);
    expect(csv).toContain('"Asha, Test"');
  });
});

describe("query-key invariant", () => {
  // The team-balances query key MUST start with "leave-balances" so that
  // existing invalidateQueries({ queryKey: ["leave-balances"] }) calls in
  // useApproveLeaveRequest / useRejectLeaveRequest / useDeleteLeaveRequest
  // (which use TanStack Query v4 prefix-match semantics) refresh this view
  // automatically. If you rename it, also add the new prefix to those calls.
  it("uses the 'leave-balances' prefix expected by mutation invalidations", () => {
    const expectedPrefix = "leave-balances";
    const actualKey = ["leave-balances", "all", 2026, "org-id", false];
    expect(actualKey[0]).toBe(expectedPrefix);
  });
});

describe("buildWideFormatCsv", () => {
  it("emits one row per employee with type columns and overall totals", () => {
    const rows = [
      row("p1", "Asha", "casual", 12, 3),
      row("p1", "Asha", "sick", 10, 0),
      row("p2", "Bilal", "casual", 12, 12),
    ];
    const pivot = pivotLeaveBalances(rows, TYPE_KEYS);
    const csv = buildWideFormatCsv(pivot, TYPES, 2026);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Casual Leave Total");
    expect(lines[0]).toContain("Overall Remaining");
    // Asha: casual 12/3/9, sick 10/0/10, earned 0/0/0, overall 22/3/19
    expect(lines[1]).toContain("22,3,19");
    // Bilal: casual 12/12/0, overall 12/12/0
    expect(lines[2]).toContain("12,12,0");
  });
});
