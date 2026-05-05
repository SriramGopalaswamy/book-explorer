import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  UserX,
  Package,
  FileText,
  Shield,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExitUser {
  user_id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
}

interface ActiveUser {
  user_id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
}

interface ExitProcessingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: ExitUser | null;
  activeUsers: ActiveUser[];
  onComplete: () => void;
}

const EXIT_REASONS = [
  { value: "resignation", label: "Resignation" },
  { value: "termination", label: "Termination" },
  { value: "retirement", label: "Retirement" },
  { value: "absconding", label: "Absconding" },
  { value: "contract_end", label: "Contract End" },
];

const KT_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const STEPS = [
  { id: 1, label: "Exit Details", icon: Calendar },
  { id: 2, label: "Compliance", icon: Shield },
  { id: 3, label: "Confirmation", icon: CheckCircle2 },
];

export function ExitProcessingDialog({
  open,
  onOpenChange,
  targetUser,
  activeUsers,
  onComplete,
}: ExitProcessingDialogProps) {
  const [step, setStep] = useState(1);
  const [processing, setProcessing] = useState(false);

  // Step 1: Exit Details
  const [exitDate, setExitDate] = useState(new Date().toISOString().split("T")[0]);
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [noticeServed, setNoticeServed] = useState(false);
  const [replacementManagerId, setReplacementManagerId] = useState("");

  // Step 2: Compliance
  const [assetReturnConfirmed, setAssetReturnConfirmed] = useState(false);
  const [knowledgeTransferStatus, setKnowledgeTransferStatus] = useState("not_started");
  const [exitInterviewCompleted, setExitInterviewCompleted] = useState(false);
  const [rehireEligible, setRehireEligible] = useState<boolean | null>(null);

  const resetForm = () => {
    setStep(1);
    setExitDate(new Date().toISOString().split("T")[0]);
    setLastWorkingDay("");
    setExitReason("");
    setNoticeServed(false);
    setReplacementManagerId("");
    setAssetReturnConfirmed(false);
    setKnowledgeTransferStatus("not_started");
    setExitInterviewCompleted(false);
    setRehireEligible(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const canProceedStep1 = exitDate && exitReason;
  const canSubmit = canProceedStep1; // Step 2 fields are optional compliance items

  const handleSubmit = async () => {
    if (!targetUser || !canSubmit) return;
    setProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: {
          action: "exit_user",
          user_id: targetUser.user_id,
          exit_date: exitDate,
          last_working_day: lastWorkingDay || exitDate,
          exit_reason: exitReason,
          notice_served: noticeServed,
          replacement_manager_id: replacementManagerId || undefined,
          exit_interview_completed: exitInterviewCompleted,
          rehire_eligible: rehireEligible,
          asset_return_confirmed: assetReturnConfirmed,
          knowledge_transfer_status: knowledgeTransferStatus,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Failed to process exit");
        return;
      }

      const automations = data?.automations || {};
      const msgs: string[] = [`Exit processed for ${targetUser.full_name || targetUser.email}`];
      if (automations.assets && automations.assets !== "No assets assigned") {
        msgs.push(automations.assets);
      }
      if (automations.reimbursements && automations.reimbursements !== "No pending claims") {
        msgs.push(automations.reimbursements);
      }

      toast.success(msgs.join(". "));
      handleClose();
      onComplete();
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setProcessing(false);
    }
  };

  const eligibleManagers = activeUsers.filter(
    (u) => u.user_id !== targetUser?.user_id
  );

  if (!targetUser) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            Employee Exit Processing
          </DialogTitle>
          <DialogDescription>
            Processing exit for{" "}
            <span className="font-semibold text-foreground">
              {targetUser.full_name || targetUser.email}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 py-2">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => {
                  if (s.id < step) setStep(s.id);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  step === s.id
                    ? "bg-primary text-primary-foreground"
                    : step > s.id
                    ? "bg-primary/10 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
              {idx < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step 1: Exit Details */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="exit_date">
                  Exit Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="exit_date"
                  type="date"
                  value={exitDate}
                  onChange={(e) => setExitDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lwd">Last Working Day</Label>
                <Input
                  id="lwd"
                  type="date"
                  value={lastWorkingDay}
                  onChange={(e) => setLastWorkingDay(e.target.value)}
                  placeholder="Defaults to exit date"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Exit Reason <span className="text-destructive">*</span>
              </Label>
              <Select value={exitReason} onValueChange={setExitReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm font-medium">Notice Period Served</Label>
                <p className="text-xs text-muted-foreground">
                  Was the contractual notice period fulfilled?
                </p>
              </div>
              <Switch checked={noticeServed} onCheckedChange={setNoticeServed} />
            </div>

            <div className="space-y-1.5">
              <Label>Reassign Direct Reports To</Label>
              <Select value={replacementManagerId} onValueChange={setReplacementManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select replacement manager (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No replacement — unassign</SelectItem>
                  {eligibleManagers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2: Compliance Checklist */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Asset Return Confirmed</Label>
                  <p className="text-xs text-muted-foreground">
                    All company assets (laptop, ID card, etc.) returned?
                  </p>
                </div>
              </div>
              <Switch checked={assetReturnConfirmed} onCheckedChange={setAssetReturnConfirmed} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Label>Knowledge Transfer Status</Label>
              </div>
              <Select value={knowledgeTransferStatus} onValueChange={setKnowledgeTransferStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm font-medium">Exit Interview Completed</Label>
                <p className="text-xs text-muted-foreground">
                  Has the exit interview been conducted?
                </p>
              </div>
              <Switch checked={exitInterviewCompleted} onCheckedChange={setExitInterviewCompleted} />
            </div>

            <div className="space-y-1.5">
              <Label>Rehire Eligibility</Label>
              <Select
                value={rehireEligible === null ? "undecided" : rehireEligible ? "yes" : "no"}
                onValueChange={(val) =>
                  setRehireEligible(val === "undecided" ? null : val === "yes")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="undecided">Not Decided</SelectItem>
                  <SelectItem value="yes">Eligible for Rehire</SelectItem>
                  <SelectItem value="no">Not Eligible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-600">
                    This action will:
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
                    <li>
                      Set <strong>{targetUser.full_name || targetUser.email}</strong> status to <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500">Exited</Badge>
                    </li>
                    <li>Revoke all system roles and access</li>
                    <li>Auto-recall assigned company assets</li>
                    <li>Flag pending reimbursements for FnF settlement</li>
                    {replacementManagerId && replacementManagerId !== "none" && (
                      <li>Reassign direct reports to the selected replacement manager</li>
                    )}
                    <li>Create an audit trail entry</li>
                  </ul>
                  <p className="mt-3 text-xs">
                    Login access will <strong>not</strong> be revoked automatically. HR/Admin can manually toggle it off when ready.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
              <h4 className="font-semibold text-foreground mb-2">Exit Summary</h4>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                <span className="text-muted-foreground">Employee</span>
                <span className="font-medium">{targetUser.full_name || targetUser.email}</span>

                <span className="text-muted-foreground">Exit Date</span>
                <span>{exitDate}</span>

                <span className="text-muted-foreground">Last Working Day</span>
                <span>{lastWorkingDay || exitDate}</span>

                <span className="text-muted-foreground">Reason</span>
                <span className="capitalize">{exitReason.replace("_", " ")}</span>

                <span className="text-muted-foreground">Notice Served</span>
                <span>{noticeServed ? "Yes" : "No"}</span>

                <span className="text-muted-foreground">Assets Returned</span>
                <span>{assetReturnConfirmed ? "Yes" : "No"}</span>

                <span className="text-muted-foreground">Knowledge Transfer</span>
                <span className="capitalize">{knowledgeTransferStatus.replace("_", " ")}</span>

                <span className="text-muted-foreground">Exit Interview</span>
                <span>{exitInterviewCompleted ? "Completed" : "Pending"}</span>

                <span className="text-muted-foreground">Rehire Eligible</span>
                <span>
                  {rehireEligible === null ? "Not Decided" : rehireEligible ? "Yes" : "No"}
                </span>

                <span className="text-muted-foreground">FnF Status</span>
                <Badge variant="outline" className="text-xs w-fit bg-amber-500/10 text-amber-600">
                  Pending
                </Badge>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={processing}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={processing}>
              Cancel
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && !canProceedStep1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={processing}
                className="gap-2"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserX className="h-4 w-4" />
                )}
                Process Exit
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
