import { useState, useRef } from "react";
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
  Target,
  Edit2,
  FileText,
  Paperclip,
  Download,
  BadgeDollarSign,
  Eye,
  ExternalLink,
  Sparkles,
  Wallet,
  AlertTriangle,
  UserCog,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
import {
  useDirectReportsPendingGoalPlans,
  useApproveGoalPlan,
  useRejectGoalPlan,
  GoalItem,
  GoalPlanWithProfile,
  totalWeightage,
} from "@/hooks/useGoalPlans";
import { Input } from "@/components/ui/input";
import {
  usePendingPayslipDisputes,
  useManagerReviewDispute,
  DISPUTE_CATEGORIES,
  type PayslipDispute,
} from "@/hooks/usePayslipDisputes";
import {
  useDirectReportsPendingMemos,
  useApproveMemo,
  useRejectMemo,
  useProfileSearch,
  type Memo,
} from "@/hooks/useMemos";
import {
  useReviewChangeRequest,
  type ProfileChangeRequest,
} from "@/hooks/useProfileChangeRequests";

// ─── Profile Change Request hooks ─────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  full_name: "Full Name", date_of_birth: "Date of Birth", gender: "Gender",
  blood_group: "Blood Group", marital_status: "Marital Status", nationality: "Nationality",
  address_line1: "Address Line 1", address_line2: "Address Line 2", city: "City",
  state: "State", pincode: "Pincode", country: "Country",
  emergency_contact_name: "Emergency Contact Name", emergency_contact_relation: "Emergency Contact Relation",
  emergency_contact_phone: "Emergency Contact Phone", bank_name: "Bank Name",
  bank_account_number: "Bank Account Number", bank_ifsc: "IFSC Code", bank_branch: "Bank Branch",
  pan_number: "PAN Number", aadhaar_last_four: "Aadhaar (last 4)", uan_number: "UAN Number",
  esi_number: "ESI Number", employee_id_number: "Employee ID",
  department: "Department", job_title: "Job Title", phone: "Phone", email: "Email",
};

