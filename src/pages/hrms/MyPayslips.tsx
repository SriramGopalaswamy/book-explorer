import { useState } from "react";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Eye } from "lucide-react";
import { useMyPayrollRecords, type PayrollRecord } from "@/hooks/usePayroll";
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

export default function MyPayslips() {
  const [paySlipRecord, setPaySlipRecord] = useState<PayrollRecord | null>(null);
  const { data: myRecords = [], isLoading: myLoading } = useMyPayrollRecords();

  return (
    <MainLayout title="My Payslips" subtitle="View your salary details">
      <div className="space-y-6">
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
              ) : myRecords.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-3 text-muted-foreground">No payslips found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pay Period</TableHead>
                        <TableHead className="text-right">Basic</TableHead>
                        <TableHead className="text-right">Allowances</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRecords.map((r) => {
                        const totalAllow = Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances);
                        const totalDeduct = Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions);
                        return (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer hover:bg-primary/5 transition-colors"
                            onClick={() => setPaySlipRecord(r)}
                          >
                            <TableCell className="font-medium">{periodLabel(r.pay_period)}</TableCell>
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPaySlipRecord(r)}>
                                <Eye className="h-4 w-4" />
                              </Button>
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
      </div>

      <PaySlipDialog
        record={paySlipRecord}
        open={!!paySlipRecord}
        onOpenChange={(open) => !open && setPaySlipRecord(null)}
      />
    </MainLayout>
  );
}
