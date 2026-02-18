import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  ClipboardEdit,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Palmtree,
  Stethoscope,
  Briefcase,
  Baby,
  Home,
} from "lucide-react";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyTodayAttendance, useSelfCheckIn, useSelfCheckOut } from "@/hooks/useAttendance";
import { useLeaveBalances, useCreateLeaveRequest } from "@/hooks/useLeaves";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  present: { label: "Present", class: "bg-green-100 text-green-700 border-green-200" },
  late: { label: "Late", class: "bg-amber-100 text-amber-700 border-amber-200" },
  absent: { label: "Absent", class: "bg-red-100 text-red-700 border-red-200" },
  leave: { label: "On Leave", class: "bg-blue-100 text-blue-700 border-blue-200" },
  half_day: { label: "Half Day", class: "bg-purple-100 text-purple-700 border-purple-200" },
};

const CORRECTION_STATUS_BADGE: Record<string, { label: string; icon: React.ElementType; class: string }> = {
  pending: { label: "Pending", icon: AlertCircle, class: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", icon: CheckCircle2, class: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", icon: XCircle, class: "bg-red-100 text-red-700 border-red-200" },
};

const LEAVE_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  casual: { icon: Palmtree, label: "Casual Leave" },
  sick: { icon: Stethoscope, label: "Sick Leave" },
  earned: { icon: Briefcase, label: "Earned Leave" },
  maternity: { icon: Baby, label: "Maternity/Paternity" },
  paternity: { icon: Baby, label: "Paternity Leave" },
  wfh: { icon: Home, label: "Work From Home" },
};

// ─── Hooks ────────────────────────────────────────────────────────────
function useMyAttendanceHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-attendance-history", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

function useMyCorrectionRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-correction-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("attendance_correction_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

function useSubmitCorrectionRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      date: string;
      requested_check_in: string;
      requested_check_out: string;
      reason: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("attendance_correction_requests")
        .insert({
          user_id: user.id,
          profile_id: profile?.id ?? null,
          date: payload.date,
          requested_check_in: payload.requested_check_in || null,
          requested_check_out: payload.requested_check_out || null,
          reason: payload.reason,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["my-correction-requests"] });
      toast.success("Correction request submitted — your manager will review it.");
      if (user) {
        supabase.from("audit_logs" as any).insert({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: "correction_submitted", entity_type: "attendance_correction", entity_id: data.id, metadata: {} } as any).then(({ error: e }) => { if (e) console.warn("Audit write failed:", e.message); });
      }
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "correction_request_created",
          payload: { correction_request_id: data.id },
        },
      }).catch((err) => console.warn("Failed to send correction created notification:", err));
    },
    onError: (e: any) => toast.error("Failed to submit: " + e.message),
  });
}

