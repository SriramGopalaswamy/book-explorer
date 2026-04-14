import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { MainLayout } from "@/components/layout/MainLayout";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, Users, Calendar, TrendingUp, Download, Search, FileText,
  CheckCircle, Clock, Plus, MoreHorizontal, Pencil, Trash2, ShieldAlert, Zap, Eye, AlertTriangle, X, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsAdminOrHR, useEmployees } from "@/hooks/useEmployees";
import { useIsFinance, useCurrentRole } from "@/hooks/useRoles";
import {
  usePendingPayslipDisputes,
  useHRReviewDispute,
  useFinanceReviewDispute,
  DISPUTE_CATEGORIES,
  type PayslipDispute,
} from "@/hooks/usePayslipDisputes";
import {
  usePayrollRecords, usePayrollStats, useCreatePayroll, useUpdatePayroll,
  useDeletePayroll, useBulkDeletePayroll, useProcessPayroll, useMyPayrollRecords,
  type PayrollRecord, type CreatePayrollData,
} from "@/hooks/usePayroll";
import { PaySlipDialog } from "@/components/payroll/PaySlipDialog";
import { EmployeeCombobox } from "@/components/payroll/EmployeeCombobox";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { usePayrollBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";
import { PayrollEnginePanel } from "@/components/payroll/PayrollEnginePanel";
import { PayrollAnalyticsDashboard } from "@/components/payroll/PayrollAnalyticsDashboard";
import { InvestmentDeclarationPortal } from "@/components/payroll/InvestmentDeclarationPortal";
import { useAuth } from "@/contexts/AuthContext";
import { useHasApprovedDispute } from "@/hooks/usePayslipDisputes";
import { usePayrollAutoCalc } from "@/hooks/usePayrollAutoCalc";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
};

