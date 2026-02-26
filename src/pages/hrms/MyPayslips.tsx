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
import { FileText, Eye, AlertTriangle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useMyPayrollRecords, type PayrollRecord } from "@/hooks/usePayroll";
import { useMyPayslipDisputes, useRaisePayslipDispute, DISPUTE_CATEGORIES, type PayslipDispute } from "@/hooks/usePayslipDisputes";
import { PaySlipDialog } from "@/components/payroll/PaySlipDialog";

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
  const [paySlipRecord, setPaySlipRecord] = useState<PayrollRecord | null>(null);
  const { data: myRecords = [], isLoading: myLoading } = useMyPayrollRecords();
  const { data: myDisputes = [] } = useMyPayslipDisputes();
  const raiseDispute = useRaisePayslipDispute();

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
            <TabsTrigger value="disputes" className="gap-2">
              Disputes
              {myDisputes.filter((d) => !["approved", "rejected"].includes(d.status)).length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 text-amber-600 text-xs px-1.5 py-0.5 font-semibold">
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
                            <TableHead className="text-right">Net Pay</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-28"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeRecords.map((r) => {
                            const totalAllow = Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances);
                            const totalDeduct = Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions);
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
