import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Zap, Lock, Download, Trash2, Calendar, Eye, Send, CheckCircle2,
  ShieldCheck, FileSpreadsheet, Landmark,
} from "lucide-react";
import {
  usePayrollRuns,
  usePayrollRunEntries,
  useGeneratePayroll,
  useDeletePayrollRun,
  useUpdateEntryLWP,
  exportPayrollCSV,
  type PayrollRun,
} from "@/hooks/usePayrollEngine";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import {
  useSubmitForReview,
  useApprovePayroll,
  useLockApprovedPayroll,
} from "@/hooks/usePayrollApproval";
import { exportPFECR, exportBankTransferFile, exportPayrollMasterCSV } from "@/hooks/usePayrollExports";
import { useGeneratePayslips } from "@/hooks/usePayslipGeneration";
import { useIsFinance, useCurrentRole } from "@/hooks/useRoles";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText as FileTextIcon, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWageDeadlines, computeDeadlineDate } from "@/hooks/useWageDeadlines";
import { usePayrollFlags } from "@/hooks/usePayrollFlags";

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const periodLabel = (p: string) => {
  // Supports formats: "2026-03" (monthly), "2026-03-W1" (weekly), "2026-03-H1" (biweekly)
  const parts = p.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = `${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
  if (parts.length === 3) {
    if (parts[2].startsWith("H")) return `${monthLabel} (${parts[2] === "H1" ? "1st–15th" : "16th–End"})`;
    if (parts[2].startsWith("W")) return `${monthLabel} Week ${parts[2].replace("W", "")}`;
  }
  return monthLabel;
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  biweekly: "Bi-weekly",
  weekly: "Weekly",
};

/** Generate pay periods based on frequency */
const generatePeriods = (frequency: string) => {
  const result: string[] = [];
  const now = new Date();

  if (frequency === "weekly") {
    // Last 12 weeks worth — 4 weeks × 3 months
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yr = d.getFullYear();
      const mn = String(d.getMonth() + 1).padStart(2, "0");
      for (let w = 4; w >= 1; w--) {
        result.push(`${yr}-${mn}-W${w}`);
      }
    }
  } else if (frequency === "biweekly") {
    // Last 12 half-months
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yr = d.getFullYear();
      const mn = String(d.getMonth() + 1).padStart(2, "0");
      result.push(`${yr}-${mn}-H2`);
      result.push(`${yr}-${mn}-H1`);
    }
  } else {
    // Monthly (default)
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  return result;
};

const currentPeriod = (frequency: string) => {
  const d = new Date();
  const yr = d.getFullYear();
  const mn = String(d.getMonth() + 1).padStart(2, "0");
  if (frequency === "weekly") {
    const week = Math.min(4, Math.ceil(d.getDate() / 7));
    return `${yr}-${mn}-W${week}`;
  }
  if (frequency === "biweekly") {
    return d.getDate() <= 15 ? `${yr}-${mn}-H1` : `${yr}-${mn}-H2`;
  }
  return `${yr}-${mn}`;
};

const statusConfig: Record<string, { label: string; class: string; icon: any }> = {
  draft: { label: "Draft", class: "bg-muted text-muted-foreground border-border", icon: Zap },
  processing: { label: "Processing", class: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Zap },
  completed: { label: "Completed", class: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: CheckCircle2 },
  under_review: { label: "Under Review", class: "bg-purple-500/10 text-purple-600 border-purple-500/30", icon: Send },
  approved: { label: "Approved", class: "bg-green-500/10 text-green-600 border-green-500/30", icon: ShieldCheck },
  locked: { label: "Locked", class: "bg-primary/10 text-primary border-primary/30", icon: Lock },
};

export function PayrollEnginePanel() {
  const { data: runs = [], isLoading } = usePayrollRuns();
  const generate = useGeneratePayroll();
  const deleteRun = useDeletePayrollRun();
  const submitForReview = useSubmitForReview();
  const approvePayroll = useApprovePayroll();
  const lockPayroll = useLockApprovedPayroll();
  const generatePayslips = useGeneratePayslips();
  const { data: isFinance } = useIsFinance();
  const { data: currentRole } = useCurrentRole();
  const { data: payrollFlags } = usePayrollFlags();
  const frequency = payrollFlags?.payroll_frequency || "monthly";

  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod(frequency));
  const [viewRun, setViewRun] = useState<PayrollRun | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ run: PayrollRun; action: string } | null>(null);

  const { data: deadlines = [] } = useWageDeadlines();

  const existingRun = runs.find((r) => r.pay_period === selectedPeriod);

  const isHR = currentRole === "hr";
  const isFinanceOrAdmin = isFinance || currentRole === "admin";

  // Wage deadline warning for selected period
  const deadlineDate = computeDeadlineDate(selectedPeriod, 500); // default <1000 employees
  const deadlineDt = new Date(deadlineDate);
  const now = new Date();
  const daysUntilDeadline = Math.ceil((deadlineDt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntilDeadline < 0;
  const isUrgent = daysUntilDeadline >= 0 && daysUntilDeadline <= 3;
  const selectedRunLocked = existingRun?.status === "locked";
  const showDeadlineWarning = !selectedRunLocked && (isOverdue || isUrgent);

  // HR submits for review; Finance/Admin approves and locks
  const canSubmitReview = (run: PayrollRun) => run.status === "completed" && (isHR || isFinanceOrAdmin);
  const canApprove = (run: PayrollRun) => run.status === "under_review" && isFinanceOrAdmin;
  const canLock = (run: PayrollRun) => run.status === "approved" && isFinanceOrAdmin;

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    const { run, action } = confirmAction;
    if (action === "review") submitForReview.mutate(run.id);
    if (action === "approve") approvePayroll.mutate(run.id);
    if (action === "lock") lockPayroll.mutate(run.id);
    setConfirmAction(null);
  };

  return (
    <>
      {showDeadlineWarning && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {isOverdue
              ? `⚠️ Payment of Wages Act §5: Wages for ${periodLabel(selectedPeriod)} were due by ${deadlineDate}. Immediate disbursement required to avoid penalties.`
              : `⏰ Wage deadline: Disbursement for ${periodLabel(selectedPeriod)} is due by ${deadlineDate} (${daysUntilDeadline} day${daysUntilDeadline !== 1 ? "s" : ""} remaining). Per Payment of Wages Act §5.`}
          </AlertDescription>
        </Alert>
      )}
      <Card className="glass-card">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-gradient-primary flex items-center gap-2">
              <Zap className="h-5 w-5" /> Payroll Engine
            </CardTitle>
            <CardDescription>
              Generate, review, approve & lock payroll
              <Badge variant="outline" className="ml-2 text-xs">{FREQUENCY_LABELS[frequency] || frequency}</Badge>
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-52">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {generatePeriods(frequency).map((p) => (
                  <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => generate.mutate(selectedPeriod)}
              disabled={generate.isPending || !!existingRun}
            >
              <Zap className="h-4 w-4 mr-1" />
              {generate.isPending ? "Generating..." : existingRun ? "Already Generated" : "Generate Payroll"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : runs.filter((r) => r.pay_period === selectedPeriod).length === 0 ? (
            <div className="text-center py-8">
              <Zap className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No payroll run for {periodLabel(selectedPeriod)}. Select a period and generate payroll.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.filter((run) => run.pay_period === selectedPeriod).map((run) => {
                    const sc = statusConfig[run.status] || statusConfig.draft;
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium">{periodLabel(run.pay_period)}</TableCell>
                        <TableCell className="text-right">{run.employee_count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(run.total_gross)}</TableCell>
                        <TableCell className="text-right text-destructive">-{formatCurrency(run.total_deductions)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(run.total_net)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={sc.class}>
                            <sc.icon className="h-3 w-3 mr-1" />
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewRun(run)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View entries</TooltipContent>
                            </Tooltip>

                            {canSubmitReview(run) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-600"
                                    onClick={() => setConfirmAction({ run, action: "review" })}>
                                    <Send className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Submit for Review</TooltipContent>
                              </Tooltip>
                            )}

                            {canApprove(run) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                                    onClick={() => setConfirmAction({ run, action: "approve" })}>
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Approve</TooltipContent>
                              </Tooltip>
                            )}

                            {canLock(run) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => setConfirmAction({ run, action: "lock" })}>
                                    <Lock className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Lock (Immutable)</TooltipContent>
                              </Tooltip>
                            )}

                            {run.status !== "locked" && run.status !== "approved" && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget(run)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {run.status === "locked" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    disabled={generatePayslips.isPending}
                                    onClick={() => generatePayslips.mutate(run.id)}>
                                    <FileTextIcon className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Generate Payslips</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Entries Dialog */}
      {viewRun && (
        <PayrollEntriesDialog run={viewRun} open={!!viewRun} onOpenChange={(o) => !o && setViewRun(null)} />
      )}

      {/* Confirm Action Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "review" && "Submit for Review"}
              {confirmAction?.action === "approve" && "Approve Payroll"}
              {confirmAction?.action === "lock" && "Lock Payroll"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "review" && `Submit ${confirmAction?.run ? periodLabel(confirmAction.run.pay_period) : ""} payroll for finance review?`}
              {confirmAction?.action === "approve" && `Approve ${confirmAction?.run ? periodLabel(confirmAction.run.pay_period) : ""} payroll? This allows locking.`}
              {confirmAction?.action === "lock" && `Lock ${confirmAction?.run ? periodLabel(confirmAction.run.pay_period) : ""} payroll? This is IRREVERSIBLE — no further modifications allowed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payroll Run</AlertDialogTitle>
            <AlertDialogDescription>
              Delete payroll run for {deleteTarget ? periodLabel(deleteTarget.pay_period) : ""}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteRun.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Extract a named component's amount from earnings or deductions breakdown */
function getComponent(breakdown: any[], name: string): number {
  const item = (breakdown ?? []).find((c: any) => c.name === name);
  return item ? Number(item.amount ?? item.monthly ?? 0) : 0;
}

function fmtComp(amount: number) {
  return amount > 0 ? formatCurrency(amount) : "—";
}

function PayrollEntriesDialog({ run, open, onOpenChange }: { run: PayrollRun; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: entries = [], isLoading } = usePayrollRunEntries(run.id);
  const updateLWP = useUpdateEntryLWP();
  const isLocked = run.status === "locked";
  const isEditable = !isLocked && run.status !== "approved";

  const pagination = usePagination(entries, 20);

  const handleLWPChange = useCallback((entryId: string, value: string) => {
    const lwpDays = Math.max(0, parseInt(value) || 0);
    updateLWP.mutate({ entryId, lwpDays, runId: run.id });
  }, [run.id, updateLWP]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Remove overflow-y-auto from DialogContent — it forces overflow-x:auto too
          (CSS spec: non-visible y → computed x becomes auto), which clips the table.
          Instead we use a flex-column layout with a single overflow-auto body div. */}
      <DialogContent className="max-w-5xl p-0 flex flex-col max-h-[85vh]">
        {/* ── Non-scrolling header ── */}
        <div className="p-6 pb-4 flex-shrink-0 space-y-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Payroll — {periodLabel(run.pay_period)}
              <Badge variant="outline" className={statusConfig[run.status]?.class || ""}>
                {statusConfig[run.status]?.label || run.status}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {run.employee_count} employees
              {isEditable && (
                <span className="ml-2 text-xs text-amber-600">• LWP days are editable — click to adjust</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Approval Timeline */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span>Generated: {new Date(run.created_at).toLocaleDateString("en-IN")}</span>
            {run.reviewed_at && <span>• Reviewed: {new Date(run.reviewed_at).toLocaleDateString("en-IN")}</span>}
            {run.approved_at && <span>• Approved: {new Date(run.approved_at).toLocaleDateString("en-IN")}</span>}
            {run.locked_at && <span>• Locked: {new Date(run.locked_at).toLocaleDateString("en-IN")}</span>}
          </div>

          <Separator />

          {/* Leave adjustment info banner */}
          {isEditable && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Automatic Leave Adjustments Applied</p>
                <p className="mt-0.5 text-muted-foreground">
                  LWP days are auto-calculated from approved unpaid leaves and attendance absences.
                  You can manually override by editing the LWP column below — net pay will recalculate automatically.
                </p>
              </div>
            </div>
          )}

          {/* Export buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportPayrollCSV(entries, run.pay_period)} disabled={entries.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Payroll CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPayrollMasterCSV(entries, run.pay_period)} disabled={entries.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Master CSV
            </Button>
            {isLocked && (
              <>
                <Button variant="outline" size="sm" onClick={() => exportPFECR(entries)}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> PF ECR
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportBankTransferFile(entries)}>
                  <Landmark className="h-4 w-4 mr-1" /> Bank Transfer
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Single scroll container (both axes) ── */}
        <div className="flex-1 min-h-0 overflow-auto px-6">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table className="min-w-[1400px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Annual CTC</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">PF (EE)</TableHead>
                  <TableHead className="text-right">PF (ER)</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Incentive</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Working</TableHead>
                  <TableHead className="text-center">
                    LWP
                    {isEditable && <span className="block text-[10px] text-amber-600 font-normal">(editable)</span>}
                  </TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{e.profiles?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{e.profiles?.job_title || ""}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.profiles?.department || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(e.annual_ctc)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(e.gross_earnings)}</TableCell>
                    <TableCell className="text-right">{fmtComp(e.pf_employee ?? 0)}</TableCell>
                    <TableCell className="text-right">{fmtComp(e.pf_employer ?? 0)}</TableCell>
                    <TableCell className="text-right">{fmtComp(e.tds_amount ?? 0)}</TableCell>
                    <TableCell className="text-right">{fmtComp(getComponent(e.earnings_breakdown, "Incentive"))}</TableCell>
                    <TableCell className="text-right">{fmtComp(getComponent(e.earnings_breakdown, "Bonus"))}</TableCell>
                    <TableCell className="text-right text-destructive">-{formatCurrency(e.total_deductions)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{e.working_days}d</TableCell>
                    <TableCell className="text-center">
                      {isEditable ? (
                        <input
                          type="number"
                          min={0}
                          max={e.working_days}
                          defaultValue={e.lwp_days}
                          className="w-14 h-7 text-center text-sm rounded border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          onBlur={(ev) => {
                            const newVal = parseInt(ev.target.value) || 0;
                            if (newVal !== e.lwp_days) {
                              handleLWPChange(e.id, ev.target.value);
                            }
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                          }}
                          disabled={updateLWP.isPending}
                        />
                      ) : (
                        e.lwp_days > 0
                          ? <span className="text-amber-600">{e.lwp_days}d</span>
                          : <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{e.paid_days}d</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(e.net_pay)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Non-scrolling footer: pagination + run totals ── */}
        <div className="flex-shrink-0 px-6 pb-6 pt-4 space-y-4 border-t">
          {entries.length > 0 && (
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
          )}
          {entries.length > 0 && (
            <div className="rounded-xl border bg-muted/50 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Gross</p>
                <p className="font-semibold">{formatCurrency(run.total_gross)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Deductions</p>
                <p className="font-semibold text-destructive">{formatCurrency(run.total_deductions)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Net</p>
                <p className="font-bold text-lg">{formatCurrency(run.total_net)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Employees</p>
                <p className="font-semibold">{run.employee_count}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
