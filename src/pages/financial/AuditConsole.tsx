import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Shield, AlertTriangle, CheckCircle2, TrendingUp, FileText, Download,
  BarChart3, Eye, RefreshCw, Lock, Sparkles, Target, Layers, Activity,
  FileSearch, Package, Clock, ArrowRight, ChevronRight, Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  useLatestComplianceRun,
  useComplianceChecks,
  useRiskThemes,
  useAiAnomalies,
  useAiSamples,
  useAiNarratives,
  useIfcAssessments,
  getCurrentFinancialYear,
} from "@/hooks/useAuditIntelligence";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function ScoreGauge({ score, label, max = 100, variant = "default" }: { score: number | null; label: string; max?: number; variant?: "default" | "risk" }) {
  const val = score ?? 0;
  const pct = Math.round((val / max) * 100);
  const color = variant === "risk"
    ? val > 60 ? "text-red-500" : val > 30 ? "text-amber-500" : "text-green-500"
    : val >= 70 ? "text-green-500" : val >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            className="text-muted/20"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            className={color}
            strokeWidth="3"
            strokeDasharray={`${pct}, 100`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold", color)}>{val}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

function RiskHeatmapCell({ area, score }: { area: string; score: number }) {
  const bg = score > 60 ? "bg-red-500/20 border-red-500/40 text-red-400"
    : score > 30 ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
    : "bg-green-500/20 border-green-500/40 text-green-400";

  return (
    <div className={cn("rounded-lg border p-3 text-center transition-all hover:scale-105", bg)}>
      <p className="text-xs font-medium uppercase tracking-wider mb-1">{area}</p>
      <p className="text-xl font-bold">{score}</p>
    </div>
  );
}

function IFCBadge({ rating }: { rating: string | null }) {
  if (!rating) return <Badge variant="outline" className="text-muted-foreground">Not Assessed</Badge>;
  const map: Record<string, string> = {
    Strong: "bg-green-500/15 text-green-400 border-green-500/30",
    Moderate: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Weak: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return <Badge variant="outline" className={map[rating] || ""}>{rating}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return <Badge variant="outline" className={cn("text-xs", map[severity] || "")}>{severity}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pass: { label: "Pass", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    fail: { label: "Fail", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    warning: { label: "Warning", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    na: { label: "N/A", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] || { label: status, cls: "" };
  return <Badge variant="outline" className={cn("text-xs", s.cls)}>{s.label}</Badge>;
}

const fmtCurrency = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── Financial Year Options ────────────────────────────────────────────────

function getFinancialYearOptions() {
  const current = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const startYear = month >= 4 ? current : current - 1;
  return Array.from({ length: 5 }, (_, i) => {
    const y = startYear - i;
    return `${y}-${(y + 1).toString().slice(-2)}`;
  });
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function AuditConsole() {
  const [selectedFY, setSelectedFY] = useState(getCurrentFinancialYear());
  const fyOptions = getFinancialYearOptions();

  const { data: latestRun, isLoading: runLoading } = useLatestComplianceRun(selectedFY);
  const runId = latestRun?.id || null;

  const { data: checks = [] } = useComplianceChecks(runId);
  const { data: themes = [] } = useRiskThemes(runId);
  const { data: anomalies = [] } = useAiAnomalies(runId);
  const { data: samples = [] } = useAiSamples(runId);
  const { data: narratives = [] } = useAiNarratives(runId);
  const { data: ifcChecks = [] } = useIfcAssessments(runId);

  const failedChecks = checks.filter(c => c.status === "fail");
  const warningChecks = checks.filter(c => c.status === "warning");
  const criticalAnomalies = anomalies.filter(a => a.risk_score >= 70);

  // Breakdown scores
  const scoreBreakdown = latestRun?.score_breakdown || {};
  const riskBreakdown = latestRun?.risk_breakdown || {};

  const heatmapAreas = [
    { area: "Revenue", score: riskBreakdown.revenue_pattern || 0 },
    { area: "GST", score: riskBreakdown.gst || 0 },
    { area: "TDS", score: riskBreakdown.tds || 0 },
    { area: "Cash", score: riskBreakdown.cash_manipulation || 0 },
    { area: "Assets", score: riskBreakdown.assets || 0 },
    { area: "Controls", score: riskBreakdown.control_override || 0 },
    { area: "Journals", score: riskBreakdown.journal || 0 },
  ];

  // Module compliance summaries
  const gstChecks = checks.filter(c => c.module === "gst");
  const tdsChecks = checks.filter(c => c.module === "tds");
  const gstPassRate = gstChecks.length > 0 ? Math.round((gstChecks.filter(c => c.status === "pass").length / gstChecks.length) * 100) : 0;
  const tdsPassRate = tdsChecks.length > 0 ? Math.round((tdsChecks.filter(c => c.status === "pass").length / tdsChecks.length) * 100) : 0;

  const hasData = !!latestRun;

  return (
    <MainLayout title="CA Audit Console" subtitle="Indian CA Audit Intelligence System (ICAIS)">
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              CA Audit Console
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Indian CA Audit Intelligence System (ICAIS) — AI-Augmented Compliance & Risk Analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedFY} onValueChange={setSelectedFY}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="FY" />
              </SelectTrigger>
              <SelectContent>
                {fyOptions.map(fy => (
                  <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled>
              <RefreshCw className="h-4 w-4 mr-1" /> Run Audit
            </Button>
          </div>
        </div>

        {!hasData ? (
          /* Empty State */
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-dashed border-2 border-primary/20">
              <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">No Audit Run for FY {selectedFY}</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Run the AI-powered compliance audit to generate risk scores, compliance checks,
                  anomaly detection, and smart sampling recommendations for this financial year.
                </p>
                <Button disabled className="mt-2">
                  <Zap className="h-4 w-4 mr-2" /> Run Full Compliance Audit
                </Button>
                <p className="text-xs text-muted-foreground">
                  AI audit engine will be enabled in Phase 2
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <Tabs defaultValue="snapshot" className="space-y-6">
            <TabsList className="bg-muted/50 flex-wrap">
              <TabsTrigger value="snapshot" className="gap-1"><Activity className="h-3.5 w-3.5" /> Snapshot</TabsTrigger>
              <TabsTrigger value="heatmap" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Risk Heatmap</TabsTrigger>
              <TabsTrigger value="themes" className="gap-1"><Layers className="h-3.5 w-3.5" /> Risk Themes</TabsTrigger>
              <TabsTrigger value="compliance" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Compliance</TabsTrigger>
              <TabsTrigger value="sampling" className="gap-1"><Target className="h-3.5 w-3.5" /> Sampling</TabsTrigger>
              <TabsTrigger value="journals" className="gap-1"><FileSearch className="h-3.5 w-3.5" /> High-Risk Journals</TabsTrigger>
              <TabsTrigger value="export" className="gap-1"><Package className="h-3.5 w-3.5" /> Auditor Pack</TabsTrigger>
            </TabsList>

            {/* SECTION 1 – Audit Snapshot */}
            <TabsContent value="snapshot">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card className="bg-card/60 border-border/50">
                  <CardContent className="pt-6 flex justify-around">
                    <ScoreGauge score={latestRun.compliance_score} label="Compliance Score" />
                    <ScoreGauge score={latestRun.ai_risk_index} label="AI Risk Index" variant="risk" />
                  </CardContent>
                </Card>

                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Financial Year</span>
                      <Badge variant="outline">{latestRun.financial_year}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">IFC Rating</span>
                      <IFCBadge rating={latestRun.ifc_rating} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Run Version</span>
                      <Badge variant="outline">v{latestRun.version}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Completed</span>
                      <span className="text-xs text-muted-foreground">
                        {latestRun.completed_at ? new Date(latestRun.completed_at).toLocaleDateString("en-IN") : "—"}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/60 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Red Flags</span>
                      <span className="font-semibold text-red-400">{failedChecks.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Warnings</span>
                      <span className="font-semibold text-amber-400">{warningChecks.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" /> Risk Themes</span>
                      <span className="font-semibold">{themes.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI Anomalies</span>
                      <span className="font-semibold">{criticalAnomalies.length} critical</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Score Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Compliance Score Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "GST Compliance", max: 25, val: scoreBreakdown.gst || 0 },
                      { label: "TDS Compliance", max: 20, val: scoreBreakdown.tds || 0 },
                      { label: "Income Tax", max: 20, val: scoreBreakdown.income_tax || 0 },
                      { label: "Internal Controls", max: 20, val: scoreBreakdown.ifc || 0 },
                      { label: "Data Integrity", max: 15, val: scoreBreakdown.data_integrity || 0 },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium">{item.val}/{item.max}</span>
                        </div>
                        <Progress value={(item.val / item.max) * 100} className="h-2" />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-card/60 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      AI Risk Index Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "Revenue Pattern Risk", max: 20, val: riskBreakdown.revenue_pattern || 0 },
                      { label: "Cash Manipulation Risk", max: 15, val: riskBreakdown.cash_manipulation || 0 },
                      { label: "GST Risk", max: 15, val: riskBreakdown.gst || 0 },
                      { label: "TDS Risk", max: 15, val: riskBreakdown.tds || 0 },
                      { label: "Journal Risk", max: 15, val: riskBreakdown.journal || 0 },
                      { label: "Control Override Risk", max: 10, val: riskBreakdown.control_override || 0 },
                      { label: "Vendor Concentration", max: 10, val: riskBreakdown.vendor_concentration || 0 },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium">{item.val}/{item.max}</span>
                        </div>
                        <Progress value={(item.val / item.max) * 100} className="h-2" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* SECTION 2 – Risk Heatmap */}
            <TabsContent value="heatmap">
              <Card className="bg-card/60 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    AI Risk Heatmap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {heatmapAreas.map(item => (
                      <RiskHeatmapCell key={item.area} area={item.area} score={item.score} />
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-6 justify-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-green-500/40" />
                      <span className="text-xs text-muted-foreground">Low (0–30)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-amber-500/40" />
                      <span className="text-xs text-muted-foreground">Medium (31–60)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-red-500/40" />
                      <span className="text-xs text-muted-foreground">High (61–100)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* SECTION 3 – Top Risk Themes */}
            <TabsContent value="themes">
              <Card className="bg-card/60 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Top AI Risk Themes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {themes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No risk themes detected for this run.</p>
                  ) : (
                    <div className="space-y-3">
                      {themes.slice(0, 10).map((theme, i) => (
                        <motion.div
                          key={theme.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{theme.theme_name}</span>
                              <Badge variant="outline" className="text-xs capitalize">{theme.impact_area}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {theme.transaction_count} transactions · {fmtCurrency(theme.impacted_value)} impacted
                            </p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className={cn("text-lg font-bold", theme.risk_score > 60 ? "text-red-400" : theme.risk_score > 30 ? "text-amber-400" : "text-green-400")}>
                                {theme.risk_score}
                              </p>
                              <p className="text-xs text-muted-foreground">Risk Score</p>
                            </div>
                            <Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* SECTION 4 – Compliance Summary */}
            <TabsContent value="compliance">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Card className="bg-card/60 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-sm">GST Compliance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <ScoreGauge score={gstPassRate} label="Match %" />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">{gstChecks.length} checks performed</p>
                        <p className="text-sm"><span className="text-green-400 font-medium">{gstChecks.filter(c => c.status === "pass").length}</span> passed</p>
                        <p className="text-sm"><span className="text-red-400 font-medium">{gstChecks.filter(c => c.status === "fail").length}</span> failed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/60 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-sm">TDS Compliance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <ScoreGauge score={tdsPassRate} label="Compliance %" />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">{tdsChecks.length} checks performed</p>
                        <p className="text-sm"><span className="text-green-400 font-medium">{tdsChecks.filter(c => c.status === "pass").length}</span> passed</p>
                        <p className="text-sm"><span className="text-red-400 font-medium">{tdsChecks.filter(c => c.status === "fail").length}</span> failed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* All Checks Table */}
              <Card className="bg-card/60 border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    All Compliance Checks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {checks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No compliance checks available.</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {checks.map(check => (
                        <div key={check.id} className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-muted/10">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize font-mono">{check.module}</Badge>
                              <span className="text-sm font-medium">{check.check_name}</span>
                            </div>
                            {check.recommendation && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">{check.recommendation}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {check.affected_count > 0 && (
                              <span className="text-xs text-muted-foreground">{check.affected_count} items</span>
                            )}
                            <SeverityBadge severity={check.severity} />
                            <StatusBadge status={check.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* SECTION 5 – Smart Sampling */}
            <TabsContent value="sampling">
              <Card className="bg-card/60 border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    AI Smart Sampling
                  </CardTitle>
                  <Button variant="outline" size="sm" disabled>
                    <Download className="h-4 w-4 mr-1" /> Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {samples.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No sampling suggestions for this run. Run audit to generate samples.</p>
                  ) : (
                    <Tabs defaultValue="high_risk">
                      <TabsList className="mb-4">
                        <TabsTrigger value="high_risk">High-Risk Weighted</TabsTrigger>
                        <TabsTrigger value="stratified">Stratified Value</TabsTrigger>
                        <TabsTrigger value="random">Random Unbiased</TabsTrigger>
                      </TabsList>
                      {["high_risk", "stratified", "random"].map(type => (
                        <TabsContent key={type} value={type}>
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {samples.filter(s => s.sample_type === type).map(sample => (
                              <div key={sample.id} className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-muted/10">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs capitalize">{sample.entity_type}</Badge>
                                    <span className="text-sm font-medium">{sample.entity_reference || sample.entity_id.slice(0, 8)}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">{sample.reason_selected}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  {sample.amount && <span className="text-sm font-medium">{fmtCurrency(sample.amount)}</span>}
                                  <Badge variant="outline" className="text-xs">Weight: {sample.risk_weight}</Badge>
                                </div>
                              </div>
                            ))}
                            {samples.filter(s => s.sample_type === type).length === 0 && (
                              <p className="text-sm text-muted-foreground text-center py-4">No samples in this category.</p>
                            )}
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* SECTION 6 – High-Risk Journals */}
            <TabsContent value="journals">
              <Card className="bg-card/60 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSearch className="h-5 w-5 text-primary" />
                    High-Risk Journal Entries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {anomalies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No high-risk journal entries flagged for this run.</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {anomalies.map((anomaly, i) => (
                        <motion.div
                          key={anomaly.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="p-4 rounded-lg border border-border/30 bg-muted/10 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{anomaly.anomaly_type.replace(/_/g, " ")}</Badge>
                              <span className={cn("text-lg font-bold", anomaly.risk_score >= 70 ? "text-red-400" : anomaly.risk_score >= 40 ? "text-amber-400" : "text-green-400")}>
                                {anomaly.risk_score}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-xs">Confidence: {anomaly.confidence_score}%</Badge>
                          </div>
                          <p className="text-sm">{anomaly.trigger_condition}</p>
                          {anomaly.deviation_pct !== null && (
                            <p className="text-xs text-muted-foreground">
                              Deviation: {anomaly.deviation_pct}% from historical mean
                              {anomaly.last_year_value !== null && ` · Last year: ${fmtCurrency(anomaly.last_year_value)}`}
                              {anomaly.current_value !== null && ` · Current: ${fmtCurrency(anomaly.current_value)}`}
                            </p>
                          )}
                          {anomaly.suggested_audit_action && (
                            <p className="text-xs text-primary/80 flex items-center gap-1">
                              <ArrowRight className="h-3 w-3" /> {anomaly.suggested_audit_action}
                            </p>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* SECTION 7 – Auditor Pack Export */}
            <TabsContent value="export">
              <Card className="bg-card/60 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    AI Auditor Pack Export
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {[
                      { icon: FileText, name: "01 Financials", desc: "P&L, Balance Sheet, Trial Balance" },
                      { icon: FileText, name: "02 Ledgers", desc: "General Ledger, Sub-ledgers" },
                      { icon: FileText, name: "03 GST", desc: "GSTR-1, GSTR-2B reconciliation" },
                      { icon: FileText, name: "04 TDS", desc: "Section-wise summary, challans" },
                      { icon: FileText, name: "05 Fixed Assets", desc: "Register, depreciation schedule" },
                      { icon: Shield, name: "06 IFC", desc: "Internal controls assessment" },
                      { icon: CheckCircle2, name: "07 Compliance Reports", desc: "All compliance check results" },
                      { icon: Clock, name: "08 Audit Logs", desc: "Complete audit trail" },
                      { icon: Sparkles, name: "09 AI Risk Insights", desc: "AI summary, anomalies, themes" },
                    ].map(item => (
                      <div key={item.name} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-muted/10">
                        <item.icon className="h-5 w-5 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button disabled className="w-full sm:w-auto">
                    <Download className="h-4 w-4 mr-2" /> Generate AI Auditor Pack — FY {selectedFY}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Pack generation with AI Risk Summary PDF will be available in Phase 2.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}
