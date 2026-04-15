import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/TablePagination";
import {
  Shield,
  Search,
  FilterX,
  Activity,
  User,
  Target,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Monitor, AlertTriangle, Clock, LogIn } from "lucide-react";
import { AuditIntegrityVerifier } from "@/components/audit/AuditIntegrityVerifier";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdminOrHR } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import {
  useAuditLogs,
  ACTION_LABELS,
  ENTITY_LABELS,
  ACTION_COLORS,
  defaultColor,
  type AuditLogFilters,
} from "@/hooks/useAuditLogs";
import { useUserSessions, type UserSession } from "@/hooks/useUserSessions";

const DEFAULT_PAGE_SIZE = 25;

const ENTITY_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "leave_request", label: "Leave" },
  { value: "attendance_correction", label: "Attendance Correction" },
  { value: "memo", label: "Memo" },
  { value: "payroll", label: "Payroll" },
  { value: "employee", label: "Employee" },
  { value: "goal_plan", label: "Goal Plan" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "leave_submitted", label: "Leave Submitted" },
  { value: "leave_approved", label: "Leave Approved" },
  { value: "leave_rejected", label: "Leave Rejected" },
  { value: "leave_cancelled", label: "Leave Cancelled" },
  { value: "correction_submitted", label: "Correction Submitted" },
  { value: "correction_approved", label: "Correction Approved" },
  { value: "correction_rejected", label: "Correction Rejected" },
  { value: "memo_submitted", label: "Memo Submitted" },
  { value: "memo_approved", label: "Memo Approved" },
  { value: "memo_rejected", label: "Memo Rejected" },
  { value: "payroll_processed", label: "Payroll Processed" },
  { value: "role_changed", label: "Role Changed" },
  { value: "goal_plan_submitted", label: "Goal Plan Submitted" },
  { value: "goal_plan_approved", label: "Goal Plan Approved" },
  { value: "goal_plan_rejected", label: "Goal Plan Rejected" },
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  sign_in: "Sign In",
  sign_out: "Sign Out",
  failed_login: "Failed Login",
  password_reset: "Password Reset",
  token_refresh: "Token Refresh",
  session_expired: "Session Expired",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  sign_in: "bg-green-500/10 text-green-500",
  sign_out: "bg-muted text-muted-foreground",
  failed_login: "bg-destructive/10 text-destructive",
  password_reset: "bg-yellow-500/10 text-yellow-600",
  token_refresh: "bg-blue-500/10 text-blue-500",
  session_expired: "bg-orange-500/10 text-orange-500",
};

function SessionHistoryTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filters = {
    ...(search && { search }),
    ...(eventType !== "all" && { eventType }),
    anomalyOnly,
    ...(fromDate && { from: fromDate }),
    ...(toDate && { to: toDate }),
  };

  const { data, isLoading } = useUserSessions(filters, page, pageSize);
  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const anomalyCount = data?.anomalyCount ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const hasFilters = search || eventType !== "all" || anomalyOnly || fromDate || toDate;

  function resetFilters() {
    setSearch("");
    setEventType("all");
    setAnomalyOnly(false);
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
            <LogIn className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Matching current filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Anomalies</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{anomalyCount}</div>
            <p className="text-xs text-muted-foreground">Suspicious login events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(sessions.map((s) => s.user_id)).size}
            </div>
            <p className="text-xs text-muted-foreground">On this page</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Devices</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(sessions.map((s) => `${s.device_info?.browser}/${s.device_info?.os}`)).size}
            </div>
            <p className="text-xs text-muted-foreground">Unique browser/OS combos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                User Session History
              </CardTitle>
              <CardDescription>Login/logout events with device info and anomaly detection (IT Act 2000 §43A compliant)</CardDescription>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="All Events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="sign_in">Sign In</SelectItem>
                <SelectItem value="sign_out">Sign Out</SelectItem>
                <SelectItem value="failed_login">Failed Login</SelectItem>
                <SelectItem value="password_reset">Password Reset</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={anomalyOnly ? "destructive" : "outline"}
              onClick={() => { setAnomalyOnly(!anomalyOnly); setPage(1); }}
              className="gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              {anomalyOnly ? "Showing Anomalies" : "Anomalies Only"}
            </Button>

            {hasFilters ? (
              <Button variant="outline" onClick={resetFilters} className="gap-2">
                <FilterX className="h-4 w-4" />
                Clear
              </Button>
            ) : <div />}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Label className="text-xs text-muted-foreground shrink-0">Date range:</Label>
            <Input
              type="date"
              className="h-8 text-sm w-40"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            />
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <Input
              type="date"
              className="h-8 text-sm w-40"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Monitor className="h-10 w-10 opacity-20" />
              <p className="text-sm">No session events found{hasFilters ? " matching your filters" : ""}.</p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>Clear Filters</Button>
              )}
            </div>
          ) : (
            <>
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Timestamp</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id} className={s.is_anomaly ? "bg-destructive/5" : undefined}>
                        <TableCell className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                          <div>{format(parseISO(s.created_at), "MMM d, yyyy")}</div>
                          <div className="text-muted-foreground/60">{format(parseISO(s.created_at), "HH:mm:ss")}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[s.event_type] || "bg-muted text-muted-foreground"}`}>
                            {EVENT_TYPE_LABELS[s.event_type] || s.event_type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{s.full_name || "Unknown"}</span>
                            <span className="text-xs text-muted-foreground">{s.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span>{s.device_info?.browser || "—"} / {s.device_info?.os || "—"}</span>
                            <span className="text-muted-foreground/60">{s.device_info?.type || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.is_anomaly ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant="destructive" className="text-xs w-fit">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Anomaly
                              </Badge>
                              {s.anomaly_reasons?.map((r, i) => (
                                <span key={i} className="text-xs text-destructive/80">
                                  {r.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Normal</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="px-4 py-3 border-t border-border/40">
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={total}
                  from={startItem}
                  to={endItem}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] ?? defaultColor();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color.bg} ${color.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${color.dot}`} />
      {ACTION_LABELS[action] ?? action.replace(/_/g, " ")}
    </span>
  );
}

