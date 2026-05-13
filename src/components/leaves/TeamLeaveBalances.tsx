import { useMemo, useState } from "react";
import { Briefcase, Palmtree, Stethoscope, Baby, Home, Calendar, Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { useAllLeaveBalances, useLeaveTypes, type LeaveType } from "@/hooks/useLeaves";
import {
  pivotLeaveBalances,
  filterPivot,
  uniqueDepartments,
  buildLongFormatCsv,
  buildWideFormatCsv,
  downloadCsv,
  type RawTeamBalanceRow,
  type PivotedEmployee,
} from "@/lib/team-leave-balances";

const iconMap: Record<string, typeof Palmtree> = {
  Palmtree, Stethoscope, Baby, Briefcase, Home, Calendar,
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function getIcon(name: string) {
  return iconMap[name] || Briefcase;
}

interface CellProps {
  total: number;
  used: number;
  remaining: number;
  hasRow: boolean;
}

function BalanceCell({ total, used, remaining, hasRow }: CellProps) {
  if (!hasRow) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  const negative = remaining < 0;
  return (
    <span
      className="inline-flex flex-col items-end leading-tight"
      title={`Total ${fmt(total)} · Used ${fmt(used)} · Remaining ${fmt(remaining)}`}
    >
      <span className={`text-sm font-medium ${negative ? "text-destructive" : ""}`}>{fmt(remaining)}</span>
      <span className="text-[10px] text-muted-foreground">of {fmt(total)}</span>
    </span>
  );
}

const YEAR_OPTIONS = (() => {
  const cur = new Date().getFullYear();
  return [cur + 1, cur, cur - 1, cur - 2];
})();

export function TeamLeaveBalances() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<"pivot" | "by-type">("pivot");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: leaveTypes = [], isLoading: typesLoading } = useLeaveTypes();
  const { data: rows = [], isLoading: rowsLoading } = useAllLeaveBalances(year);

  const activeTypes: LeaveType[] = useMemo(
    () => leaveTypes.filter((lt) => lt.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [leaveTypes],
  );

  const pivot = useMemo(
    () => pivotLeaveBalances(rows as RawTeamBalanceRow[], activeTypes.map((t) => t.key)),
    [rows, activeTypes],
  );

  const filtered = useMemo(
    () => filterPivot(pivot, { search, department, status: statusFilter }),
    [pivot, search, department, statusFilter],
  );

  const departments = useMemo(() => uniqueDepartments(pivot), [pivot]);
  const pagination = usePagination(filtered, 15);

  const handleExport = (format: "wide" | "long") => {
    const csv =
      format === "wide"
        ? buildWideFormatCsv(filtered, activeTypes, year)
        : buildLongFormatCsv(filtered, activeTypes, year);
    downloadCsv(csv, `team_leave_balances_${year}_${format}.csv`);
  };

  const isLoading = typesLoading || rowsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on_leave">On leave</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / employee ID"
            className="pl-8"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("wide")}>
                Wide format (one row per employee)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("long")}>
                Long format (one row per employee + type)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as "pivot" | "by-type")}>
        <TabsList>
          <TabsTrigger value="pivot">Overall</TabsTrigger>
          <TabsTrigger value="by-type">By Leave Type</TabsTrigger>
        </TabsList>

        <TabsContent value="pivot">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No leave balances found for {year}.
            </div>
          ) : (
            <>
              <div className="w-full overflow-auto max-h-[65vh] border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
                    <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                      <th className="text-left px-3 py-2 sticky left-0 bg-muted/50 backdrop-blur min-w-[200px]">Employee</th>
                      <th className="text-left px-3 py-2 min-w-[120px]">Department</th>
                      {activeTypes.map((lt) => {
                        const Icon = getIcon(lt.icon);
                        return (
                          <th key={lt.key} className="text-right px-3 py-2 min-w-[110px]">
                            <span className="inline-flex items-center gap-1 justify-end">
                              <Icon className={`h-3 w-3 ${lt.color}`} />
                              <span className="truncate" title={lt.label}>{lt.label}</span>
                            </span>
                          </th>
                        );
                      })}
                      <th className="text-right px-3 py-2 min-w-[110px] bg-muted/70">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedItems.map((emp, idx) => (
                      <tr
                        key={emp.profileId}
                        className={`border-t border-border/50 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                      >
                        <td className="px-3 py-2 sticky left-0 bg-inherit">
                          <div className="font-medium truncate max-w-[200px]" title={emp.fullName}>{emp.fullName}</div>
                          <div className="text-xs text-muted-foreground">{emp.employeeId}</div>
                        </td>
                        <td className="px-3 py-2 truncate max-w-[120px]" title={emp.department}>
                          {emp.department}
                        </td>
                        {activeTypes.map((lt) => {
                          const cell = emp.byType[lt.key];
                          return (
                            <td key={lt.key} className="px-3 py-2 text-right">
                              <BalanceCell
                                total={cell?.total ?? 0}
                                used={cell?.used ?? 0}
                                remaining={cell?.remaining ?? 0}
                                hasRow={!!cell?.hasRow}
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right bg-muted/30 font-medium">
                          <span
                            className={emp.totalRemaining < 0 ? "text-destructive" : ""}
                            title={`Total ${fmt(emp.totalAllotted)} · Used ${fmt(emp.totalUsed)} · Remaining ${fmt(emp.totalRemaining)}`}
                          >
                            {fmt(emp.totalRemaining)}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">of {fmt(emp.totalAllotted)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <TablePagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  from={pagination.from}
                  to={pagination.to}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="by-type">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : activeTypes.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No active leave types configured.</div>
          ) : (
            <div className="space-y-6">
              {activeTypes.map((lt) => (
                <ByTypeCard key={lt.key} type={lt} employees={filtered} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ByTypeCardProps {
  type: LeaveType;
  employees: PivotedEmployee[];
}

function ByTypeCard({ type, employees }: ByTypeCardProps) {
  const Icon = getIcon(type.icon);
  const rows = employees
    .map((emp) => ({ emp, cell: emp.byType[type.key] }))
    .filter((r) => r.cell?.hasRow);

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.cell!.total;
      acc.used += r.cell!.used;
      acc.remaining += r.cell!.remaining;
      return acc;
    },
    { total: 0, used: 0, remaining: 0 },
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${type.color}`} />
          <div>
            <p className="font-semibold">{type.label}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} employee{rows.length === 1 ? "" : "s"} · {fmt(totals.remaining)} remaining of {fmt(totals.total)} · {fmt(totals.used)} used
            </p>
          </div>
        </div>
        <Badge variant="outline">Default {type.default_days}d</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">No balances under this type match the current filters.</p>
      ) : (
        <div className="divide-y divide-border/50 max-h-[400px] overflow-auto">
          {rows.map(({ emp, cell }) => {
            const negative = (cell!.remaining) < 0;
            return (
              <div key={emp.profileId} className="px-4 py-2 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{emp.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{emp.employeeId} · {emp.department}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">Used <span className="text-foreground font-medium">{fmt(cell!.used)}</span></span>
                  <span className="text-muted-foreground">Total <span className="text-foreground font-medium">{fmt(cell!.total)}</span></span>
                  <span>
                    <Badge variant="outline" className={negative ? "border-destructive/40 text-destructive" : ""}>
                      {fmt(cell!.remaining)} left
                    </Badge>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
