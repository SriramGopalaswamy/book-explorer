import { useState } from "react";
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
  exportPayrollCSV,
  type PayrollRun,
} from "@/hooks/usePayrollEngine";
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
import { FileText as FileTextIcon } from "lucide-react";

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]} ${y}`;
};

const periods = () => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
};

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [viewRun, setViewRun] = useState<PayrollRun | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ run: PayrollRun; action: string } | null>(null);

  const existingRun = runs.find((r) => r.pay_period === selectedPeriod);

  const canSubmitReview = (run: PayrollRun) => run.status === "completed";
  const canApprove = (run: PayrollRun) => run.status === "under_review" && (isFinance || currentRole === "admin");
  const canLock = (run: PayrollRun) => run.status === "approved" && (isFinance || currentRole === "admin");

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
      <Card className="glass-card">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-gradient-primary flex items-center gap-2">
              <Zap className="h-5 w-5" /> Payroll Engine
            </CardTitle>
            <CardDescription>Generate, review, approve & lock payroll</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-40">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods().map((p) => (
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
          ) : runs.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No payroll runs yet. Select a period and generate payroll.
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
                  {runs.map((run) => {
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

function PayrollEntriesDialog({ run, open, onOpenChange }: { run: PayrollRun; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: entries = [], isLoading } = usePayrollRunEntries(run.id);
  const isLocked = run.status === "locked";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Payroll — {periodLabel(run.pay_period)}
            <Badge variant="outline" className={statusConfig[run.status]?.class || ""}>
              {statusConfig[run.status]?.label || run.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {run.employee_count} employees
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

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Annual CTC</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">PF</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">LWP</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
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
                    <TableCell className="text-right">{formatCurrency(e.pf_employee ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(e.tds_amount ?? 0)}</TableCell>
                    <TableCell className="text-right text-destructive">-{formatCurrency(e.total_deductions)}</TableCell>
                    <TableCell className="text-right">
                      {e.lwp_days > 0 ? <span className="text-amber-600">{e.lwp_days}d</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(e.net_pay)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-4 rounded-xl border bg-muted/50 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
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
      </DialogContent>
    </Dialog>
  );
}
