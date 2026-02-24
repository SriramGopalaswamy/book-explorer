import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  addMonths,
  subMonths,
  format,
  startOfMonth,
  parseISO,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Send,
  Edit2,
  Check,
  X,
  Trash2,
  Target,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  RotateCcw,
  MessageSquare,
  Save,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  GoalItem,
  GoalPlan,
  GoalPlanStatus,
  GoalPlanWithProfile,
  newGoalItem,
  totalWeightage,
  useMyGoalPlans,
  useGoalPlan,
  useCreateGoalPlan,
  useSaveGoalPlanDraft,
  useSubmitGoalPlan,
  useSubmitGoalEdit,
  useSubmitGoalScoring,
  useApproveGoalPlan,
  useRejectGoalPlan,
  useDeleteGoalPlan,
  useDirectReportsPendingGoalPlans,
  useHRPendingGoalPlans,
} from "@/hooks/useGoalPlans";
import { useIsAdminOrHR } from "@/hooks/useRoles";
import { useIsManager } from "@/hooks/useManagerTeam";

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  GoalPlanStatus,
  { label: string; color: string; icon: React.ElementType; description: string }
> = {
  draft: {
    label: "Draft",
    color: "bg-muted/60 text-muted-foreground border-border",
    icon: FileText,
    description: "Plan not yet submitted",
  },
  pending_approval: {
    label: "Pending Manager Approval",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: Clock,
    description: "Awaiting manager approval",
  },
  pending_hr_approval: {
    label: "Pending HR Approval",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: Clock,
    description: "Manager approved — awaiting HR final approval",
  },
  approved: {
    label: "Approved",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
    description: "Plan approved by Manager & HR — you can submit actuals",
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: X,
    description: "Plan rejected — please revise and resubmit",
  },
  pending_edit_approval: {
    label: "Edit Pending",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Clock,
    description: "Edits awaiting manager approval",
  },
  pending_score_approval: {
    label: "Score Pending",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Clock,
    description: "Actuals submitted — awaiting manager approval",
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
    description: "Actuals approved — goal cycle complete",
  },
};

// ─── WeightageBar ─────────────────────────────────────────────────────────────

function WeightageBar({ items }: { items: GoalItem[] }) {
  const total = totalWeightage(items);
  const isOver = total > 100;
  const pct = Math.min(total, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOver ? "bg-red-500" : total >= 100 ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums min-w-[56px] text-right",
          isOver ? "text-red-400" : total === 100 ? "text-emerald-400" : "text-muted-foreground"
        )}
      >
        {total}/100
      </span>
      {isOver && (
        <span className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" /> Over limit
        </span>
      )}
    </div>
  );
}

// ─── GoalItemsTable (read-only) ───────────────────────────────────────────────