// ─── Component ────────────────────────────────────────────────────────
export default function MyAttendance() {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState("overview");

  // Leave dialog state
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Correction dialog state
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [corrDate, setCorrDate] = useState(new Date().toISOString().split("T")[0]);
  const [corrCheckIn, setCorrCheckIn] = useState("");
  const [corrCheckOut, setCorrCheckOut] = useState("");
  const [corrReason, setCorrReason] = useState("");

  const { data: todayAttendance, isLoading: isLoadingToday } = useMyTodayAttendance();
  const { data: history = [], isLoading: isLoadingHistory } = useMyAttendanceHistory();
  const { data: leaveBalances = [], isLoading: isLoadingBalances } = useLeaveBalances();
  const { data: corrections = [], isLoading: isLoadingCorrections } = useMyCorrectionRequests();

  const checkIn = useSelfCheckIn();
  const checkOut = useSelfCheckOut();
  const submitLeave = useCreateLeaveRequest();
  const submitCorrection = useSubmitCorrectionRequest();

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLeaveSubmit = async () => {
    if (!fromDate || !toDate) return;
    await submitLeave.mutateAsync({
      leave_type: leaveType as any,
      from_date: fromDate,
      to_date: toDate,
      reason: leaveReason,
    });
    setLeaveOpen(false);
    setFromDate("");
    setToDate("");
    setLeaveReason("");
  };

  const handleCorrectionSubmit = async () => {
    if (!corrDate || !corrReason) return;
    await submitCorrection.mutateAsync({
      date: corrDate,
      requested_check_in: corrCheckIn,
      requested_check_out: corrCheckOut,
      reason: corrReason,
    });
    setCorrectionOpen(false);
    setCorrCheckIn("");
    setCorrCheckOut("");
    setCorrReason("");
  };

  const isCheckedIn = !!todayAttendance?.check_in;
  const isCheckedOut = !!todayAttendance?.check_out;

  return (
    <MainLayout title="My Attendance" subtitle="Track your attendance, leaves, and corrections">
      <div className="space-y-6">

        {/* ── Today's clock-in card ─────────────────────────── */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              {/* Live clock */}
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {format(currentTime, "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-4xl font-bold font-mono tracking-tight text-foreground mt-1">
                  {format(currentTime, "HH:mm:ss")}
                </p>
              </div>

              {/* Status & actions */}
              <div className="flex flex-col gap-3 min-w-[260px]">
                {isLoadingToday ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <LogIn className="h-4 w-4 text-success" />
                        <span>Check-in:</span>
                        <span className="font-medium text-foreground">
                          {todayAttendance?.check_in
                            ? format(new Date(todayAttendance.check_in), "HH:mm")
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <LogOut className="h-4 w-4 text-destructive" />
                        <span>Check-out:</span>
                        <span className="font-medium text-foreground">
                          {todayAttendance?.check_out
                            ? format(new Date(todayAttendance.check_out), "HH:mm")
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {todayAttendance?.status && (
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE[todayAttendance.status]?.class}
                      >
                        {STATUS_BADGE[todayAttendance.status]?.label}
                      </Badge>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={() => checkIn.mutate()}
                        disabled={isCheckedIn || checkIn.isPending}
                        size="sm"
                        className="flex-1"
                      >
                        <LogIn className="h-4 w-4 mr-1.5" />
                        {isCheckedIn ? "Checked In" : "Check In"}
                      </Button>
                      <Button
                        onClick={() => todayAttendance && checkOut.mutate(todayAttendance.id)}
                        disabled={!isCheckedIn || isCheckedOut || checkOut.isPending}
                        size="sm"
                        variant="outline"
                        className="flex-1"
                      >
                        <LogOut className="h-4 w-4 mr-1.5" />
                        {isCheckedOut ? "Checked Out" : "Check Out"}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Quick action buttons */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLeaveOpen(true)}
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Apply Leave
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCorrectionOpen(true)}
                  className="gap-2"
                >
                  <ClipboardEdit className="h-4 w-4" />
                  Request Correction
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="overview">Attendance Log</TabsTrigger>
            <TabsTrigger value="leaves">Leave Balance</TabsTrigger>
            <TabsTrigger value="corrections">Corrections</TabsTrigger>
          </TabsList>

          {/* ── Attendance Log ── */}
          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Last 30 Days</CardTitle>
                <CardDescription>Your recent attendance records</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No attendance records yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Check In</TableHead>
                        <TableHead>Check Out</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((rec: any) => {
                        const duration =
                          rec.check_in && rec.check_out
                            ? (() => {
                                const diff =
                                  new Date(rec.check_out).getTime() -
                                  new Date(rec.check_in).getTime();
                                const h = Math.floor(diff / 3600000);
                                const m = Math.floor((diff % 3600000) / 60000);
                                return `${h}h ${m}m`;
                              })()
                            : "—";
                        return (
                          <TableRow key={rec.id}>
                            <TableCell className="font-medium">
                              {format(new Date(rec.date), "EEE, MMM d")}
                            </TableCell>
                            <TableCell>
                              {rec.check_in ? format(new Date(rec.check_in), "HH:mm") : "—"}
                            </TableCell>
                            <TableCell>
                              {rec.check_out ? format(new Date(rec.check_out), "HH:mm") : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{duration}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={STATUS_BADGE[rec.status]?.class}
                              >
                                {STATUS_BADGE[rec.status]?.label ?? rec.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Leave Balance ── */}
          <TabsContent value="leaves" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {isLoadingBalances
                ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
                : leaveBalances.map((bal: any) => {
                    const cfg = LEAVE_TYPE_CONFIG[bal.leave_type] ?? { icon: Calendar, label: bal.leave_type };
                    const Icon = cfg.icon;
                    const remaining = bal.total_days - bal.used_days;
                    const pct = bal.total_days > 0 ? (bal.used_days / bal.total_days) * 100 : 0;
                    return (
                      <Card key={bal.id}>
                        <CardContent className="p-5">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{cfg.label}</p>
                              <p className="text-xs text-muted-foreground">{bal.year}</p>
                            </div>
                          </div>
                          <div className="flex items-end justify-between mb-2">
                            <span className="text-2xl font-bold">{remaining}</span>
                            <span className="text-sm text-muted-foreground">/ {bal.total_days} days</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">{bal.used_days} used</p>
                        </CardContent>
                      </Card>
                    );
                  })}
            </div>
          </TabsContent>

          {/* ── Correction Requests ── */}
          <TabsContent value="corrections" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Correction Requests</CardTitle>
                <CardDescription>Track your attendance correction submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCorrections ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : corrections.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No correction requests yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Requested Check-In</TableHead>
                        <TableHead>Requested Check-Out</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reviewer Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {corrections.map((req: any) => {
                        const s = CORRECTION_STATUS_BADGE[req.status] ?? CORRECTION_STATUS_BADGE.pending;
                        const Icon = s.icon;
                        return (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium">
                              {format(new Date(req.date), "EEE, MMM d")}
                            </TableCell>
                            <TableCell>{req.requested_check_in ?? "—"}</TableCell>
                            <TableCell>{req.requested_check_out ?? "—"}</TableCell>
                            <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                              {req.reason}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("gap-1", s.class)}>
                                <Icon className="h-3 w-3" />
                                {s.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {req.reviewer_notes ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Apply Leave Dialog ─────────────────────────────── */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
            <DialogDescription>Submit a leave request for your manager's approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_CONFIG).map(([val, cfg]) => (
                    <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                placeholder="Brief reason for leave…"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button
              onClick={handleLeaveSubmit}
              disabled={!fromDate || !toDate || submitLeave.isPending}
            >
              {submitLeave.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Correction Request Dialog ──────────────────────── */}
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Attendance Correction</DialogTitle>
            <DialogDescription>
              Submit a correction for incorrect check-in or check-out times. Your manager will review it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={corrDate}
                onChange={(e) => setCorrDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Correct Check-In Time</Label>
                <Input type="time" value={corrCheckIn} onChange={(e) => setCorrCheckIn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correct Check-Out Time</Label>
                <Input type="time" value={corrCheckOut} onChange={(e) => setCorrCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Correction <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Explain why the correction is needed…"
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCorrectionSubmit}
              disabled={!corrDate || !corrReason || submitCorrection.isPending}
            >
              {submitCorrection.isPending ? "Submitting…" : "Submit Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

