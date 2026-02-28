import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSubledgerReconciliation, useReconcileSubledgers, useControlAccountOverrides,
  useJournalEntries, useFiscalPeriods, useCloseFiscalPeriod, useRunDepreciationBatch, useGLAccounts,
} from "@/hooks/useLedger";
import { useTrialBalance } from "@/hooks/useCanonicalViews";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, XCircle, Loader2,
  RefreshCw, Lock, Calendar, TrendingDown, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

function formatAmount(n: number): string {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function CADashboard() {
  const { data: hasAccess, isLoading: checkingRole } = useIsFinance();
  const { data: reconciliations = [], isLoading: loadingRecon } = useSubledgerReconciliation();
  const { data: overrides = [], isLoading: loadingOverrides } = useControlAccountOverrides();
  const { data: entries = [] } = useJournalEntries();
  const { data: periods = [] } = useFiscalPeriods();
  const { data: trialBalance = [] } = useTrialBalance();
  const { data: accounts = [] } = useGLAccounts();
  const reconcileMutation = useReconcileSubledgers();
  const closePeriodMutation = useCloseFiscalPeriod();
  const depreciationMutation = useRunDepreciationBatch();

  const [depnDate, setDepnDate] = useState(format(new Date(), "yyyy-MM-dd"));

  if (checkingRole) return <MainLayout title="CA Dashboard"><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin" /></div></MainLayout>;
  if (!hasAccess) return <AccessDenied message="Finance Access Required" description="You need finance or admin role." />;

  // Compute insights
  const manualEntries = entries.filter(e => e.source_type === "manual");
  const manualRatio = entries.length > 0 ? (manualEntries.length / entries.length * 100).toFixed(1) : "0";
  const backdatedEntries = entries.filter(e => {
    const entryDate = new Date(e.entry_date);
    const createdDate = new Date(e.created_at);
    const diffDays = (createdDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 7;
  });

  const tbBalanced = trialBalance.reduce((s, r) => s + r.debit, 0) === trialBalance.reduce((s, r) => s + r.credit, 0);
  const latestRecon = reconciliations.slice(0, 4);
  const unreconciledModules = latestRecon.filter(r => !r.is_reconciled);

  const openPeriods = periods.filter(p => p.status === "open");

  return (
    <MainLayout title="CA Dashboard" subtitle="Chartered Accountant oversight — controls, reconciliation & anomaly detection">
      <div className="space-y-6 animate-fade-in">
        <OnboardingBanner />

        {/* Health Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {tbBalanced ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
                <div>
                  <div className="text-sm font-semibold">{tbBalanced ? "Trial Balance OK" : "Trial Balance MISMATCH"}</div>
                  <p className="text-xs text-muted-foreground">Double-entry integrity</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {unreconciledModules.length === 0 ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
                <div>
                  <div className="text-sm font-semibold">{unreconciledModules.length === 0 ? "Sub-ledgers Reconciled" : `${unreconciledModules.length} Module(s) Unreconciled`}</div>
                  <p className="text-xs text-muted-foreground">GL ↔ Sub-ledger match</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {Number(manualRatio) > 30 ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Activity className="h-5 w-5 text-emerald-600" />}
                <div>
                  <div className="text-sm font-semibold">{manualRatio}% Manual Journals</div>
                  <p className="text-xs text-muted-foreground">{manualEntries.length} of {entries.length} entries</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {overrides.length > 0 ? <ShieldAlert className="h-5 w-5 text-amber-600" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
                <div>
                  <div className="text-sm font-semibold">{overrides.length} Control Overrides</div>
                  <p className="text-xs text-muted-foreground">Manual posts to control accounts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="reconciliation" className="space-y-4">
          <TabsList>
            <TabsTrigger value="reconciliation">Sub-ledger Reconciliation</TabsTrigger>
            <TabsTrigger value="periods">Period Close</TabsTrigger>
            <TabsTrigger value="overrides">Control Overrides</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
          </TabsList>

          {/* Reconciliation Tab */}
          <TabsContent value="reconciliation" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">GL ↔ Sub-ledger Reconciliation</h3>
              <Button onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending}>
                {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run Reconciliation
              </Button>
            </div>
            <div className="rounded-xl border bg-card">
              {loadingRecon ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : latestRecon.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No reconciliation data. Run reconciliation to check.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-right">GL Balance</TableHead>
                      <TableHead className="text-right">Sub-ledger Balance</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestRecon.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold uppercase">{r.module}</TableCell>
                        <TableCell className="text-right font-mono">{formatAmount(Number(r.gl_balance))}</TableCell>
                        <TableCell className="text-right font-mono">{formatAmount(Number(r.subledger_balance))}</TableCell>
                        <TableCell className="text-right font-mono">{formatAmount(Number(r.variance))}</TableCell>
                        <TableCell>
                          {r.is_reconciled ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"><CheckCircle className="h-3 w-3 mr-1" />Matched</Badge>
                          ) : (
                            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Mismatch</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Period Close Tab */}
          <TabsContent value="periods" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Fiscal Period Management</h3>
              <div className="flex items-center gap-2">
                <input type="date" className="h-9 rounded-md border px-3 text-sm bg-background" value={depnDate} onChange={e => setDepnDate(e.target.value)} />
                <Button variant="outline" onClick={() => depreciationMutation.mutate(depnDate)} disabled={depreciationMutation.isPending}>
                  {depreciationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
                  Run Depreciation
                </Button>
              </div>
            </div>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">{p.period_name}</TableCell>
                      <TableCell>{p.start_date}</TableCell>
                      <TableCell>{p.end_date}</TableCell>
                      <TableCell>
                        <Badge className={p.status === "open" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}>
                          {p.status === "open" ? <Calendar className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.status === "open" && (
                          <Button variant="outline" size="sm" onClick={() => closePeriodMutation.mutate(p.id)} disabled={closePeriodMutation.isPending}>
                            {closePeriodMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3 mr-1" />}
                            Close Period
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Control Overrides Tab */}
          <TabsContent value="overrides" className="space-y-4">
            <h3 className="text-lg font-semibold">Control Account Override Log</h3>
            <div className="rounded-xl border bg-card">
              {loadingOverrides ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : overrides.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No control account overrides recorded</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Override By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overrides.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell>{format(new Date(o.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                        <TableCell className="font-mono text-xs">{o.gl_accounts?.code} — {o.gl_accounts?.name}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{o.override_reason}</TableCell>
                        <TableCell className="font-mono text-xs">{o.overridden_by?.slice(0, 8)}…</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Anomalies Tab */}
          <TabsContent value="anomalies" className="space-y-4">
            <h3 className="text-lg font-semibold">Anomaly Detection</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className={backdatedEntries.length > 0 ? "border-amber-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {backdatedEntries.length > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle className="h-4 w-4 text-emerald-600" />}
                    Backdated Entries
                  </CardTitle>
                  <CardDescription className="text-xs">Entries posted &gt;7 days after their date</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{backdatedEntries.length}</div>
                </CardContent>
              </Card>

              <Card className={Number(manualRatio) > 30 ? "border-amber-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {Number(manualRatio) > 30 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle className="h-4 w-4 text-emerald-600" />}
                    High Manual Journal Ratio
                  </CardTitle>
                  <CardDescription className="text-xs">Threshold: 30%</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{manualRatio}%</div>
                </CardContent>
              </Card>

              <Card className={overrides.length > 5 ? "border-amber-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {overrides.length > 5 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle className="h-4 w-4 text-emerald-600" />}
                    Control Account Misuse
                  </CardTitle>
                  <CardDescription className="text-xs">Manual overrides to control accounts</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overrides.length}</div>
                </CardContent>
              </Card>

              <Card className={unreconciledModules.length > 0 ? "border-amber-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {unreconciledModules.length > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle className="h-4 w-4 text-emerald-600" />}
                    Sub-ledger Mismatch
                  </CardTitle>
                  <CardDescription className="text-xs">GL ↔ operational data variance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{unreconciledModules.length} modules</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