function MetadataTooltip({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(
    ([k]) => !["id", "user_id"].includes(k)
  );
  if (entries.length === 0) return <span className="text-muted-foreground/40">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-xs">
      {entries.slice(0, 3).map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 text-xs bg-muted/60 border border-border/40 rounded px-1.5 py-0.5 text-muted-foreground"
        >
          <span className="font-medium text-foreground/70">{k.replace(/_/g, " ")}:</span>
          <span className="truncate max-w-24">{String(v ?? "")}</span>
        </span>
      ))}
      {entries.length > 3 && (
        <span className="text-xs text-muted-foreground">+{entries.length - 3} more</span>
      )}
    </div>
  );
}

export default function AuditLog() {
  const { user } = useAuth();
  const { data: isAdminOrHR, isLoading: roleLoading } = useIsAdminOrHR();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filters: AuditLogFilters = {
    ...(search && { search }),
    ...(entityType && entityType !== "all" && { entityType }),
    ...(action && action !== "all" && { action }),
    ...(fromDate && { from: fromDate }),
    ...(toDate && { to: toDate }),
  };

  const { data, isLoading } = useAuditLogs(filters, page, pageSize);
  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const uniqueActors = data?.uniqueActors ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function resetFilters() {
    setSearch("");
    setEntityType("all");
    setAction("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const hasFilters = search || (entityType && entityType !== "all") || (action && action !== "all") || fromDate || toDate;

  if (roleLoading) {
    return (
      <MainLayout title="Audit Log" subtitle="Loading…">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </MainLayout>
    );
  }

  if (!isAdminOrHR) {
    return <AccessDenied />;
  }

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <MainLayout
      title="Audit Log"
      subtitle="Full record of all workflow actions performed in the system"
    >
      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events"><Activity className="h-4 w-4 mr-1" />Event Log</TabsTrigger>
          <TabsTrigger value="sessions"><Monitor className="h-4 w-4 mr-1" />User Sessions</TabsTrigger>
          <TabsTrigger value="integrity"><ShieldCheck className="h-4 w-4 mr-1" />Integrity Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Matching current filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique Actors</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueActors}</div>
            <p className="text-xs text-muted-foreground">Distinct "Performed By" users matching filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Action Types</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(logs.map((l) => l.action)).size}
            </div>
            <p className="text-xs text-muted-foreground">On this page</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Workflow Actions
              </CardTitle>
              <CardDescription>All leave, correction, memo, and payroll workflow events</CardDescription>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search actor, target, action…"
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Entity Type */}
            <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action */}
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasFilters ? (
              <Button variant="outline" onClick={resetFilters} className="gap-2">
                <FilterX className="h-4 w-4" />
                Clear
              </Button>
            ) : <div />}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-3 pt-1">
            <Label className="text-xs text-muted-foreground shrink-0">Date range:</Label>
            <Input
              type="date"
              className="h-8 text-sm w-40"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            />
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <Input
              type="date"
              className="h-8 text-sm w-40"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Activity className="h-10 w-10 opacity-20" />
              <p className="text-sm">No audit events found{hasFilters ? " matching your filters" : ""}.</p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead>Target / Subject</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        {/* Timestamp */}
                        <TableCell className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                          <div>{format(parseISO(log.created_at), "MMM d, yyyy")}</div>
                          <div className="text-muted-foreground/60">
                            {format(parseISO(log.created_at), "HH:mm:ss")}
                          </div>
                        </TableCell>

                        {/* Action badge */}
                        <TableCell>
                          <ActionBadge action={log.action} />
                        </TableCell>

                        {/* Entity type */}
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                          </span>
                        </TableCell>

                        {/* Actor */}
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {log.actor_name ?? "Unknown"}
                            </span>
                            {log.actor_role && (
                              <span className="text-xs text-muted-foreground capitalize">
                                {log.actor_role}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Target */}
                        <TableCell>
                          {log.target_name ? (
                            <span className="text-sm">{log.target_name}</span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Metadata */}
                        <TableCell>
                          <MetadataTooltip metadata={log.metadata ?? {}} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="px-4 py-3 border-t border-border/40">
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={total}
                  from={startItem}
                  to={endItem}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <SessionHistoryTab />
        </TabsContent>

        <TabsContent value="integrity">
          <AuditIntegrityVerifier />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
