import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  X,
  Clock,
  CalendarDays,
  ClipboardEdit,
  Inbox,
  History,
  User,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useDirectReports,
  useDirectReportsLeaves,
  useLeaveApproval,
} from "@/hooks/useManagerTeam";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { toast } from "sonner";

// ─── History hooks ────────────────────────────────────────────────────────────

function useDirectReportsLeavesHistory() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-leaves-history", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .in("status", ["approved", "rejected"])
        .order("reviewed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

function useDirectReportsCorrectionHistory() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-corrections-history", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];
      const { data, error } = await supabase
        .from("attendance_correction_requests")
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .in("status", ["approved", "rejected"])
        .order("reviewed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

function useDirectReportsCorrectionsPending() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-corrections-pending", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];
      const { data, error } = await supabase
        .from("attendance_correction_requests")
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEmployeeName(
  profileId: string | null,
  reports: { id: string; full_name: string | null }[]
) {
  if (!profileId) return "Unknown Employee";
  return reports.find((r) => r.id === profileId)?.full_name ?? "Unknown";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:  { label: "Pending",  className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    approved: { label: "Approved", className: "bg-green-500/15 text-green-400 border-green-500/30" },
    rejected: { label: "Rejected", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy, HH:mm");
  } catch {
    return dateStr;
  }
}

// ─── Pending Leave Cards ──────────────────────────────────────────────────────

function PendingLeaves() {
  const { data: reports = [] } = useDirectReports();
  const { data: leaves = [], isLoading } = useDirectReportsLeaves();
  const leaveApproval = useLeaveApproval();

  const handleAction = (leaveId: string, action: "approved" | "rejected") => {
    leaveApproval.mutate(
      { leaveId, action },
      {
        onSuccess: () => toast.success(`Leave request ${action}.`),
        onError: () => toast.error("Failed to update leave request."),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (leaves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Inbox className="h-10 w-10 opacity-40" />
        <p className="text-sm">No pending leave requests from your team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leaves.map((leave, i) => (
        <motion.div
          key={leave.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <Card className="border-border/50 bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">
                      {getEmployeeName(leave.profile_id, reports)}
                    </span>
                    <StatusBadge status={leave.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {leave.from_date} → {leave.to_date}
                      <span className="text-xs">({leave.days}d)</span>
                    </span>
                    <span className="capitalize">{leave.leave_type.replace(/_/g, " ")} leave</span>
                  </div>
                  {leave.reason && (
                    <p className="text-xs text-muted-foreground mt-2 italic">"{leave.reason}"</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500/40 text-green-400 hover:bg-green-500/10 hover:border-green-500/60"
                    onClick={() => handleAction(leave.id, "approved")}
                    disabled={leaveApproval.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
                    onClick={() => handleAction(leave.id, "rejected")}
                    disabled={leaveApproval.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Pending Corrections ──────────────────────────────────────────────────────

function PendingCorrections() {
  const { data: reports = [] } = useDirectReports();
  const { data: corrections = [], isLoading } = useDirectReportsCorrectionsPending();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<(typeof corrections)[0] | null>(null);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<"approved" | "rejected" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openDialog = (
    correction: (typeof corrections)[0],
    action: "approved" | "rejected"
  ) => {
    setSelected(correction);
    setPendingAction(action);
    setNotes("");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selected || !pendingAction || !user) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("attendance_correction_requests")
      .update({
        status: pendingAction,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes || null,
      })
      .eq("id", selected.id);
    setSubmitting(false);

    if (error) {
      toast.error("Failed to update correction request.");
    } else {
      toast.success(`Correction request ${pendingAction}.`);
      queryClient.invalidateQueries({ queryKey: ["direct-reports-corrections-pending"] });
      queryClient.invalidateQueries({ queryKey: ["direct-reports-corrections-history"] });
      setDialogOpen(false);

      // Fire notification (in-app + email) — fire-and-forget
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "correction_request_decided",
          payload: {
            correction_request_id: selected.id,
            decision: pendingAction,
            reviewer_name: user.email ?? undefined,
          },
        },
      }).catch((err) => console.warn("Failed to send correction decision notification:", err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (corrections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <ClipboardEdit className="h-10 w-10 opacity-40" />
        <p className="text-sm">No pending correction requests from your team.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {corrections.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="border-border/50 bg-card/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">
                        {getEmployeeName(c.profile_id, reports)}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {c.date}
                      </span>
                      {c.requested_check_in && (
                        <span>Check-in: {c.requested_check_in}</span>
                      )}
                      {c.requested_check_out && (
                        <span>Check-out: {c.requested_check_out}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">"{c.reason}"</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-500/40 text-green-400 hover:bg-green-500/10 hover:border-green-500/60"
                      onClick={() => openDialog(c, "approved")}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
                      onClick={() => openDialog(c, "rejected")}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction === "approved" ? "Approve" : "Reject"} Correction Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reviewer-notes">Reviewer Notes (optional)</Label>
            <Textarea
              id="reviewer-notes"
              placeholder="Add any notes for this decision…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className={
                pendingAction === "approved"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {submitting ? "Saving…" : pendingAction === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data: reports = [] } = useDirectReports();
  const { data: leaveHistory = [], isLoading: leavesLoading } = useDirectReportsLeavesHistory();
  const { data: correctionHistory = [], isLoading: correctionsLoading } =
    useDirectReportsCorrectionHistory();

  const isLoading = leavesLoading || correctionsLoading;

  // Merge and sort by reviewed_at desc
  type HistoryItem =
    | { kind: "leave"; id: string; profileId: string | null; reviewedAt: string | null; reviewedBy: string | null; reviewerNotes: string | null; status: string; detail: string }
    | { kind: "correction"; id: string; profileId: string | null; reviewedAt: string | null; reviewedBy: string | null; reviewerNotes: string | null; status: string; detail: string };

  const merged: HistoryItem[] = [
    ...leaveHistory.map((l) => ({
      kind: "leave" as const,
      id: l.id,
      profileId: l.profile_id,
      reviewedAt: l.reviewed_at,
      reviewedBy: l.reviewed_by,
      reviewerNotes: null as string | null,
      status: l.status,
      detail: `${l.leave_type.replace(/_/g, " ")} leave · ${l.from_date} → ${l.to_date} (${l.days}d)`,
    })),
    ...correctionHistory.map((c) => ({
      kind: "correction" as const,
      id: c.id,
      profileId: c.profile_id,
      reviewedAt: c.reviewed_at,
      reviewedBy: c.reviewed_by,
      reviewerNotes: c.reviewer_notes,
      status: c.status,
      detail: `Attendance correction · ${c.date}${c.requested_check_in ? ` · In: ${c.requested_check_in}` : ""}${c.requested_check_out ? ` · Out: ${c.requested_check_out}` : ""}`,
    })),
  ].sort((a, b) => {
    const ta = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
    const tb = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
    return tb - ta;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Clock className="mr-2 h-4 w-4 animate-spin" /> Loading history…
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <History className="h-10 w-10 opacity-40" />
        <p className="text-sm">No reviewed requests yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {merged.map((item, i) => (
        <motion.div
          key={`${item.kind}-${item.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <Card className="border-border/50 bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Employee + type badge */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">
                      {getEmployeeName(item.profileId, reports)}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        item.kind === "leave"
                          ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
                          : "border-purple-500/30 text-purple-400 bg-purple-500/10"
                      }
                    >
                      {item.kind === "leave" ? "Leave Request" : "Attendance Correction"}
                    </Badge>
                    <StatusBadge status={item.status} />
                  </div>

                  {/* Detail */}
                  <p className="text-sm text-muted-foreground capitalize mt-0.5">{item.detail}</p>

                  {/* Reviewed at */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-2">
                    <Clock className="h-3 w-3" />
                    <span>Reviewed: {formatDate(item.reviewedAt)}</span>
                  </div>

                  {/* Reviewer notes */}
                  {item.reviewerNotes && (
                    <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="italic">{item.reviewerNotes}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManagerInbox() {
  const { data: leaves = [] } = useDirectReportsLeaves();
  const { data: corrections = [] } = useDirectReportsCorrectionsPending();
  const pendingCount = leaves.length + corrections.length;

  return (
    <MainLayout title="Manager Inbox" subtitle="Review and action requests from your direct reports">
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/15 border border-primary/20">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manager Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Review and action requests from your direct reports
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="ml-auto bg-primary/20 text-primary border-primary/30">
              {pendingCount} pending
            </Badge>
          )}
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="pending">
          <TabsList className="mb-4">
            <TabsTrigger value="pending" className="gap-2">
              <Inbox className="h-4 w-4" />
              Pending
              {pendingCount > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ── Pending ── */}
          <TabsContent value="pending">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Leave requests */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4 text-blue-400" />
                    Leave Requests
                    {leaves.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {leaves.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <PendingLeaves />
                </CardContent>
              </Card>

              {/* Attendance corrections */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardEdit className="h-4 w-4 text-purple-400" />
                    Attendance Corrections
                    {corrections.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {corrections.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <PendingCorrections />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── History ── */}
          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Previously Reviewed Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <HistoryTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