const formatCurrency = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString("en-IN")}`;
};

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

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

const periods24 = () => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
};

const statusStyles: Record<string, string> = {
  locked: "bg-green-500/10 text-green-600 border-green-500/30",
  approved: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  under_review: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  draft: "bg-muted text-muted-foreground border-border",
  // Legacy fallbacks
  processed: "bg-green-500/10 text-green-600 border-green-500/30",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

const defaultForm: Omit<CreatePayrollData, "profile_id" | "pay_period"> = {
  basic_salary: 0, hra: 0, transport_allowance: 0, other_allowances: 0,
  pf_deduction: 0, tax_deduction: 0, other_deductions: 0,
  lop_days: 0, lop_deduction: 0, working_days: 0, paid_days: 0,
  net_pay: 0,
};

// ─── Inline HR Dispute Approvals for Payroll page ─────────────────────────────
function PayrollHRDisputes() {
  const { data: disputes = [], isLoading } = usePendingPayslipDisputes("hr");
  const reviewDispute = useHRReviewDispute();
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<PayslipDispute | null>(null);
  const [payslipData, setPayslipData] = useState<any>(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [pendingAction, setPendingAction] = useState<"forward" | "reject" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fmtCurrency = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const openReview = async (dispute: PayslipDispute) => {
    setSelected(dispute);
    setNotes("");
    setPendingAction(null);
    setConfirmOpen(false);
    setPayslipData(null);
    setLoadingPayslip(true);
    try {
      let data: any = null;
      if (dispute.payroll_record_id) {
        const res = await supabase.from("payroll_records").select("*, profiles:profile_id(full_name, department, job_title)").eq("id", dispute.payroll_record_id).maybeSingle();
        if (!res.error && res.data) data = res.data;
      }
      if (!data && dispute.profile_id && dispute.pay_period) {
        const res = await supabase.from("payroll_records").select("*, profiles:profile_id(full_name, department, job_title)").eq("profile_id", dispute.profile_id).eq("pay_period", dispute.pay_period).order("version", { ascending: false }).limit(1).maybeSingle();
        if (!res.error && res.data) data = res.data;
      }
      if (data) setPayslipData(data);
    } catch (err) { console.warn("Failed to fetch payroll record:", err); }
    finally { setLoadingPayslip(false); }
  };

  const handleSubmit = () => {
    if (!selected || !pendingAction) return;
    reviewDispute.mutate({ disputeId: selected.id, action: pendingAction, notes: notes || undefined }, {
      onSuccess: () => { setConfirmOpen(false); setSelected(null); },
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
  if (disputes.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3"><ShieldAlert className="h-10 w-10 opacity-40" /><p className="text-sm">No payslip disputes pending HR approval.</p></div>;

  return (
    <>
      <div className="space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="rounded-lg border border-border/50 bg-card/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{d.profiles?.full_name || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">{periodLabel(d.pay_period)} · {DISPUTE_CATEGORIES.find(c => c.value === d.dispute_category)?.label || d.dispute_category}</p>
                <p className="text-xs text-muted-foreground mt-1 italic">"{d.description}"</p>
                {d.manager_notes && <p className="text-xs text-muted-foreground mt-1"><strong>Manager:</strong> {d.manager_notes}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => openReview(d)} className="shrink-0">
                <Eye className="h-3.5 w-3.5 mr-1" /> Review
              </Button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <Dialog open onOpenChange={(v) => { if (!v) { setSelected(null); setConfirmOpen(false); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                HR Payslip Dispute Review
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <DisputeInfoSection dispute={selected} />
              <PayslipSummarySection loading={loadingPayslip} payslipData={payslipData} fmtCurrency={fmtCurrency} />
              {!confirmOpen ? (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                  <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => { setPendingAction("reject"); setConfirmOpen(true); }}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setPendingAction("forward"); setConfirmOpen(true); }}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Forward to Finance
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 border-t border-border/50 pt-4">
                  <Label>{pendingAction === "reject" ? "Rejection Reason" : "Notes for Finance"}</Label>
                  <Input placeholder={pendingAction === "reject" ? "Explain why…" : "Any context…"} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button>
                    <Button size="sm" onClick={handleSubmit} disabled={reviewDispute.isPending} className={pendingAction === "forward" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}>
                      {reviewDispute.isPending ? "Saving…" : pendingAction === "forward" ? "Forward to Finance" : "Reject"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Inline Finance Dispute Approvals for Payroll page ────────────────────────
function PayrollFinanceDisputes() {
  const { data: disputes = [], isLoading } = usePendingPayslipDisputes("finance");
  const reviewDispute = useFinanceReviewDispute();
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<PayslipDispute | null>(null);
  const [payslipData, setPayslipData] = useState<any>(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fmtCurrency = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const openReview = async (dispute: PayslipDispute) => {
    setSelected(dispute);
    setNotes("");
    setPendingAction(null);
    setConfirmOpen(false);
    setPayslipData(null);
    setLoadingPayslip(true);
    try {
      let data: any = null;
      if (dispute.payroll_record_id) {
        const res = await supabase.from("payroll_records").select("*, profiles:profile_id(full_name, department, job_title)").eq("id", dispute.payroll_record_id).maybeSingle();
        if (!res.error && res.data) data = res.data;
      }
      if (!data && dispute.profile_id && dispute.pay_period) {
        const res = await supabase.from("payroll_records").select("*, profiles:profile_id(full_name, department, job_title)").eq("profile_id", dispute.profile_id).eq("pay_period", dispute.pay_period).order("version", { ascending: false }).limit(1).maybeSingle();
        if (!res.error && res.data) data = res.data;
      }
      if (data) setPayslipData(data);
    } catch (err) { console.warn("Failed to fetch payroll record:", err); }
    finally { setLoadingPayslip(false); }
  };

  const handleSubmit = () => {
    if (!selected || !pendingAction) return;
    reviewDispute.mutate({ disputeId: selected.id, action: pendingAction, notes: notes || undefined }, {
      onSuccess: () => { setConfirmOpen(false); setSelected(null); },
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Clock className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
  if (disputes.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3"><Wallet className="h-10 w-10 opacity-40" /><p className="text-sm">No payslip disputes pending Finance approval.</p></div>;

  return (
    <>
      <div className="space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="rounded-lg border border-border/50 bg-card/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{d.profiles?.full_name || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">{periodLabel(d.pay_period)} · {DISPUTE_CATEGORIES.find(c => c.value === d.dispute_category)?.label || d.dispute_category}</p>
                <p className="text-xs text-muted-foreground mt-1 italic">"{d.description}"</p>
                {d.manager_notes && <p className="text-xs text-muted-foreground mt-1"><strong>Manager:</strong> {d.manager_notes}</p>}
                {d.hr_notes && <p className="text-xs text-muted-foreground mt-1"><strong>HR:</strong> {d.hr_notes}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => openReview(d)} className="shrink-0">
                <Eye className="h-3.5 w-3.5 mr-1" /> Review
              </Button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <Dialog open onOpenChange={(v) => { if (!v) { setSelected(null); setConfirmOpen(false); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-amber-500" />
                Finance Payslip Dispute Review
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <DisputeInfoSection dispute={selected} />
              <PayslipSummarySection loading={loadingPayslip} payslipData={payslipData} fmtCurrency={fmtCurrency} />
              {!confirmOpen ? (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                  <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => { setPendingAction("reject"); setConfirmOpen(true); }}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setPendingAction("approve"); setConfirmOpen(true); }}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Approve & Apply
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 border-t border-border/50 pt-4">
                  {pendingAction === "approve" && (
                    <div className="rounded-md border border-green-500/20 bg-green-500/5 p-2 text-xs text-muted-foreground">
                      ⚡ Approving will mark the existing payslip as <strong>superseded</strong> and enable a corrected version.
                    </div>
                  )}
                  <Label>{pendingAction === "reject" ? "Rejection Reason" : "Approval Notes"}</Label>
                  <Input placeholder={pendingAction === "reject" ? "Explain why…" : "Any notes…"} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button>
                    <Button size="sm" onClick={handleSubmit} disabled={reviewDispute.isPending} className={pendingAction === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}>
                      {reviewDispute.isPending ? "Saving…" : pendingAction === "approve" ? "Approve & Apply" : "Reject"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Shared Review Dialog Sections ────────────────────────────────────────────
function DisputeInfoSection({ dispute }: { dispute: PayslipDispute }) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Dispute Details
      </h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Employee</p>
          <p className="font-medium">{dispute.profiles?.full_name || "Unknown"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Pay Period</p>
          <p className="font-medium">{periodLabel(dispute.pay_period)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Category</p>
          <p className="font-medium">{DISPUTE_CATEGORIES.find(c => c.value === dispute.dispute_category)?.label || dispute.dispute_category}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Raised On</p>
          <p className="font-medium">{new Date(dispute.created_at).toLocaleDateString()}</p>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Employee's Concern</p>
        <p className="text-sm mt-1 bg-background/60 rounded-md p-2 border border-border/40 italic">"{dispute.description}"</p>
      </div>
    </div>
  );
}

function PayslipSummarySection({ loading, payslipData, fmtCurrency }: { loading: boolean; payslipData: any; fmtCurrency: (v: number) => string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        Payslip Details
      </h4>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm justify-center"><Clock className="h-4 w-4 animate-spin" /> Loading payslip…</div>
      ) : payslipData ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
            <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Employee</p><p className="font-medium">{payslipData.profiles?.full_name || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Department</p><p className="font-medium">{payslipData.profiles?.department || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Designation</p><p className="font-medium">{payslipData.profiles?.job_title || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p><Badge variant="outline" className="text-xs capitalize">{payslipData.status}</Badge></div>
            {Number(payslipData.working_days) > 0 && <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Working Days</p><p className="font-medium">{payslipData.working_days}</p></div>}
            {Number(payslipData.paid_days) > 0 && <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Paid Days</p><p className="font-medium">{payslipData.paid_days}{Number(payslipData.lop_days) > 0 && <span className="text-amber-500 ml-1">(LOP: {payslipData.lop_days})</span>}</p></div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earnings</h5>
              <div className="space-y-1 text-sm">
                {[
                  { label: "Basic Salary", amount: Number(payslipData.basic_salary) },
                  { label: "HRA", amount: Number(payslipData.hra) },
                  { label: "Transport", amount: Number(payslipData.transport_allowance) },
                  { label: "Other Allowances", amount: Number(payslipData.other_allowances) },
                ].filter(e => e.amount > 0).map(e => (
                  <div key={e.label} className="flex justify-between"><span className="text-muted-foreground">{e.label}</span><span className="font-medium">{fmtCurrency(e.amount)}</span></div>
                ))}
                <div className="flex justify-between border-t border-border/50 pt-1 font-semibold text-green-600">
                  <span>Total Earnings</span>
                  <span>{fmtCurrency(Number(payslipData.basic_salary) + Number(payslipData.hra) + Number(payslipData.transport_allowance) + Number(payslipData.other_allowances))}</span>
                </div>
              </div>
            </div>
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Deductions</h5>
              <div className="space-y-1 text-sm">
                {[
                  { label: "PF", amount: Number(payslipData.pf_deduction) },
                  { label: "TDS", amount: Number(payslipData.tax_deduction) },
                  { label: "Other", amount: Number(payslipData.other_deductions) },
                  ...(Number(payslipData.lop_deduction) > 0 ? [{ label: `LOP (${payslipData.lop_days}d)`, amount: Number(payslipData.lop_deduction) }] : []),
                ].filter(d => d.amount > 0).map(d => (
                  <div key={d.label} className="flex justify-between"><span className="text-muted-foreground">{d.label}</span><span className="font-medium">{fmtCurrency(d.amount)}</span></div>
                ))}
                <div className="flex justify-between border-t border-border/50 pt-1 font-semibold text-destructive">
                  <span>Total Deductions</span>
                  <span>{fmtCurrency(Number(payslipData.pf_deduction) + Number(payslipData.tax_deduction) + Number(payslipData.other_deductions) + (Number(payslipData.lop_deduction) || 0))}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex justify-between items-center">
            <span className="font-semibold">Net Pay</span>
            <span className="text-xl font-bold text-primary">{fmtCurrency(Number(payslipData.net_pay))}</span>
          </div>
        </>
      ) : (
        <div className="py-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Could not load payslip details. The payroll record may not exist yet for this period.</p>
          <p className="text-xs text-muted-foreground">You can still review the employee's concern above and take action.</p>
        </div>
      )}
    </div>
  );
}

export default function Payroll() {
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const bulkUploadConfig = usePayrollBulkUpload(selectedPeriod);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null);
  const [editTarget, setEditTarget] = useState<PayrollRecord | null>(null);
  const [paySlipRecord, setPaySlipRecord] = useState<PayrollRecord | null>(null);
  const [activeTab, setActiveTab] = useState("engine");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPeriod, setReviewPeriod] = useState("all");
  const [reviewPaySlipRecord, setReviewPaySlipRecord] = useState<PayrollRecord | null>(null);
  const { user } = useAuth();
  const { data: isAdminOrHR, isLoading: roleLoadingHR } = useIsAdminOrHR();
  const { data: isFinance, isLoading: roleLoadingFinance } = useIsFinance();
  const { data: currentRole } = useCurrentRole();
  const isAdmin = isAdminOrHR || isFinance;
  const roleLoading = roleLoadingHR || roleLoadingFinance;
  const isEmployeeOrManager = currentRole === "employee" || currentRole === "manager";
  const isHRRole = currentRole === "hr" || currentRole === "admin";
  const isFinanceRole = currentRole === "finance" || currentRole === "admin";
  const { data: pendingHRDisputes = [] } = usePendingPayslipDisputes("hr");
  const { data: pendingFinanceDisputes = [] } = usePendingPayslipDisputes("finance");
  const { data: records = [], isLoading, isError: recordsError } = usePayrollRecords(selectedPeriod);
  const { data: allPayrollRecords = [], isLoading: allLoading } = usePayrollRecords();
  const { data: myRecords = [], isLoading: myLoading } = useMyPayrollRecords();
  const stats = usePayrollStats(selectedPeriod);
  const { data: employees = [] } = useEmployees();
  // Get the current user's profile_id for declarations
  const myProfile = employees.find(e => e.user_id === user?.id);
  const createPayroll = useCreatePayroll();
  const updatePayroll = useUpdatePayroll();
  const deletePayroll = useDeletePayroll();
  const bulkDeletePayroll = useBulkDeletePayroll();
  const processPayroll = useProcessPayroll();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ profile_id: "", ...defaultForm });

  // Auto-calculate working days & LOP when employee is selected
  const autoCalc = usePayrollAutoCalc(form.profile_id || null, selectedPeriod);

  // Auto-fill working_days and lop_days when auto-calc data changes
  useEffect(() => {
    if (!autoCalc.isLoading && form.profile_id && autoCalc.workingDays > 0) {
      setForm((prev) => {
        const next = { ...prev };
        next.working_days = autoCalc.workingDays;
        next.lop_days = autoCalc.lopDays;
        // Recalculate LOP deduction and paid days
        const gross = next.basic_salary + next.hra + next.transport_allowance + next.other_allowances;
        next.lop_deduction = next.lop_days > 0 && next.working_days > 0
          ? Math.round((gross / next.working_days) * next.lop_days)
          : 0;
        next.paid_days = Math.max(0, next.working_days - next.lop_days);
        next.net_pay = gross - next.pf_deduction - next.tax_deduction - next.other_deductions - next.lop_deduction;
        return next;
      });
    }
  }, [autoCalc.isLoading, autoCalc.workingDays, autoCalc.lopDays, form.profile_id]);

  const calcNet = (f: typeof form) => {
    const gross = f.basic_salary + f.hra + f.transport_allowance + f.other_allowances;
    const deductions = f.pf_deduction + f.tax_deduction + f.other_deductions;
    const lopDeduction = f.lop_days > 0 && f.working_days > 0
      ? Math.round((gross / f.working_days) * f.lop_days)
      : 0;
    return gross - deductions - lopDeduction;
  };

  const setField = (key: string, val: string) => {
    const num = parseFloat(val) || 0;
    setForm((prev) => {
      const next = { ...prev, [key]: num };
      // Recalculate LOP deduction and paid days whenever any field changes
      const gross = next.basic_salary + next.hra + next.transport_allowance + next.other_allowances;
      next.lop_deduction = next.lop_days > 0 && next.working_days > 0
        ? Math.round((gross / next.working_days) * next.lop_days)
        : 0;
      next.paid_days = Math.max(0, next.working_days - next.lop_days);
      next.net_pay = gross - next.pf_deduction - next.tax_deduction - next.other_deductions - next.lop_deduction;
      return next;
    });
  };

  const filtered = useMemo(() =>
    records.filter((r) => {
      const name = r.profiles?.full_name?.toLowerCase() || "";
      const dept = r.profiles?.department?.toLowerCase() || "";
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || name.includes(q) || dept.includes(q);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    }), [records, searchQuery, statusFilter]);

  const pagination = usePagination(filtered, 10);

  const filteredReview = useMemo(() =>
    allPayrollRecords
      .filter((r) => r.status !== "superseded")
      .filter((r) => {
        const name = r.profiles?.full_name?.toLowerCase() || "";
        const q = reviewSearch.toLowerCase();
        const matchSearch = !q || name.includes(q);
        const matchPeriod = reviewPeriod === "all" || r.pay_period === reviewPeriod;
        return matchSearch && matchPeriod;
      })
      .sort((a, b) => b.pay_period.localeCompare(a.pay_period)),
    [allPayrollRecords, reviewSearch, reviewPeriod]);

  const reviewPagination = usePagination(filteredReview, 10);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedIds((prev) => prev.length === filtered.length ? [] : filtered.map((r) => r.id));

  const handleAdd = () => {
    if (!form.profile_id) return;
    // Check for existing payslip for same employee & period
    const existing = records.find(
      (r) => r.profile_id === form.profile_id && !((r as any).is_superseded)
    );
    if (existing) {
      // Check if there's an approved dispute allowing a revision
      const hasDispute = (existing as any)._hasApprovedDispute;
      toast.error(
        `A payslip already exists for this employee for ${periodLabel(selectedPeriod)}.` +
        (existing.status === "locked"
          ? " The employee must raise a dispute and get it approved before a revised payslip can be generated."
          : " Edit the existing record instead.")
      );
      return;
    }
    createPayroll.mutate(
      { ...form, pay_period: selectedPeriod, status: "draft" } as CreatePayrollData,
      { onSuccess: () => { setIsAddOpen(false); setForm({ profile_id: "", ...defaultForm }); } }
    );
  };

  const openEdit = (r: PayrollRecord) => {
    setEditTarget(r);
    setForm({
      profile_id: r.profile_id || "",
      basic_salary: Number(r.basic_salary),
      hra: Number(r.hra),
      transport_allowance: Number(r.transport_allowance),
      other_allowances: Number(r.other_allowances),
      pf_deduction: Number(r.pf_deduction),
      tax_deduction: Number(r.tax_deduction),
      other_deductions: Number(r.other_deductions),
      lop_days: Number(r.lop_days) || 0,
      lop_deduction: Number(r.lop_deduction) || 0,
      working_days: Number(r.working_days) || 0,
      paid_days: Number(r.paid_days) || 0,
      net_pay: Number(r.net_pay),
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!editTarget) return;
    updatePayroll.mutate(
      { id: editTarget.id, ...form },
      { onSuccess: () => { setIsEditOpen(false); setEditTarget(null); } }
    );
  };

  const handleBulkProcess = () => {
    if (selectedIds.length === 0) return;
    processPayroll.mutate(selectedIds, { onSuccess: () => setSelectedIds([]) });
  };

  const handleBulkDelete = () => {
    bulkDeletePayroll.mutate(selectedIds, {
      onSuccess: () => { setBulkDeleteConfirmOpen(false); setSelectedIds([]); },
    });
  };

  const handleSyncEmployeeInfo = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    toast.success("Employee details refreshed.");
  };

  // Access is now handled by FinanceRoute — only admin/finance reach here

  const salaryFormFields = (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
      {!editTarget && (
        <EmployeeCombobox
          employees={employees}
          value={form.profile_id}
          onSelect={(v) => setForm({ ...form, profile_id: v })}
        />
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Earnings</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["basic_salary", "Basic Salary"],
            ["hra", "HRA"],
            ["transport_allowance", "Transport"],
            ["other_allowances", "Other Allowances"],
          ].map(([key, label]) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                value={form[key as keyof typeof form] || ""}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Deductions</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["pf_deduction", "PF"],
            ["tax_deduction", "Tax (TDS)"],
            ["other_deductions", "Other"],
          ].map(([key, label]) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                value={form[key as keyof typeof form] || ""}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-amber-600">Loss of Pay (LOP)</p>
          {autoCalc.isLoading && form.profile_id && (
            <span className="text-xs text-muted-foreground animate-pulse">Calculating…</span>
          )}
        </div>
        {!autoCalc.isLoading && form.profile_id && autoCalc.workingDays > 0 && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <p>{autoCalc.totalCalendarDays} calendar days − {autoCalc.weekendDays} weekends − {autoCalc.holidays} holidays = <strong className="text-foreground">{autoCalc.workingDays} working days</strong></p>
            {autoCalc.lopBreakdown.length > 0 ? (
              autoCalc.lopBreakdown.map((b, i) => (
                <p key={i}>{b.type}: <strong className="text-foreground">{b.days} day{b.days !== 1 ? "s" : ""}</strong></p>
              ))
            ) : (
              <p>No LOP leaves found for this period</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Working Days</Label>
            <Input
              type="number"
              value={form.working_days || ""}
              onChange={(e) => setField("working_days", e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">LOP Days</Label>
            <Input
              type="number"
              value={form.lop_days || ""}
              onChange={(e) => setField("lop_days", e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Paid Days</Label>
            <Input type="number" value={form.paid_days || ""} disabled className="bg-muted/50" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">LOP Deduction</Label>
            <Input type="number" value={form.lop_deduction || ""} disabled className="bg-muted/50" />
          </div>
        </div>
      </div>
      <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 flex justify-between items-center">
        <span className="font-medium">Net Pay</span>
        <span className="text-lg font-bold text-gradient-primary">{formatCurrency(form.net_pay)}</span>
      </div>
    </div>
  );

  return (
    <MainLayout title="Payroll" subtitle="Manage salaries and compensation">
      <div className="space-y-6">
        
        {/* Stats */}
        <motion.div
          className="grid gap-4 md:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {[
            { label: "Total Payroll", value: formatCurrency(stats.totalPayroll), sub: `For ${periodLabel(selectedPeriod)}`, icon: Wallet, iconClass: "text-primary" },
            { label: "Employees", value: String(stats.totalEmployees), sub: "In payroll this period", icon: Users, iconClass: "text-primary" },
            { label: "Locked", value: String(stats.processed), sub: stats.totalEmployees > 0 ? `${Math.round((stats.processed / stats.totalEmployees) * 100)}% complete` : "No records", icon: CheckCircle, iconClass: "text-green-500", valueClass: "text-green-500" },
            { label: "In Progress", value: String(stats.pending), sub: "Draft / Review / Approved", icon: Clock, iconClass: "text-amber-500", valueClass: "text-amber-500" },
          ].map((stat) => (
            <motion.div key={stat.label} variants={fadeUp}>
              <Card className="glass-card glow-on-hover group transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:shadow-glow transition-shadow">
                    <stat.icon className={`h-4 w-4 ${stat.iconClass}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${stat.valueClass || ""}`}>{stat.value}</div>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Tabbed Sections */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.2 }}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="engine">Payroll Engine</TabsTrigger>
              <TabsTrigger value="register">Payroll Register</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="declarations">Tax Declarations</TabsTrigger>
              {isHRRole && (
                <TabsTrigger value="payslip-review">Payslip Review</TabsTrigger>
              )}
              {isHRRole && (
                <TabsTrigger value="hr-disputes">
                  HR Approvals
                  {pendingHRDisputes.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                      {pendingHRDisputes.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {isFinanceRole && (
                <TabsTrigger value="finance-disputes">
                  Finance Approvals
                  {pendingFinanceDisputes.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold">
                      {pendingFinanceDisputes.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="engine">
              <PayrollEnginePanel />
            </TabsContent>
            <TabsContent value="register">
              <Card className="glass-card">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-gradient-primary">Payroll Register</CardTitle>
                    <CardDescription>Salary breakdown for {periodLabel(selectedPeriod)}</CardDescription>
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
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        className="pl-9 w-40"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="locked">Locked</SelectItem>
                      </SelectContent>
                    </Select>

                    {selectedIds.length > 0 && (
                      <>
                        <Button
                          onClick={handleBulkProcess}
                          disabled={processPayroll.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Zap className="h-4 w-4 mr-1" />
                          Process ({selectedIds.length})
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => setBulkDeleteConfirmOpen(true)}
                          disabled={bulkDeletePayroll.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete ({selectedIds.length})
                        </Button>
                      </>
                    )}

                    <Button variant="outline" size="sm" onClick={handleSyncEmployeeInfo}>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Sync Employee Info
                    </Button>

                    <BulkUploadDialog config={bulkUploadConfig} />
                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Record
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md glass-morphism">
                        <DialogHeader>
                          <DialogTitle className="text-gradient-primary">Add Payroll Record</DialogTitle>
                          <DialogDescription>Add salary for {periodLabel(selectedPeriod)}</DialogDescription>
                        </DialogHeader>
                        {salaryFormFields}
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                          <Button onClick={handleAdd} disabled={createPayroll.isPending}>
                            {createPayroll.isPending ? "Adding..." : "Add Record"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading || roleLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : recordsError ? (
                    <div className="text-center py-12">
                      <FileText className="mx-auto h-12 w-12 text-destructive/60" />
                      <p className="mt-3 font-medium text-destructive">Failed to load payroll records</p>
                      <p className="text-sm text-muted-foreground mt-1">A database schema error occurred. Please contact support or try refreshing.</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                      <p className="mt-3 text-muted-foreground">
                        {searchQuery || statusFilter !== "all"
                          ? "No records match your filter"
                          : `No payroll records for ${periodLabel(selectedPeriod)}`}
                      </p>
                      <Button variant="outline" className="mt-4" onClick={() => setIsAddOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add First Record
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={selectedIds.length === filtered.length && filtered.length > 0}
                                onCheckedChange={toggleAll}
                              />
                            </TableHead>
                            <TableHead>Employee</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead className="text-right">Basic</TableHead>
                            <TableHead className="text-right">Allowances</TableHead>
                            <TableHead className="text-right">Deductions</TableHead>
                            <TableHead className="text-right">LOP</TableHead>
                            <TableHead className="text-right">Net Pay</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagination.paginatedItems.map((r) => {
                            // Mirror normalizeLegacyRecord: derive Basic as 62% of fixed gross
                            // so the register stays consistent with the payslip display.
                            const fixedGross   = Number(r.basic_salary) + Number(r.hra) + Number(r.other_allowances);
                            const displayBasic = fixedGross > 0 ? Math.round(fixedGross * 0.62) : Number(r.basic_salary);
                            // Allowances = remainder of fixed gross + incentives (transport_allowance)
                            const totalAllow   = (fixedGross > 0 ? fixedGross - displayBasic : Number(r.hra) + Number(r.other_allowances))
                              + Number(r.transport_allowance);
                            const totalDeduct = Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions);
                            const lopDeduct = Number(r.lop_deduction) || 0;
                            const lopDays = Number(r.lop_days) || 0;
                            return (
                              <TableRow
                                key={r.id}
                                className="cursor-pointer hover:bg-primary/5 transition-colors"
                                onClick={() => setPaySlipRecord(r)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedIds.includes(r.id)}
                                    onCheckedChange={() => toggleSelect(r.id)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{r.profiles?.full_name || "Unknown"}</p>
                                    <p className="text-sm text-muted-foreground">{r.profiles?.job_title || ""}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{r.profiles?.department || "—"}</TableCell>
                                <TableCell className="text-right">{formatCurrency(displayBasic)}</TableCell>
                                <TableCell className="text-right text-green-600">+{formatCurrency(totalAllow)}</TableCell>
                                <TableCell className="text-right text-destructive">-{formatCurrency(totalDeduct)}</TableCell>
                                <TableCell className="text-right">
                                  {lopDays > 0 ? (
                                    <span className="text-amber-600">
                                      {lopDays}d / -{formatCurrency(lopDeduct)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(Number(r.net_pay))}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={statusStyles[r.status] || statusStyles.draft}>
                                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                                  </Badge>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => setPaySlipRecord(r)}>
                                        <Eye className="mr-2 h-4 w-4" /> View Pay Slip
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEdit(r)}>
                                        <Pencil className="mr-2 h-4 w-4" /> Edit
                                      </DropdownMenuItem>
                                      {r.status === "draft" && (
                                        <DropdownMenuItem onClick={() => updatePayroll.mutate({ id: r.id, status: "under_review" })}>
                                          <CheckCircle className="mr-2 h-4 w-4" /> Submit for Review
                                        </DropdownMenuItem>
                                      )}
                                      {r.status === "under_review" && (
                                        <DropdownMenuItem onClick={() => updatePayroll.mutate({ id: r.id, status: "approved" })}>
                                          <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                        </DropdownMenuItem>
                                      )}
                                      {r.status === "approved" && (
                                        <DropdownMenuItem onClick={() => updatePayroll.mutate({ id: r.id, status: "locked" })}>
                                          <CheckCircle className="mr-2 h-4 w-4" /> Lock
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => setDeleteTarget(r)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
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
                  )}

                  {/* Summary footer */}
                  {filtered.length > 0 && (
                    <div className="mt-4 rounded-xl glass-morphism p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Basic</p>
                        <p className="font-semibold">{formatCurrency(stats.totalBasic)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Allowances</p>
                        <p className="font-semibold text-green-600">{formatCurrency(stats.totalAllowances)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Deductions</p>
                        <p className="font-semibold text-destructive">{formatCurrency(stats.totalDeductions)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Net Payroll</p>
                        <p className="font-bold text-lg text-gradient-primary">{formatCurrency(stats.totalPayroll)}</p>
                      </div>
                    </div>
                  )}

                  {/* Bulk Upload History inside register tab */}
                  <div className="mt-6">
                    <BulkUploadHistory module="payroll" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="analytics">
              <PayrollAnalyticsDashboard />
            </TabsContent>
            <TabsContent value="declarations">
              {myProfile?.id ? (
                <InvestmentDeclarationPortal profileId={myProfile.id} isAdmin={!!isAdmin} />
              ) : (
                <p className="text-muted-foreground text-center py-8">Loading profile...</p>
              )}
            </TabsContent>
            {isHRRole && (
              <TabsContent value="payslip-review">
                <Card className="glass-card">
                  <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-gradient-primary flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        All Employee Payslips
                      </CardTitle>
                      <CardDescription>Review payslips across all months for all employees</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={reviewPeriod} onValueChange={setReviewPeriod}>
                        <SelectTrigger className="w-44">
                          <Calendar className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="All Months" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Months</SelectItem>
                          {periods24().map((p) => (
                            <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by employee..."
                          className="pl-9 w-52"
                          value={reviewSearch}
                          onChange={(e) => setReviewSearch(e.target.value)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {allLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                      </div>
                    ) : filteredReview.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-3 text-muted-foreground">
                          {reviewSearch || reviewPeriod !== "all"
                            ? "No payslips match your filter"
                            : "No payslip records found"}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Table className="min-w-[700px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead>Department</TableHead>
                              <TableHead>Period</TableHead>
                              <TableHead className="text-right">Basic</TableHead>
                              <TableHead className="text-right">Allowances</TableHead>
                              <TableHead className="text-right">Deductions</TableHead>
                              <TableHead className="text-right">LOP</TableHead>
                              <TableHead className="text-right">Net Pay</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-20"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reviewPagination.paginatedItems.map((r) => {
                              const totalAllow = Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances);
                              const totalDeduct = Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions);
                              const lopDays = Number(r.lop_days) || 0;
                              const lopDeduct = Number(r.lop_deduction) || 0;
                              return (
                                <TableRow key={r.id} className="hover:bg-primary/5 transition-colors">
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{r.profiles?.full_name || "Unknown"}</p>
                                      <p className="text-xs text-muted-foreground">{r.profiles?.job_title || ""}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">{r.profiles?.department || "—"}</TableCell>
                                  <TableCell className="font-medium">{periodLabel(r.pay_period)}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(Number(r.basic_salary))}</TableCell>
                                  <TableCell className="text-right text-green-600">+{formatCurrency(totalAllow)}</TableCell>
                                  <TableCell className="text-right text-destructive">-{formatCurrency(totalDeduct)}</TableCell>
                                  <TableCell className="text-right">
                                    {lopDays > 0 ? (
                                      <span className="text-amber-600">{lopDays}d / -{formatCurrency(lopDeduct)}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">{formatCurrency(Number(r.net_pay))}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={statusStyles[r.status] || statusStyles.draft}>
                                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 gap-1 text-xs"
                                      onClick={() => setReviewPaySlipRecord(r)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        <TablePagination
                          page={reviewPagination.page}
                          totalPages={reviewPagination.totalPages}
                          totalItems={reviewPagination.totalItems}
                          from={reviewPagination.from}
                          to={reviewPagination.to}
                          pageSize={reviewPagination.pageSize}
                          onPageChange={reviewPagination.setPage}
                          onPageSizeChange={reviewPagination.setPageSize}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            {isHRRole && (
              <TabsContent value="hr-disputes">
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-gradient-primary flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5" />
                      HR Payslip Dispute Approvals
                    </CardTitle>
                    <CardDescription>Review disputes forwarded by managers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PayrollHRDisputes />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            {isFinanceRole && (
              <TabsContent value="finance-disputes">
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-gradient-primary flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Finance Payslip Dispute Approvals
                    </CardTitle>
                    <CardDescription>Final approval step — approving will auto-supersede the existing payslip</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PayrollFinanceDisputes />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </motion.div>
      </div>

      {/* Pay Slip Dialog — Payroll Register tab */}
      <PaySlipDialog
        record={paySlipRecord}
        open={!!paySlipRecord}
        onOpenChange={(open) => !open && setPaySlipRecord(null)}
      />

      {/* Pay Slip Dialog — Payslip Review tab */}
      <PaySlipDialog
        record={reviewPaySlipRecord}
        open={!!reviewPaySlipRecord}
        onOpenChange={(open) => !open && setReviewPaySlipRecord(null)}
      />

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md glass-morphism">
          <DialogHeader>
            <DialogTitle className="text-gradient-primary">Edit Payroll</DialogTitle>
            <DialogDescription>
              Update salary for {editTarget?.profiles?.full_name || "employee"}
            </DialogDescription>
          </DialogHeader>
          {salaryFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updatePayroll.isPending}>
              {updatePayroll.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payroll Record</AlertDialogTitle>
            <AlertDialogDescription>
              Remove payroll record for {deleteTarget?.profiles?.full_name}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deletePayroll.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} Payroll Record{selectedIds.length !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.length} selected record{selectedIds.length !== 1 ? "s" : ""}.
              Only draft or cancelled records can be deleted — any others will be skipped.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
              disabled={bulkDeletePayroll.isPending}
            >
              {bulkDeletePayroll.isPending ? "Deleting…" : `Delete ${selectedIds.length} Record${selectedIds.length !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Upload History - only shown in register tab handled above */}
    </MainLayout>
  );
}
