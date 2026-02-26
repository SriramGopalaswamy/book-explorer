import { useState } from "react";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Eye, AlertTriangle, Clock, CheckCircle2, XCircle, IndianRupee, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { useMyPayrollRecords, type PayrollRecord } from "@/hooks/usePayroll";
import { useMyPayslipDisputes, useRaisePayslipDispute, DISPUTE_CATEGORIES, type PayslipDispute } from "@/hooks/usePayslipDisputes";
import { PaySlipDialog } from "@/components/payroll/PaySlipDialog";
import { useCompensationHistory, type CompensationStructure } from "@/hooks/useCompensation";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
};

const formatCurrency = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString("en-IN")}`;
};

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]} ${y}`;
};

const statusStyles: Record<string, string> = {
  processed: "bg-green-500/10 text-green-600 border-green-500/30",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  draft: "bg-muted text-muted-foreground border-border",
};

const disputeStatusStyles: Record<string, { label: string; className: string; icon: any }> = {
  pending_manager: { label: "Pending Manager", className: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Clock },
  pending_hr: { label: "Pending HR", className: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Clock },
  pending_finance: { label: "Pending Finance", className: "bg-purple-500/10 text-purple-600 border-purple-500/30", icon: Clock },
  approved: { label: "Approved", className: "bg-green-500/10 text-green-600 border-green-500/30", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-600 border-red-500/30", icon: XCircle },
};

/** Check if a pay period is within the last 3 months */
function isWithinDisputeWindow(payPeriod: string): boolean {
  const [y, m] = payPeriod.split("-").map(Number);
  const periodDate = new Date(y, m - 1, 1);
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  return periodDate >= threeMonthsAgo;
}

export default function MyPayslips() {
  const { user } = useAuth();
  const [paySlipRecord, setPaySlipRecord] = useState<PayrollRecord | null>(null);
  const { data: myRecords = [], isLoading: myLoading } = useMyPayrollRecords();
  const { data: myDisputes = [] } = useMyPayslipDisputes();
  const raiseDispute = useRaisePayslipDispute();
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null);

  // Get own profile ID for compensation lookup
  const { data: myProfileId } = useQuery({
    queryKey: ["my-profile-id-comp", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!user,
  });

  const { data: compensationHistory = [], isLoading: compLoading } = useCompensationHistory(myProfileId ?? null);

  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeRecord, setDisputeRecord] = useState<PayrollRecord | null>(null);
  const [disputeCategory, setDisputeCategory] = useState("salary_mismatch");
  const [disputeDescription, setDisputeDescription] = useState("");

  const openDisputeDialog = (record: PayrollRecord) => {
    setDisputeRecord(record);
    setDisputeCategory("salary_mismatch");
    setDisputeDescription("");
    setDisputeDialogOpen(true);
  };

  const handleRaiseDispute = () => {
    if (!disputeRecord || !disputeDescription.trim()) return;
    raiseDispute.mutate(
      {
        payroll_record_id: disputeRecord.id,
        pay_period: disputeRecord.pay_period,
        dispute_category: disputeCategory,
        description: disputeDescription,
      },
      { onSuccess: () => setDisputeDialogOpen(false) }
    );
  };

  const getDisputeForRecord = (recordId: string) =>
    myDisputes.find((d) => d.payroll_record_id === recordId);

  // Filter out superseded payslips
  const activeRecords = myRecords.filter((r: any) => !r.is_superseded);

  return (
    <MainLayout title="My Payslips" subtitle="View your salary details">
      <div className="space-y-6">
        <Tabs defaultValue="payslips">
          <TabsList>
            <TabsTrigger value="payslips">Payslips</TabsTrigger>
            <TabsTrigger value="compensation" className="gap-2">
              <IndianRupee className="h-3.5 w-3.5" />
              Compensation
            </TabsTrigger>
            <TabsTrigger value="disputes" className="gap-2">
              Disputes
              {myDisputes.filter((d) => !["approved", "rejected"].includes(d.status)).length > 0 && (
                <span className="ml-1 rounded-full bg-destructive/20 text-destructive text-xs px-1.5 py-0.5 font-semibold">
                  {myDisputes.filter((d) => !["approved", "rejected"].includes(d.status)).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payslips">
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-gradient-primary">Payslip History</CardTitle>
                  <CardDescription>Your payslips across all months</CardDescription>
                </CardHeader>
                <CardContent>
                  {myLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : activeRecords.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                      <p className="mt-3 text-muted-foreground">No payslips found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                         <TableHeader>
                          <TableRow>
                            <TableHead>Pay Period</TableHead>
                            <TableHead className="text-right">Basic</TableHead>
                            <TableHead className="text-right">Allowances</TableHead>
                            <TableHead className="text-right">Deductions</TableHead>
                            <TableHead className="text-right">LOP</TableHead>
                            <TableHead className="text-right">Net Pay</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-28"></TableHead>
                          </TableRow>
                         </TableHeader>
                        <TableBody>
                          {activeRecords.map((r) => {
                            const totalAllow = Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances);
                            const totalDeduct = Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions);
                            const lopDays = Number((r as any).lop_days) || 0;
                            const lopDeduction = Number((r as any).lop_deduction) || 0;
                            const existingDispute = getDisputeForRecord(r.id);
                            const canDispute = r.status === "processed" && isWithinDisputeWindow(r.pay_period) && !existingDispute;

                            return (
                              <TableRow
                                key={r.id}
                                className="cursor-pointer hover:bg-primary/5 transition-colors"
                                onClick={() => setPaySlipRecord(r)}
                              >
                                <TableCell className="font-medium">
                                  {periodLabel(r.pay_period)}
                                  {(r as any).version > 1 && (
                                    <Badge variant="outline" className="ml-2 text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                                      v{(r as any).version}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(Number(r.basic_salary))}</TableCell>
                                <TableCell className="text-right text-green-600">+{formatCurrency(totalAllow)}</TableCell>
                                <TableCell className="text-right text-destructive">-{formatCurrency(totalDeduct)}</TableCell>
                                <TableCell className="text-right">
                                  {lopDays > 0 ? (
                                    <span className="text-amber-600">{lopDays}d / -{formatCurrency(lopDeduction)}</span>
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
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setPaySlipRecord(r); }}>
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    {canDispute && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                        onClick={(e) => { e.stopPropagation(); openDisputeDialog(r); }}
                                        title="Raise Dispute"
                                      >
                                        <AlertTriangle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {existingDispute && (
                                      <Badge variant="outline" className={`text-[10px] ${disputeStatusStyles[existingDispute.status]?.className || ""}`}>
                                        {disputeStatusStyles[existingDispute.status]?.label || existingDispute.status}
                                      </Badge>
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
            </motion.div>
          </TabsContent>

          {/* Compensation Tab */}
          <TabsContent value="compensation">
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
              {/* Active CTC Summary */}
              {compensationHistory.length > 0 && compensationHistory[0].is_active && (
                <Card className="glass-card border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Current Annual CTC</p>
                        <p className="text-3xl font-bold text-gradient-primary">
                          ₹{compensationHistory[0].annual_ctc.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          Active
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Revision #{compensationHistory[0].revision_number}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Effective from {new Date(compensationHistory[0].effective_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {` • Monthly: ₹${Math.round(compensationHistory[0].annual_ctc / 12).toLocaleString("en-IN")}`}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Revision History */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Salary Revision History
                  </CardTitle>
                  <CardDescription>Your complete CTC breakdown across all revisions</CardDescription>
                </CardHeader>
                <CardContent>
                  {compLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                  ) : compensationHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <IndianRupee className="mx-auto h-12 w-12 text-muted-foreground/40" />
                      <p className="mt-3 text-muted-foreground">No compensation records found</p>
                      <p className="text-xs text-muted-foreground mt-1">Contact HR if you believe this is an error</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {compensationHistory.map((rev) => {
                        const isExpanded = expandedRevision === rev.id;
                        const earnings = rev.compensation_components
                          .filter(c => c.component_type === "earning")
                          .sort((a, b) => a.display_order - b.display_order);
                        const deductions = rev.compensation_components
                          .filter(c => c.component_type === "deduction")
                          .sort((a, b) => a.display_order - b.display_order);
                        const totalEarnings = earnings.reduce((s, c) => s + c.annual_amount, 0);
                        const totalDeductions = deductions.reduce((s, c) => s + c.annual_amount, 0);

                        return (
                          <div key={rev.id} className="rounded-xl border border-border/50 overflow-hidden">
                            {/* Revision Header - clickable */}
                            <button
                              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
                              onClick={() => setExpandedRevision(isExpanded ? null : rev.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`h-3 w-3 rounded-full ${rev.is_active ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">₹{rev.annual_ctc.toLocaleString("en-IN")}</span>
                                    <Badge variant="outline" className="text-[10px] h-5">
                                      Rev #{rev.revision_number}
                                    </Badge>
                                    {rev.is_active && (
                                      <Badge variant="outline" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/30">
                                        Current
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {new Date(rev.effective_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                    {rev.effective_to && ` — ${new Date(rev.effective_to).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                                    {rev.revision_reason && ` • ${rev.revision_reason}`}
                                  </p>
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </button>

                            {/* Expanded CTC Breakdown */}
                            {isExpanded && (
                              <div className="border-t border-border/50 p-4 bg-muted/10">
                                {rev.compensation_components.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-4">No component breakdown available</p>
                                ) : (
                                  <div className="grid md:grid-cols-2 gap-6">
                                    {/* Earnings */}
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Earnings</p>
                                      <div className="space-y-1.5">
                                        {earnings.map((c) => (
                                          <div key={c.id || c.component_name} className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">{c.component_name}</span>
                                            <div className="text-right">
                                              <span className="font-medium">₹{c.annual_amount.toLocaleString("en-IN")}</span>
                                              <span className="text-xs text-muted-foreground ml-1">/yr</span>
                                            </div>
                                          </div>
                                        ))}
                                        <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-border/50">
                                          <span>Total Earnings</span>
                                          <span>₹{totalEarnings.toLocaleString("en-IN")}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Deductions */}
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Deductions</p>
                                      <div className="space-y-1.5">
                                        {deductions.map((c) => (
                                          <div key={c.id || c.component_name} className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">{c.component_name}</span>
                                            <div className="text-right">
                                              <span className="font-medium text-destructive">₹{c.annual_amount.toLocaleString("en-IN")}</span>
                                              <span className="text-xs text-muted-foreground ml-1">/yr</span>
                                            </div>
                                          </div>
                                        ))}
                                        {deductions.length > 0 && (
                                          <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-border/50">
                                            <span>Total Deductions</span>
                                            <span className="text-destructive">₹{totalDeductions.toLocaleString("en-IN")}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Net & Monthly */}
                                <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Take-home (approx.)</p>
                                    <p className="font-bold text-lg">₹{(rev.annual_ctc - (deductions.reduce((s, c) => s + c.annual_amount, 0))).toLocaleString("en-IN")} <span className="text-xs font-normal text-muted-foreground">/yr</span></p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Monthly</p>
                                    <p className="font-semibold">₹{Math.round((rev.annual_ctc - totalDeductions) / 12).toLocaleString("en-IN")}</p>
                                  </div>
                                </div>

                                {rev.notes && (
                                  <p className="text-xs text-muted-foreground mt-2 italic">Notes: {rev.notes}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="disputes">
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-gradient-primary">My Disputes</CardTitle>
                  <CardDescription>Track your payslip disputes and their approval status</CardDescription>
                </CardHeader>
                <CardContent>
                  {myDisputes.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground" />
                      <p className="mt-3 text-muted-foreground">No disputes raised yet</p>
                      <p className="text-xs text-muted-foreground mt-1">You can raise a dispute from your payslip (processed payslips within last 3 months)</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myDisputes.map((d) => {
                        const st = disputeStatusStyles[d.status] || { label: d.status, className: "", icon: Clock };
                        const Icon = st.icon;
                        return (
                          <Card key={d.id} className="border-border/50">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">{periodLabel(d.pay_period)}</span>
                                    <Badge variant="outline" className={`text-xs ${st.className}`}>
                                      <Icon className="h-3 w-3 mr-1" />
                                      {st.label}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {DISPUTE_CATEGORIES.find((c) => c.value === d.dispute_category)?.label || d.dispute_category}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">{d.description}</p>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Raised on {new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  </p>

                                  {/* Show review trail */}
                                  <div className="mt-3 space-y-1">
                                    {d.manager_notes && (
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-medium">Manager:</span> {d.manager_notes}
                                      </p>
                                    )}
                                    {d.hr_notes && (
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-medium">HR:</span> {d.hr_notes}
                                      </p>
                                    )}
                                    {d.finance_notes && (
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-medium">Finance:</span> {d.finance_notes}
                                      </p>
                                    )}
                                    {d.resolution_notes && d.status !== "pending_manager" && (
                                      <p className={`text-xs font-medium mt-1 ${d.status === "approved" ? "text-green-600" : "text-red-600"}`}>
                                        Resolution: {d.resolution_notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      <PaySlipDialog
        record={paySlipRecord}
        open={!!paySlipRecord}
        onOpenChange={(open) => !open && setPaySlipRecord(null)}
      />

      {/* Raise Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Raise Payslip Dispute
            </DialogTitle>
          </DialogHeader>
          {disputeRecord && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/30 p-3 text-sm">
                <p className="font-medium">{periodLabel(disputeRecord.pay_period)}</p>
                <p className="text-muted-foreground">Net Pay: {formatCurrency(Number(disputeRecord.net_pay))}</p>
              </div>

              <div className="grid gap-2">
                <Label>Dispute Category *</Label>
                <Select value={disputeCategory} onValueChange={setDisputeCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISPUTE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Description *</Label>
                <Textarea
                  placeholder="Describe the issue with your payslip in detail..."
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Your dispute will be reviewed by your Manager → HR → Finance in sequence.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRaiseDispute}
              disabled={raiseDispute.isPending || !disputeDescription.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {raiseDispute.isPending ? "Submitting..." : "Raise Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