function useDirectReportsPendingProfileChanges() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-profile-changes-pending", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];
      const { data, error } = await supabase
        .from("profile_change_requests" as any)
        .select("*")
        .in("profile_id", reports.map((r) => r.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProfileChangeRequest[];
    },
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

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

function useDirectReportsPendingReimbursements() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-reimbursements-pending", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("*, profiles:profile_id(full_name, email)")
        .in("profile_id", reports.map((r) => r.id))
        .eq("status", "pending_manager")
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
      supabase.from("audit_logs" as any).insert({ actor_id: user.id, actor_name: user.user_metadata?.full_name ?? user.email ?? "Unknown", action: pendingAction === "approved" ? "correction_approved" : "correction_rejected", entity_type: "attendance_correction", entity_id: selected.id, target_user_id: selected.user_id, metadata: { notes: notes || null } } as any).then(({ error: e }) => { if (e) console.warn("Audit write failed:", e.message); });
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

// ─── Pending Memos ─────────────────────────────────────────────────────────────
function PendingMemos() {
  const { data: memos = [], isLoading } = useDirectReportsPendingMemos();
  const approveMemo = useApproveMemo();
  const rejectMemo = useRejectMemo();
  const [reviewing, setReviewing] = useState<Memo | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editRecipients, setEditRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [notes, setNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const { data: recipientSuggestions = [] } = useProfileSearch(recipientInput);

  function openReview(memo: Memo) {
    setReviewing(memo); setEditTitle(memo.title); setEditSubject(memo.subject || "");
    setEditRecipients(memo.recipients || []); setNotes(""); setRejecting(false);
    setRejectNotes(""); setRecipientInput("");
  }
  async function handleApprove() {
    if (!reviewing) return;
    await approveMemo.mutateAsync({ id: reviewing.id, reviewerNotes: notes || undefined, updatedTitle: editTitle !== reviewing.title ? editTitle : undefined, updatedSubject: editSubject !== reviewing.subject ? editSubject : undefined, updatedRecipients: JSON.stringify(editRecipients) !== JSON.stringify(reviewing.recipients) ? editRecipients : undefined });
    setReviewing(null);
  }
  async function handleReject() {
    if (!reviewing || !rejectNotes.trim()) { toast.error("Please provide rejection feedback"); return; }
    await rejectMemo.mutateAsync({ id: reviewing.id, reviewerNotes: rejectNotes });
    setReviewing(null); setRejecting(false);
  }
  async function downloadAttachment(url: string) {
    try {
      const { data, error } = await supabase.storage.from("memo-attachments").download(url);
      if (error) throw error;
      const blobUrl = URL.createObjectURL(data); const a = document.createElement("a");
      a.href = blobUrl; a.download = url.split("/").pop() || "attachment"; a.click(); URL.revokeObjectURL(blobUrl);
    } catch { toast.error("Failed to download attachment"); }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Loading…</div>;
  if (memos.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
      <FileText className="h-8 w-8 opacity-30" /><p className="text-sm">No pending memos from your team.</p>
    </div>
  );
  return (
    <>
      <div className="space-y-3">
        {memos.map((memo) => (
          <Card key={memo.id} className="border-border/50 bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{memo.title}</p>
                  {memo.subject && <p className="text-xs text-primary mt-0.5">Subject: {memo.subject}</p>}
                  <p className="text-xs text-muted-foreground mt-1">By {memo.author_name} · {format(new Date(memo.created_at), "MMM d, yyyy")}</p>
                  {memo.recipients?.length > 0 && <p className="text-xs text-muted-foreground truncate">To: {memo.recipients.join(", ")}</p>}
                  {memo.attachment_url && <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" /> Attachment</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => openReview(memo)} className="shrink-0"><Edit2 className="h-3.5 w-3.5 mr-1" /> Review</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {reviewing && (
        <Dialog open onOpenChange={(v) => { if (!v) setReviewing(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Review Memo — {reviewing.author_name}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-1.5"><Label>Memo Title</Label><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Memo Subject</Label><Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} /></div>
              <div className="grid gap-1.5">
                <Label>Recipients</Label>
                <div className="min-h-10 flex flex-wrap gap-1.5 items-center border border-input rounded-md px-3 py-2 bg-background">
                  {editRecipients.map((r) => <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">{r}<button type="button" onClick={() => setEditRecipients(p => p.filter(x => x !== r))}><X className="h-3 w-3" /></button></span>)}
                  <div className="relative flex-1 min-w-32">
                    <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Add recipient…" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} onKeyDown={(e) => { if ((e.key==="Enter"||e.key===",") && recipientInput.trim()) { e.preventDefault(); if (!editRecipients.includes(recipientInput.trim())) setEditRecipients(p=>[...p,recipientInput.trim()]); setRecipientInput(""); }}} />
                    {recipientInput.length >= 2 && recipientSuggestions.length > 0 && (
                      <div className="absolute z-50 mt-1 left-0 w-64 rounded-md border border-border bg-popover shadow-lg max-h-40 overflow-y-auto">
                        {recipientSuggestions.map((p) => <button key={p.id} type="button" className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left" onMouseDown={(e)=>{e.preventDefault(); if (!editRecipients.includes(p.full_name||"")) setEditRecipients(prev=>[...prev,p.full_name||""]); setRecipientInput("");}}>{p.full_name}{p.department&&<span className="text-muted-foreground text-xs ml-auto">{p.department}</span>}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {reviewing.content && <div className="grid gap-1.5"><Label>Memo Summary</Label><div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm whitespace-pre-wrap">{reviewing.content}</div></div>}
              {reviewing.attachment_url && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                  <Paperclip className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium">Attachment</p><p className="text-xs text-muted-foreground truncate">{reviewing.attachment_url.split("/").pop()}</p></div>
                  <Button size="sm" variant="outline" onClick={() => downloadAttachment(reviewing.attachment_url!)}><Download className="h-4 w-4 mr-1" /> Download</Button>
                </div>
              )}
              {!rejecting ? <div className="grid gap-1.5"><Label>Notes (optional)</Label><Textarea placeholder="Notes for sender…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
                : <div className="grid gap-1.5"><Label>Rejection Feedback <span className="text-destructive">*</span></Label><Textarea placeholder="Why is this being returned?" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={3} /></div>}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
              {!rejecting ? (<>
                <Button variant="outline" onClick={() => setRejecting(true)} className="border-red-500/40 text-red-500 hover:bg-red-500/10"><X className="h-4 w-4 mr-1" /> Reject</Button>
                <Button onClick={handleApprove} disabled={approveMemo.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Check className="h-4 w-4 mr-1" /> Approve & Publish</Button>
              </>) : (<>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
                <Button variant="destructive" onClick={handleReject} disabled={rejectMemo.isPending}><X className="h-4 w-4 mr-1" /> Confirm Rejection</Button>
              </>)}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Pending Payslip Disputes ─────────────────────────────────────────────────

function PendingPayslipDisputes() {
  const { data: reports = [] } = useDirectReports();
  const { data: disputes = [], isLoading } = usePendingPayslipDisputes("manager");
  const reviewDispute = useManagerReviewDispute();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<PayslipDispute | null>(null);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<"forward" | "reject" | null>(null);

  const openDialog = (dispute: PayslipDispute, action: "forward" | "reject") => {
    setSelected(dispute);
    setPendingAction(action);
    setNotes("");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selected || !pendingAction) return;
    reviewDispute.mutate(
      { disputeId: selected.id, action: pendingAction, notes: notes || undefined },
      { onSuccess: () => setDialogOpen(false) }
    );
  };

  const periodLabel = (p: string) => {
    const [y, m] = p.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
  if (disputes.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <AlertTriangle className="h-10 w-10 opacity-40" />
      <p className="text-sm">No pending payslip disputes from your team.</p>
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        {disputes.map((d, i) => (
          <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-border/50 bg-card/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{d.profiles?.full_name || "Unknown"}</span>
                      <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-500 bg-amber-500/10">
                        Payslip Dispute
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">{periodLabel(d.pay_period)}</span> · {DISPUTE_CATEGORIES.find(c => c.value === d.dispute_category)?.label || d.dispute_category}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 italic">"{d.description}"</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-500/40 text-green-400 hover:bg-green-500/10" onClick={() => openDialog(d, "forward")}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Forward to HR
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => openDialog(d, "reject")}>
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
            <DialogTitle>{pendingAction === "forward" ? "Forward to HR" : "Reject Dispute"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="dispute-notes">Notes {pendingAction === "reject" ? "(recommended)" : "(optional)"}</Label>
            <Textarea id="dispute-notes" placeholder="Add notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={reviewDispute.isPending} className={pendingAction === "forward" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}>
              {reviewDispute.isPending ? "Saving…" : pendingAction === "forward" ? "Forward" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Pending Reimbursements Component ─────────────────────────────────────────


function PendingReimbursements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useDirectReportsPendingReimbursements();
  const { data: reports = [] } = useDirectReports();
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openReview = async (item: any) => {
    setReviewItem(item);
    setNotes("");
    setPreviewUrl(null);
    if (item.attachment_url) {
      const { data } = await supabase.storage
        .from("reimbursement-attachments")
        .createSignedUrl(item.attachment_url, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
  };

  const decide = async (decision: "manager_approved" | "manager_rejected") => {
    if (!reviewItem || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("reimbursement_requests")
        .update({
          status: decision === "manager_approved" ? "pending_finance" : "manager_rejected",
          manager_notes: notes || null,
          manager_reviewed_by: user.id,
          manager_reviewed_at: new Date().toISOString(),
        })
        .eq("id", reviewItem.id);
      if (error) throw error;

      // Notify employee
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "reimbursement_manager_decided",
          payload: {
            reimbursement_id: reviewItem.id,
            decision: decision === "manager_approved" ? "approved" : "rejected",
            reviewer_name: user.email,
          },
        },
      }).catch((e) => console.warn("Notification failed:", e));

      toast.success(decision === "manager_approved" ? "Approved and sent to Finance" : "Reimbursement rejected");
      queryClient.invalidateQueries({ queryKey: ["direct-reports-reimbursements-pending"] });
      setReviewItem(null);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>;
  if (requests.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
      <BadgeDollarSign className="h-8 w-8 opacity-30" />
      <p className="text-sm">No pending reimbursement requests.</p>
    </div>
  );

  const getEmployeeName = (item: any) => {
    const p = item.profiles;
    if (p?.full_name) return p.full_name;
    const report = reports.find((r: any) => r.id === item.profile_id);
    return report?.full_name || "Unknown";
  };

  return (
    <>
      <div className="space-y-3">
        {requests.map((item: any) => (
          <div key={item.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{getEmployeeName(item)}</span>
                {item.ai_extracted && (
                  <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400 bg-purple-500/10">
                    <Sparkles className="h-3 w-3 mr-1" /> AI Read
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.category} · ₹{Number(item.amount).toLocaleString()} · {item.vendor_name}
              </p>
              {item.description && (
                <p className="text-xs text-muted-foreground truncate max-w-xs italic mt-0.5">{item.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                Submitted {format(new Date(item.created_at), "dd MMM yyyy")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => openReview(item)}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          </div>
        ))}
      </div>

      {/* Review Dialog */}
      {reviewItem && (
        <Dialog open={!!reviewItem} onOpenChange={(v) => { if (!v) setReviewItem(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Reimbursement — {getEmployeeName(reviewItem)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Vendor", value: reviewItem.vendor_name },
                  { label: "Amount", value: `₹${Number(reviewItem.amount).toLocaleString()}` },
                  { label: "Category", value: reviewItem.category },
                  { label: "Date", value: reviewItem.expense_date },
                ].map((row) => row.value ? (
                  <div key={row.label}>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="font-medium">{row.value}</p>
                  </div>
                ) : null)}
              </div>
              {reviewItem.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{reviewItem.description}</p>
                </div>
              )}
              {previewUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attached Document</p>
                  {reviewItem.file_type?.startsWith("image/") ? (
                    <img src={previewUrl} alt="Receipt" className="rounded-lg max-h-48 object-contain border border-border" />
                  ) : (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" /> Open PDF in new tab
                    </a>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Add notes for the employee…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReviewItem(null)}>Cancel</Button>
              <Button
                variant="outline"
                disabled={submitting}
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={() => decide("manager_rejected")}
              >
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => decide("manager_approved")}
              >
                <Check className="h-4 w-4 mr-1" /> Approve & Forward to Finance
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Pending Expenses Component ───────────────────────────────────────────────

function useDirectReportsPendingExpenses() {
  const { data: reports = [] } = useDirectReports();
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["direct-reports-expenses-pending", reports.map((r) => r.id), isDevMode],
    queryFn: async () => {
      if (isDevMode || !user || reports.length === 0) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("*, profiles:profile_id(full_name, email)")
        .in("profile_id", reports.map((r) => r.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: (!!user || isDevMode) && reports.length > 0,
  });
}

function PendingExpenses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useDirectReportsPendingExpenses();
  const { data: reports = [] } = useDirectReports();
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openReview = async (item: any) => {
    setReviewItem(item);
    setNotes("");
    setPreviewUrl(null);
    if (item.receipt_url) {
      const pathOnly = item.receipt_url.includes("/bill-attachments/")
        ? item.receipt_url.split("/bill-attachments/").pop()!
        : item.receipt_url;
      const { data } = await supabase.storage.from("bill-attachments").createSignedUrl(pathOnly, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!reviewItem || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({
          status: decision,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notes || null,
        })
        .eq("id", reviewItem.id);
      if (error) throw error;

      toast.success(decision === "approved" ? "Expense approved — forwarded to Finance" : "Expense rejected");
      queryClient.invalidateQueries({ queryKey: ["direct-reports-expenses-pending"] });
      setReviewItem(null);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>;
  if (expenses.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
      <Wallet className="h-8 w-8 opacity-30" />
      <p className="text-sm">No pending expense approvals.</p>
    </div>
  );

  const getEmployeeName = (item: any) => {
    const p = item.profiles;
    if (p?.full_name) return p.full_name;
    const report = reports.find((r: any) => r.id === item.profile_id);
    return report?.full_name || "Unknown";
  };

  return (
    <>
      <div className="space-y-3">
        {expenses.map((item: any) => (
          <div key={item.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{getEmployeeName(item)}</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.category} · ₹{Number(item.amount).toLocaleString()}
              </p>
              {item.description && (
                <p className="text-xs text-muted-foreground truncate max-w-xs italic mt-0.5">{item.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.expense_date} · {item.receipt_url ? "Receipt attached" : "No receipt"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => openReview(item)}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          </div>
        ))}
      </div>

      {reviewItem && (
        <Dialog open={!!reviewItem} onOpenChange={(v) => { if (!v) setReviewItem(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Expense — {getEmployeeName(reviewItem)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Category</p><p className="font-medium">{reviewItem.category}</p></div>
                <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-medium">₹{Number(reviewItem.amount).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{reviewItem.expense_date}</p></div>
              </div>
              {reviewItem.description && (
                <div><p className="text-xs text-muted-foreground mb-1">Description</p><p className="text-sm">{reviewItem.description}</p></div>
              )}
              {reviewItem.notes && (
                <div><p className="text-xs text-muted-foreground mb-1">Employee Notes</p><p className="text-sm italic">{reviewItem.notes}</p></div>
              )}
              {previewUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Receipt / Bill</p>
                  {previewUrl.match(/\.(jpg|jpeg|png|webp|gif)/i) ? (
                    <img src={previewUrl} alt="Receipt" className="rounded-lg max-h-48 object-contain border border-border" />
                  ) : (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" /> Open document in new tab
                    </a>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Add notes for the employee…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReviewItem(null)}>Cancel</Button>
              <Button
                variant="outline"
                disabled={submitting}
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={() => decide("rejected")}
              >
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => decide("approved")}
              >
                <Check className="h-4 w-4 mr-1" /> Approve & Forward to Finance
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Pending Profile Changes ──────────────────────────────────────────────────

function PendingProfileChanges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: reports = [] } = useDirectReports();
  const { data: requests = [], isLoading } = useDirectReportsPendingProfileChanges();
  const reviewMutation = useReviewChangeRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<ProfileChangeRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<"approved" | "rejected" | null>(null);

  const openDialog = (req: ProfileChangeRequest, action: "approved" | "rejected") => {
    setSelected(req);
    setPendingAction(action);
    setNotes("");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selected || !pendingAction) return;
    reviewMutation.mutate(
      { id: selected.id, status: pendingAction, reviewer_notes: notes || undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["direct-reports-profile-changes-pending"] });
          queryClient.invalidateQueries({ queryKey: ["profile-change-requests"] });
          queryClient.invalidateQueries({ queryKey: ["employees"] });
          queryClient.invalidateQueries({ queryKey: ["employee-details"] });
          queryClient.invalidateQueries({ queryKey: ["my-profile-id"] });
          setDialogOpen(false);
        },
      }
    );
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>;
  if (requests.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
      <UserCog className="h-8 w-8 opacity-30" />
      <p className="text-sm">No pending profile change requests.</p>
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        {requests.map((req, i) => (
          <motion.div
            key={req.id}
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
                        {getEmployeeName(req.profile_id, reports)}
                      </span>
                      <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                        Pending
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">{FIELD_LABELS[req.field_name] || req.field_name}</span>
                      <span className="mx-2">·</span>
                      <span className="capitalize">{req.section}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1.5">
                      <span>Current: <span className="text-foreground">{req.current_value || "—"}</span></span>
                      <span>→ Requested: <span className="text-primary font-medium">{req.requested_value}</span></span>
                    </div>
                    {req.reason && (
                      <p className="text-xs text-muted-foreground mt-1.5 italic">"{req.reason}"</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted {formatDate(req.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-500/40 text-green-400 hover:bg-green-500/10 hover:border-green-500/60"
                      onClick={() => openDialog(req, "approved")}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
                      onClick={() => openDialog(req, "rejected")}
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
              {pendingAction === "approved" ? "Approve" : "Reject"} Profile Change
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border/50 p-3 text-sm space-y-1.5">
                <div><span className="text-muted-foreground">Field:</span> <span className="font-medium">{FIELD_LABELS[selected.field_name] || selected.field_name}</span></div>
                <div><span className="text-muted-foreground">Current:</span> {selected.current_value || "—"}</div>
                <div><span className="text-muted-foreground">Requested:</span> <span className="text-primary font-medium">{selected.requested_value}</span></div>
                {selected.reason && <div><span className="text-muted-foreground">Reason:</span> <span className="italic">{selected.reason}</span></div>}
              </div>
              {pendingAction === "approved" && (
                <p className="text-xs text-muted-foreground">Approving will automatically update the employee's profile.</p>
              )}
              <Label htmlFor="reviewer-notes-pc">Reviewer Notes (optional)</Label>
              <Textarea
                id="reviewer-notes-pc"
                placeholder="Add any notes for this decision…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={reviewMutation.isPending}
              className={
                pendingAction === "approved"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {reviewMutation.isPending ? "Saving…" : pendingAction === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManagerInbox() {
  const { data: leaves = [] } = useDirectReportsLeaves();
  const { data: corrections = [] } = useDirectReportsCorrectionsPending();
  const pendingCount = leaves.length + corrections.length;
  const { data: pendingReimbursements = [] } = useDirectReportsPendingReimbursements();
  const { data: pendingExpenses = [] } = useDirectReportsPendingExpenses();
  const { data: pendingMemos = [] } = useDirectReportsPendingMemos();
  const { data: pendingDisputes = [] } = usePendingPayslipDisputes("manager");
  const { data: pendingProfileChanges = [] } = useDirectReportsPendingProfileChanges();

  const { data: pendingGoals = [] } = useDirectReportsPendingGoalPlans();
  const [reviewingGoal, setReviewingGoal] = useState<GoalPlanWithProfile | null>(null);
  const [goalItems, setGoalItems] = useState<GoalItem[]>([]);
  const [goalNotes, setGoalNotes] = useState("");
  const approveGoal = useApproveGoalPlan();
  const rejectGoal = useRejectGoalPlan();

  const totalPending = pendingCount + pendingGoals.length + pendingReimbursements.length + pendingExpenses.length + pendingMemos.length + pendingDisputes.length + pendingProfileChanges.length;

  const openGoalReview = (plan: GoalPlanWithProfile) => {
    setReviewingGoal(plan);
    setGoalItems([...plan.items]);
    setGoalNotes("");
  };

  const handleGoalApprove = async () => {
    if (!reviewingGoal) return;
    const isScoring = reviewingGoal.status === "pending_score_approval";
    await approveGoal.mutateAsync({ planId: reviewingGoal.id, items: goalItems, notes: goalNotes, isScoring });
    setReviewingGoal(null);
  };

  const handleGoalReject = async () => {
    if (!reviewingGoal) return;
    const isScoring = reviewingGoal.status === "pending_score_approval";
    await rejectGoal.mutateAsync({ planId: reviewingGoal.id, notes: goalNotes, isScoring });
    setReviewingGoal(null);
  };

  return (
    <MainLayout title="Manager Inbox" subtitle="Review and action requests from your direct reports">
      <div className="space-y-6">
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
          {totalPending > 0 && (
            <Badge className="ml-auto bg-primary/20 text-primary border-primary/30">
              {totalPending} pending
            </Badge>
          )}
        </motion.div>

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
            <TabsTrigger value="memos" className="gap-2">
              <FileText className="h-4 w-4" />
              Memos
              {pendingMemos.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                  {pendingMemos.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reimbursements" className="gap-2">
              <BadgeDollarSign className="h-4 w-4" />
              Reimbursements
              {pendingReimbursements.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                  {pendingReimbursements.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2">
              <Wallet className="h-4 w-4" />
              Expenses
              {pendingExpenses.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                  {pendingExpenses.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2">
              <Target className="h-4 w-4" />
              Goal Plans
              {pendingGoals.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                  {pendingGoals.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="disputes" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Payslip Disputes
              {pendingDisputes.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                  {pendingDisputes.length}
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

          {/* ── Memos ── */}
          <TabsContent value="memos">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Pending Memo Approvals
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <PendingMemos />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Reimbursements ── */}
          <TabsContent value="reimbursements">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeDollarSign className="h-4 w-4 text-primary" />
                  Pending Reimbursement Approvals
                  {pendingReimbursements.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {pendingReimbursements.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <PendingReimbursements />
              </CardContent>
            </Card>
          </TabsContent>


          {/* ── Expenses ── */}
          <TabsContent value="expenses">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4 text-primary" />
                  Pending Expense Approvals
                  {pendingExpenses.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {pendingExpenses.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <PendingExpenses />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payslip Disputes ── */}
          <TabsContent value="disputes">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Pending Payslip Disputes
                  {pendingDisputes.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {pendingDisputes.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <PendingPayslipDisputes />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Goal Plans ── */}
          <TabsContent value="goals">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" />
                  Pending Goal Plan Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {pendingGoals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                    <Target className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No pending goal plans from your team.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingGoals.map((plan) => {
                      const name = plan._profile?.full_name || "Unknown";
                      const wt = totalWeightage(plan.items);
                      const LABEL: Record<string, string> = {
                        pending_approval: "New Plan",
                        pending_edit_approval: "Plan Edit",
                        pending_score_approval: "Actuals Scoring",
                      };
                      return (
                        <Card key={plan.id} className="border-border/50 bg-card/60">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{name}</span>
                                  <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 bg-amber-500/10">
                                    {LABEL[plan.status] || plan.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {format(parseISO(plan.month), "MMMM yyyy")} · {plan.items.length} items · {wt}% total
                                </p>
                              </div>
                              <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => openGoalReview(plan)}>
                                <Edit2 className="h-3.5 w-3.5 mr-1" /> Review
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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

        {/* Goal Plan Review Dialog */}
        {reviewingGoal && (
          <Dialog open={!!reviewingGoal} onOpenChange={(v) => { if (!v) setReviewingGoal(null); }}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Review {reviewingGoal.status === "pending_score_approval" ? "Actuals" : "Goal Plan"} —{" "}
                  {reviewingGoal._profile?.full_name || "Employee"},{" "}
                  {format(parseISO(reviewingGoal.month), "MMMM yyyy")}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">You can edit any field before approving.</p>
              </DialogHeader>
              <div className="overflow-x-auto rounded-lg border border-border/50 my-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      {["Client","Bucket","Line Item","Weightage %","Target","Actual"].map(h => (
                        <th key={h} className="text-left px-2 py-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {goalItems.map((item) => (
                      <tr key={item.id} className="border-b border-border/30 last:border-0">
                        {(["client","bucket","line_item"] as const).map((f) => (
                          <td key={f} className="px-2 py-1.5">
                            <Input value={item[f] as string} onChange={(e) => setGoalItems(goalItems.map(i => i.id === item.id ? { ...i, [f]: e.target.value } : i))} className="h-8 text-sm" />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 w-24">
                          <Input type="number" value={item.weightage} onChange={(e) => setGoalItems(goalItems.map(i => i.id === item.id ? { ...i, weightage: Number(e.target.value) } : i))} className="h-8 text-sm text-right" />
                        </td>
                        <td className="px-2 py-1.5 w-24">
                          <Input type="number" value={item.target} onChange={(e) => setGoalItems(goalItems.map(i => i.id === item.id ? { ...i, target: e.target.value } : i))} className="h-8 text-sm text-right" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input value={item.actual ?? ""} onChange={(e) => setGoalItems(goalItems.map(i => i.id === item.id ? { ...i, actual: e.target.value || null } : i))} className="h-8 text-sm" placeholder="Actual" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                <Label>Reviewer Notes (optional)</Label>
                <Textarea placeholder="Add notes…" value={goalNotes} onChange={(e) => setGoalNotes(e.target.value)} rows={3} />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setReviewingGoal(null)}>Cancel</Button>
                <Button variant="outline" onClick={handleGoalReject} disabled={rejectGoal.isPending || approveGoal.isPending} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
                  <X className="h-4 w-4 mr-1" /> {reviewingGoal.status === "pending_score_approval" ? "Return for Revision" : "Reject"}
                </Button>
                <Button onClick={handleGoalApprove} disabled={approveGoal.isPending || rejectGoal.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  );
}