function GoalItemsTable({
  items,
  showActual = false,
}: {
  items: GoalItem[];
  showActual?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No items in this plan.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Client</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Bucket</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Line Item</th>
            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Weightage</th>
            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Target</th>
            {showActual && (
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Actual</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={item.id}
              className={cn("border-b border-border/30 last:border-0", i % 2 === 1 && "bg-muted/10")}
            >
              <td className="px-3 py-2.5 text-foreground">{item.client || "—"}</td>
              <td className="px-3 py-2.5 text-foreground">{item.bucket || "—"}</td>
              <td className="px-3 py-2.5 text-foreground">{item.line_item || "—"}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                {item.weightage}%
              </td>
              <td className="px-3 py-2.5 text-foreground">{item.target || "—"}</td>
              {showActual && (
                <td className="px-3 py-2.5 text-foreground">{item.actual || "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/20 border-t border-border/50">
            <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground font-medium">
              Total
            </td>
            <td className="px-3 py-2 text-right font-bold tabular-nums text-sm">
              <span
                className={cn(
                  totalWeightage(items) > 100 ? "text-red-400" : "text-foreground"
                )}
              >
                {totalWeightage(items)}%
              </span>
            </td>
            <td colSpan={showActual ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── GoalItemsEditor (editable) ──────────────────────────────────────────────

function GoalItemsEditor({
  items,
  onChange,
  mode = "full",
}: {
  items: GoalItem[];
  onChange: (items: GoalItem[]) => void;
  mode?: "full" | "score-only" | "manager-review";
}) {
  const isFull = mode === "full" || mode === "manager-review";
  const showActual = mode !== "full";

  const update = (id: string, field: keyof GoalItem, value: string | number | null) => {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const add = () => onChange([...items, newGoalItem()]);
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[100px]">Client</th>
              <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[100px]">Bucket</th>
              <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[140px]">Line Item</th>
              <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">Weightage %</th>
              <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[120px]">Target</th>
              {showActual && <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[120px]">Actual</th>}
              {isFull && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/30 last:border-0">
                {/* Client */}
                <td className="px-2 py-1.5 min-w-[100px]">
                  {isFull ? (
                    <Input
                      value={item.client}
                      onChange={(e) => update(item.id, "client", e.target.value)}
                      className="h-8 text-sm w-full"
                      placeholder="Client"
                    />
                  ) : (
                    <span className="px-1">{item.client || "—"}</span>
                  )}
                </td>
                {/* Bucket */}
                <td className="px-2 py-1.5 min-w-[100px]">
                  {isFull ? (
                    <Input
                      value={item.bucket}
                      onChange={(e) => update(item.id, "bucket", e.target.value)}
                      className="h-8 text-sm w-full"
                      placeholder="Bucket"
                    />
                  ) : (
                    <span className="px-1">{item.bucket || "—"}</span>
                  )}
                </td>
                {/* Line Item */}
                <td className="px-2 py-1.5 min-w-[140px]">
                  {isFull ? (
                    <Input
                      value={item.line_item}
                      onChange={(e) => update(item.id, "line_item", e.target.value)}
                      className="h-8 text-sm w-full"
                      placeholder="Line Item"
                    />
                  ) : (
                    <span className="px-1">{item.line_item || "—"}</span>
                  )}
                </td>
                {/* Weightage */}
                <td className="px-2 py-1.5 w-24">
                  {isFull ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={item.weightage}
                      onChange={(e) => update(item.id, "weightage", Number(e.target.value))}
                      className="h-8 text-sm text-right w-full"
                    />
                  ) : (
                    <span className="px-1 block text-right">{item.weightage}%</span>
                  )}
                </td>
                {/* Target */}
                <td className="px-2 py-1.5 min-w-[120px]">
                  {isFull ? (
                    <Input
                      value={item.target}
                      onChange={(e) => update(item.id, "target", e.target.value)}
                      className="h-8 text-sm w-full"
                      placeholder="Target"
                    />
                  ) : (
                    <span className="px-1">{item.target || "—"}</span>
                  )}
                </td>
                {/* Actual */}
                {showActual && (
                  <td className="px-2 py-1.5 min-w-[120px]">
                    <Input
                      value={item.actual ?? ""}
                      onChange={(e) => update(item.id, "actual", e.target.value || null)}
                      className="h-8 text-sm w-full"
                      placeholder="Actual"
                    />
                  </td>
                )}
                {/* Remove */}
                {isFull && (
                  <td className="px-2 py-1.5 w-8">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() => remove(item.id)}
                      disabled={items.length <= 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/20 border-t border-border/50">
              <td colSpan={3} className="px-2 py-2 text-xs text-muted-foreground font-medium">Total</td>
              <td className="px-2 py-2 text-right font-bold text-sm tabular-nums">
                <span className={totalWeightage(items) > 100 ? "text-red-400" : "text-foreground"}>
                  {totalWeightage(items)}%
                </span>
              </td>
              <td colSpan={isFull && showActual ? 3 : 2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {isFull && (
        <Button variant="outline" size="sm" onClick={add} className="w-full border-dashed">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Line Item
        </Button>
      )}
      <WeightageBar items={items} />
    </div>
  );
}

// ─── Create / Edit Dialog ─────────────────────────────────────────────────────

function CreateEditDialog({
  open,
  onOpenChange,
  month,
  plan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  plan: GoalPlan | null;
}) {
  const [items, setItems] = useState<GoalItem[]>([newGoalItem()]);

  const createPlan = useCreateGoalPlan();
  const saveDraft = useSaveGoalPlanDraft();
  const submitPlan = useSubmitGoalPlan();
  const submitEdit = useSubmitGoalEdit();

  const isEdit = !!plan;
  const isApprovedEdit = plan?.status === "approved" || plan?.status === "pending_edit_approval";

  useEffect(() => {
    if (open) {
      setItems(plan && plan.items.length > 0 ? [...plan.items] : [newGoalItem()]);
    }
  }, [open, plan]);

  const canSubmit = totalWeightage(items) <= 100 && items.length > 0 && items.every((i) => i.line_item.trim());

  const handleSave = async () => {
    if (!isEdit) {
      await createPlan.mutateAsync({ month, items });
    } else {
      await saveDraft.mutateAsync({ planId: plan!.id, items });
    }
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!isEdit) {
      const created = await createPlan.mutateAsync({ month, items });
      await submitPlan.mutateAsync({ planId: created.id, items });
    } else if (isApprovedEdit) {
      await submitEdit.mutateAsync({ planId: plan!.id, items });
    } else {
      await submitPlan.mutateAsync({ planId: plan!.id, items });
    }
    onOpenChange(false);
  };

  const isPending =
    createPlan.isPending || saveDraft.isPending || submitPlan.isPending || submitEdit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isApprovedEdit ? "Edit Approved Plan" : isEdit ? "Edit Draft" : "Create Goal Plan"} —{" "}
            {format(parseISO(month), "MMMM yyyy")}
          </DialogTitle>
          {isApprovedEdit && (
            <p className="text-sm text-amber-400 mt-1">
              ⚠️ Editing an approved plan will require manager re-approval.
            </p>
          )}
        </DialogHeader>

        <div className="py-2">
          <GoalItemsEditor items={items} onChange={setItems} mode="full" />
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!isApprovedEdit && (
            <Button variant="secondary" onClick={handleSave} disabled={isPending}>
              <Save className="h-4 w-4 mr-1.5" />
              Save Draft
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            className="bg-primary hover:bg-primary/90"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {isApprovedEdit ? "Submit Edit for Approval" : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Scoring Dialog ───────────────────────────────────────────────────────────

function ScoringDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: GoalPlan;
}) {
  const [items, setItems] = useState<GoalItem[]>([]);
  const submitScoring = useSubmitGoalScoring();

  useEffect(() => {
    if (open) setItems([...plan.items]);
  }, [open, plan]);

  const handleSubmit = async () => {
    await submitScoring.mutateAsync({ planId: plan.id, items });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Fill Actuals — {format(parseISO(plan.month), "MMMM yyyy")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Enter your actual results for each line item. All actuals will go to your manager for approval.
          </p>
        </DialogHeader>

        <div className="py-2">
          <GoalItemsEditor items={items} onChange={setItems} mode="score-only" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitScoring.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Submit Actuals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Review Dialog (Manager) ─────────────────────────────────────────────────

function ReviewDialog({
  open,
  onOpenChange,
  plan,
  employeeName,
  isHRReview = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: GoalPlanWithProfile;
  employeeName: string;
  isHRReview?: boolean;
}) {
  const [items, setItems] = useState<GoalItem[]>([]);
  const [notes, setNotes] = useState("");
  const approve = useApproveGoalPlan();
  const reject = useRejectGoalPlan();

  const isScoring = plan.status === "pending_score_approval";

  useEffect(() => {
    if (open) {
      setItems([...plan.items]);
      setNotes("");
    }
  }, [open, plan]);

  const handleApprove = async () => {
    await approve.mutateAsync({ planId: plan.id, items, notes, isScoring, isHRApproval: isHRReview });
    onOpenChange(false);
  };

  const handleReject = async () => {
    await reject.mutateAsync({ planId: plan.id, notes, isScoring });
    onOpenChange(false);
  };

  const isPending = approve.isPending || reject.isPending;

  const approveLabel = isScoring
    ? "Approve Scoring"
    : isHRReview
    ? "Final Approve"
    : "Approve & Forward to HR";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isHRReview ? "HR Review" : "Review"} {isScoring ? "Scoring" : "Goal Plan"} — {employeeName},{" "}
            {format(parseISO(plan.month), "MMMM yyyy")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isHRReview
              ? "Manager has approved this plan. Review and give final approval."
              : "You can edit any field before approving. Your edits will be saved as the final version."}
          </p>
        </DialogHeader>

        <div className="py-2">
          <GoalItemsEditor
            items={items}
            onChange={setItems}
            mode={isScoring ? "manager-review" : "full"}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reviewer-notes">Reviewer Notes (optional)</Label>
          <Textarea
            id="reviewer-notes"
            placeholder="Add notes for your decision…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isPending}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            <X className="h-4 w-4 mr-1.5" />
            {isScoring ? "Return for Revision" : "Reject"}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isPending || totalWeightage(items) > 100}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {approveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending Approvals Tab ────────────────────────────────────────────────────

function PendingApprovalsTab() {
  const { data: pendingPlans = [], isLoading } = useDirectReportsPendingGoalPlans();
  const [reviewing, setReviewing] = useState<GoalPlanWithProfile | null>(null);

  const PENDING_STATUS_LABEL: Record<string, string> = {
    pending_approval: "New Plan",
    pending_edit_approval: "Plan Edit",
    pending_score_approval: "Actuals Scoring",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (pendingPlans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Target className="h-10 w-10 opacity-30" />
        <p className="text-sm">No pending goal plans from your team.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {pendingPlans.map((plan, i) => {
          const name = plan._profile?.full_name || "Unknown Employee";
          const dept = plan._profile?.department;
          const wt = totalWeightage(plan.items);
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-border/50 bg-card/60 hover:bg-card/80 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{name}</span>
                        {dept && <span className="text-xs text-muted-foreground">· {dept}</span>}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            plan.status === "pending_score_approval"
                              ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                              : plan.status === "pending_edit_approval"
                              ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
                              : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                          )}
                        >
                          {PENDING_STATUS_LABEL[plan.status] || plan.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(plan.month), "MMMM yyyy")} ·{" "}
                        {plan.items.length} line item{plan.items.length !== 1 ? "s" : ""} · Total weightage:{" "}
                        <span className={wt > 100 ? "text-red-400 font-medium" : "font-medium"}>{wt}%</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary/40 text-primary hover:bg-primary/10 shrink-0"
                      onClick={() => setReviewing(plan)}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {reviewing && (
        <ReviewDialog
          open={!!reviewing}
          onOpenChange={(v) => { if (!v) setReviewing(null); }}
          plan={reviewing}
          employeeName={reviewing._profile?.full_name || "Employee"}
        />
      )}
    </>
  );
}

// ─── My Goals Tab ─────────────────────────────────────────────────────────────

function MyGoalsTab() {
  const [selectedMonth, setSelectedMonth] = useState<Date>(startOfMonth(new Date()));
  const [createEditOpen, setCreateEditOpen] = useState(false);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const monthStr = format(selectedMonth, "yyyy-MM-dd");
  const { data: plan, isLoading } = useGoalPlan(monthStr);
  const { data: allPlans = [] } = useMyGoalPlans();
  const deletePlan = useDeleteGoalPlan();

  const handleDelete = async () => {
    if (plan) {
      await deletePlan.mutateAsync(plan.id);
      setDeleteConfirmOpen(false);
    }
  };

  const cfg = plan ? STATUS_CONFIG[plan.status] : null;
  const StatusIcon = cfg?.icon;

  const showActual =
    plan?.status === "pending_score_approval" ||
    plan?.status === "completed";

  const canCreate = !plan;
  const canEdit =
    plan?.status === "draft" ||
    plan?.status === "rejected" ||
    plan?.status === "approved" ||
    plan?.status === "pending_edit_approval";

  const canScore = plan?.status === "approved";
  const canDelete = plan?.status === "draft" || plan?.status === "rejected";

  return (
    <div className="space-y-6">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedMonth((d) => startOfMonth(subMonths(d, 1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold w-44 text-center">
            {format(selectedMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedMonth((d) => startOfMonth(addMonths(d, 1)))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {canCreate && (
          <Button onClick={() => setCreateEditOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1.5" /> Create Goal Plan
          </Button>
        )}
      </div>

      {/* Plan Card */}
      {isLoading ? (
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Clock className="h-5 w-5 animate-spin mr-2" /> Loading…
          </CardContent>
        </Card>
      ) : !plan ? (
        <Card className="border-border/50 border-dashed bg-card/20">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center">
              <Target className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-medium text-foreground">No goal plan for {format(selectedMonth, "MMMM yyyy")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your goal plan at the beginning of the month. The sum of weightages cannot exceed 100.
              </p>
            </div>
            <Button onClick={() => setCreateEditOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Create Goal Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Goal Plan — {format(selectedMonth, "MMMM yyyy")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {plan.items.length} line item{plan.items.length !== 1 ? "s" : ""} ·
                    Total weightage: {totalWeightage(plan.items)}%
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {cfg && StatusIcon && (
                    <Badge variant="outline" className={cn("text-xs", cfg.color)}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {cfg.label}
                    </Badge>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setCreateEditOpen(true)}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      {plan.status === "approved" ? "Request Edit" : "Edit"}
                    </Button>
                  )}
                  {canScore && (
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => setScoringOpen(true)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Fill Actuals
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive border-destructive/30"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Status message */}
              {cfg && (
                <div className={cn(
                  "mt-3 text-xs px-3 py-2 rounded-md border",
                  cfg.color,
                )}>
                  {cfg.description}
                </div>
              )}

              {/* Reviewer notes */}
              {plan.reviewer_notes && (
                <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border/30">
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="italic">{plan.reviewer_notes}</span>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <GoalItemsTable items={plan.items} showActual={showActual} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Previous plans strip */}
      {allPlans.length > 1 && (
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">
            Previous Plans
          </p>
          <div className="flex gap-2 flex-wrap">
            {allPlans
              .filter((p) => p.month !== monthStr)
              .slice(0, 12)
              .map((p) => {
                const s = STATUS_CONFIG[p.status];
                const SI = s.icon;
                return (
                  <Button
                    key={p.month}
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setSelectedMonth(startOfMonth(parseISO(p.month)))}
                  >
                    {format(parseISO(p.month), "MMM yyyy")}
                    <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 h-4", s.color)}>
                      <SI className="h-2.5 w-2.5" />
                    </Badge>
                  </Button>
                );
              })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateEditDialog
        open={createEditOpen}
        onOpenChange={setCreateEditOpen}
        month={monthStr}
        plan={plan ?? null}
      />
      {plan && (
        <ScoringDialog open={scoringOpen} onOpenChange={setScoringOpen} plan={plan} />
      )}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Goal Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your draft goal plan for{" "}
              {format(selectedMonth, "MMMM yyyy")}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── HR Pending Approvals Tab ─────────────────────────────────────────────────

function HRPendingApprovalsTab() {
  const { data: hrPendingPlans = [], isLoading } = useHRPendingGoalPlans();
  const [reviewing, setReviewing] = useState<GoalPlanWithProfile | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (hrPendingPlans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Target className="h-10 w-10 opacity-30" />
        <p className="text-sm">No goal plans pending HR approval.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {hrPendingPlans.map((plan, i) => {
          const name = plan._profile?.full_name || "Unknown Employee";
          const dept = plan._profile?.department;
          const wt = totalWeightage(plan.items);
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-border/50 bg-card/60 hover:bg-card/80 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{name}</span>
                        {dept && <span className="text-xs text-muted-foreground">· {dept}</span>}
                        <Badge
                          variant="outline"
                          className="text-xs border-orange-500/30 text-orange-400 bg-orange-500/10"
                        >
                          Pending HR Approval
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(plan.month), "MMMM yyyy")} ·{" "}
                        {plan.items.length} line item{plan.items.length !== 1 ? "s" : ""} · Total weightage:{" "}
                        <span className={wt > 100 ? "text-red-400 font-medium" : "font-medium"}>{wt}%</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary/40 text-primary hover:bg-primary/10 shrink-0"
                      onClick={() => setReviewing(plan)}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {reviewing && (
        <ReviewDialog
          open={!!reviewing}
          onOpenChange={(v) => { if (!v) setReviewing(null); }}
          plan={reviewing}
          employeeName={reviewing._profile?.full_name || "Employee"}
          isHRReview
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Goals() {
  const { data: isManager } = useIsManager();
  const { data: isAdminOrHR } = useIsAdminOrHR();
  const { data: pendingPlans = [] } = useDirectReportsPendingGoalPlans();
  const { data: hrPendingPlans = [] } = useHRPendingGoalPlans();
  const canReview = isManager || isAdminOrHR;
  const canHRReview = isAdminOrHR;

  return (
    <MainLayout
      title="Goals"
      subtitle="Monthly goal planning with manager & HR approval workflow"
    >
      <div className="space-y-6">
        
        <Tabs defaultValue="my-goals">
          <TabsList>
            <TabsTrigger value="my-goals" className="gap-2">
              <Target className="h-4 w-4" />
              My Goal Plans
            </TabsTrigger>
            {canReview && (
              <TabsTrigger value="approvals" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Manager Approvals
                {pendingPlans.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                    {pendingPlans.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {canHRReview && (
              <TabsTrigger value="hr-approvals" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                HR Approvals
                {hrPendingPlans.length > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 font-semibold">
                    {hrPendingPlans.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="my-goals" className="mt-6">
            <MyGoalsTab />
          </TabsContent>

          {canReview && (
            <TabsContent value="approvals" className="mt-6">
              <PendingApprovalsTab />
            </TabsContent>
          )}

          {canHRReview && (
            <TabsContent value="hr-approvals" className="mt-6">
              <HRPendingApprovalsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}
