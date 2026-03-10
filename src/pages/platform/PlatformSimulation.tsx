import { useState, useEffect, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, Play, RotateCcw, Zap, AlertTriangle, Shield,
  Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight,
  FileText, Activity, Bug, Download, Info, Terminal, Award, BookOpen,
  ShieldCheck, Scale, Lock, BarChart3, Users, TrendingUp, Layers
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──
interface SimulationRun {
  id: string;
  sandbox_org_id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  seed_summary: Record<string, number>;
  workflows_executed: number;
  workflows_passed: number;
  workflows_failed: number;
  workflow_details: any[];
  stress_test_results: any;
  chaos_test_results: any;
  validation_passed: boolean | null;
  validation_details: any[];
  concurrent_users_simulated: number;
  total_records_created: number;
  total_execution_time_ms: number;
  errors: any[];
  report_json: any;
  report_html: string | null;
}

// ── Standards & Compliance Metadata ──
const COMPLIANCE_STANDARDS = [
  {
    code: "ISA",
    name: "International Standards on Auditing",
    body: "IFAC / IAASB",
    icon: Scale,
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    tests: [
      { id: "ISA_A1", name: "Existence – Posted JE Validation", assertion: "ISA 500 / ISA 315" },
      { id: "ISA_A2", name: "Completeness – Invoice↔JE Matching", assertion: "ISA 500" },
      { id: "ISA_A3", name: "Cut-off – Period Boundary Enforcement", assertion: "ISA 500" },
      { id: "ISA_A4", name: "Valuation – Asset Book Value Accuracy", assertion: "ISA 540" },
      { id: "ISA_A5", name: "Accuracy – Trial Balance Equilibrium", assertion: "ISA 500" },
      { id: "ISA_A6", name: "Classification – GL Account Type Enforcement", assertion: "ISA 500" },
    ],
  },
  {
    code: "COSO",
    name: "Committee of Sponsoring Organizations",
    body: "COSO / Treadway Commission",
    icon: ShieldCheck,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    tests: [
      { id: "COSO_CE1", name: "Control Environment – Segregation of Duties", assertion: "Principle 3" },
      { id: "COSO_RA1", name: "Risk Assessment – Anomaly Detection", assertion: "Principle 7" },
      { id: "COSO_CA1", name: "Control Activities – Approval Workflows", assertion: "Principle 10" },
      { id: "COSO_IC1", name: "Information & Communication – Audit Trail", assertion: "Principle 13" },
      { id: "COSO_MA1", name: "Monitoring – Continuous Integrity Checks", assertion: "Principle 16" },
    ],
  },
  {
    code: "SOX",
    name: "Sarbanes-Oxley Act / ITGC",
    body: "PCAOB / ISACA",
    icon: Lock,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    tests: [
      { id: "SOX_S1", name: "Balance Sheet Equation Validation", assertion: "SOX §302/404" },
      { id: "SOX_S3", name: "P&L Report-to-Ledger Tie-out", assertion: "SOX §404" },
      { id: "SOX_S5", name: "HR/Payroll Audit Trail Coverage", assertion: "ITGC" },
      { id: "SOX_S7", name: "Subledger-to-GL Reconciliation (AR/AP)", assertion: "SOX §404" },
    ],
  },
  {
    code: "SOC 1",
    name: "Service Organization Controls",
    body: "AICPA",
    icon: Award,
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    tests: [
      { id: "SOC_T1", name: "Transaction Authorization – Role-based CRUD", assertion: "CC6.1" },
      { id: "SOC_T3", name: "Auto-JE Generation on Approval", assertion: "CC7.1" },
      { id: "SOC_T5", name: "Period-End Accrual & Reversal Lifecycle", assertion: "CC7.2" },
      { id: "SOC_T7", name: "Data Integrity – Orphan Record Detection", assertion: "CC8.1" },
    ],
  },
  {
    code: "SA (ICAI)",
    name: "Standards on Auditing – India",
    body: "ICAI (Institute of Chartered Accountants of India)",
    icon: Scale,
    color: "text-orange-600",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    tests: [
      { id: "SA_A1", name: "SA 500 – Audit Evidence (JE Existence & Completeness)", assertion: "SA 500" },
      { id: "SA_A2", name: "SA 240 – Fraud Risk – Unusual JE Detection", assertion: "SA 240" },
      { id: "SA_A3", name: "SA 700 – Forming Opinion on Financial Statements", assertion: "SA 700" },
      { id: "SA_A4", name: "SA 315 – Understanding Entity & Risk Assessment", assertion: "SA 315" },
      { id: "SA_A5", name: "SA 330 – Auditor Response to Assessed Risks", assertion: "SA 330" },
    ],
  },
  {
    code: "Ind AS",
    name: "Indian Accounting Standards",
    body: "MCA / NACAS (IFRS Converged)",
    icon: BookOpen,
    color: "text-teal-600",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/30",
    tests: [
      { id: "INDAS_1", name: "Ind AS 1 – Financial Statement Presentation", assertion: "Ind AS 1" },
      { id: "INDAS_16", name: "Ind AS 16 – PPE Depreciation & Book Value", assertion: "Ind AS 16" },
      { id: "INDAS_18", name: "Ind AS 115 – Revenue Recognition Cut-off", assertion: "Ind AS 115" },
      { id: "INDAS_37", name: "Ind AS 37 – Provisions & Contingent Liabilities", assertion: "Ind AS 37" },
    ],
  },
  {
    code: "Co. Act",
    name: "Companies Act, 2013 & CARO 2020",
    body: "Ministry of Corporate Affairs, India",
    icon: ShieldCheck,
    color: "text-rose-600",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    tests: [
      { id: "COACT_134", name: "§134(5)(e) – ICFR (Internal Financial Controls)", assertion: "§134 / ICFR" },
      { id: "COACT_143", name: "§143(3) – Auditor's Report Obligations", assertion: "§143(3)" },
      { id: "COACT_CARO", name: "CARO 2020 – Fixed Asset Physical Verification", assertion: "CARO Cl. 3(i)" },
      { id: "COACT_AGM", name: "§129 – Financial Statements True & Fair View", assertion: "§129" },
    ],
  },
  {
    code: "GST",
    name: "Goods & Services Tax Compliance",
    body: "CBIC / GST Council, India",
    icon: Activity,
    color: "text-indigo-600",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/30",
    tests: [
      { id: "GST_R1", name: "GSTR-1 ↔ Sales Register Reconciliation", assertion: "Rule 59" },
      { id: "GST_R3B", name: "GSTR-3B ↔ Books ITC Matching", assertion: "Rule 36(4)" },
      { id: "GST_EINV", name: "E-Invoice IRN Generation Validation", assertion: "Notfn 13/2020" },
      { id: "GST_HSN", name: "HSN Code Classification Accuracy", assertion: "Section 37" },
    ],
  },
  {
    code: "IT Act",
    name: "Income Tax Act, 1961 – TDS/TCS",
    body: "CBDT / Income Tax Department, India",
    icon: Lock,
    color: "text-cyan-600",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    tests: [
      { id: "ITA_192", name: "§192 – TDS on Salary Computation", assertion: "§192" },
      { id: "ITA_194", name: "§194C/J/H – Vendor TDS Deduction", assertion: "§194" },
      { id: "ITA_26Q", name: "Form 26Q – Quarterly TDS Return Tie-out", assertion: "Rule 31A" },
      { id: "ITA_PF", name: "PF/ESI Statutory Remittance Verification", assertion: "EPF Act §38" },
    ],
  },
  {
    code: "SCM",
    name: "Supply Chain & Operations",
    body: "Inventory, Warehouse, Procurement, Sales, Manufacturing",
    icon: Layers,
    color: "text-pink-600",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/30",
    tests: [
      { id: "NM1_ITEM_SKU", name: "Item SKU Integrity Check", assertion: "Inventory" },
      { id: "NM2_WH_BIN", name: "Warehouse ↔ Bin Location Coverage", assertion: "Warehouse" },
      { id: "NM3_PO_GRN", name: "PO → Goods Receipt Linkage", assertion: "Procurement" },
      { id: "NM4_SO_DN", name: "SO → Delivery Note Linkage", assertion: "Sales" },
      { id: "NM5_BOM", name: "BOM Component Coverage", assertion: "Manufacturing" },
      { id: "NM7_CONN", name: "Connector Health & Status", assertion: "Integrations" },
    ],
  },
];

const ALL_STANDARD_TESTS = COMPLIANCE_STANDARDS.flatMap(s =>
  s.tests.map(t => ({ ...t, standard: s.code, color: s.color, bgColor: s.bgColor }))
);

// ── Workflow Category Metadata ──
const WORKFLOW_CATEGORIES = [
  { key: "finance", label: "Finance & Accounting", icon: BarChart3, color: "text-blue-500" },
  { key: "hr", label: "HR & People", icon: Users, color: "text-emerald-500" },
  { key: "payroll", label: "Payroll & Statutory", icon: TrendingUp, color: "text-amber-500" },
  { key: "compliance", label: "Compliance & Audit", icon: ShieldCheck, color: "text-purple-500" },
  { key: "operations", label: "Operations & Stress", icon: Layers, color: "text-pink-500" },
  { key: "supply_chain", label: "Supply Chain & Ops", icon: Activity, color: "text-orange-500" },
];

function categorizeWorkflow(name: string): string {
  const n = name.toUpperCase();
  if (n.startsWith("ISA_") || n.startsWith("SOX_") || n.startsWith("SOC_") || n.startsWith("COSO_") || n.startsWith("SA_") || n.startsWith("INDAS_") || n.startsWith("COACT_") || n.startsWith("GST_") || n.startsWith("ITA_") || n.includes("AUDIT") || n.includes("COMPLIANCE")) return "compliance";
  if (n.includes("PAYROLL") || n.includes("LOP") || n.includes("CTC") || n.includes("COMPENSATION") || n.includes("TDS") || n.includes("PF_") || n.includes("ESI_") || n.includes("STATUTORY")) return "payroll";
  if (n.includes("EMPLOYEE") || n.includes("LEAVE") || n.includes("ATTENDANCE") || n.includes("HOLIDAY") || n.includes("DOCUMENT") || n.includes("HR_")) return "hr";
  if (n.includes("STRESS") || n.includes("CHAOS") || n.includes("CONCURRENT")) return "operations";
  if (n.includes("INVENTORY") || n.includes("WAREHOUSE") || n.includes("PROCUREMENT") || n.includes("SALES:") || n.includes("MANUFACTURING") || n.includes("CONNECTOR") || n.includes("BOM") || n.includes("STOCK") || n.includes("NM1") || n.includes("NM2") || n.includes("NM3") || n.includes("NM4") || n.includes("NM5") || n.includes("NM6") || n.includes("NM7") || n.includes("NM8")) return "supply_chain";
  return "finance";
}

// ── Hooks ──
function useSandboxOrgs() {
  return useQuery({
    queryKey: ["sandbox-orgs-sim"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, created_at")
        .eq("environment_type", "sandbox")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSimulationRuns(orgId: string | null) {
  return useQuery({
    queryKey: ["simulation-runs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("simulation_runs" as any)
        .select("*")
        .eq("sandbox_org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as SimulationRun[];
    },
    enabled: !!orgId,
  });
}

// ── Constants ──
const PHASE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  reset_and_seed: { label: "Reset & Seed", icon: RotateCcw },
  run_workflows: { label: "Workflow Simulation", icon: Play },
  run_stress_test: { label: "Stress Test", icon: Zap },
  run_chaos_test: { label: "Chaos Test", icon: Bug },
  run_validation: { label: "Integrity Validation", icon: Shield },
  run_full_simulation: { label: "Full Simulation", icon: FlaskConical },
};

const SIMULATION_PHASES: Record<string, { steps: string[]; durations: number[] }> = {
  reset_and_seed: {
    steps: ["Clearing existing data...", "Seeding organizations & profiles...", "Creating financial master data...", "Seeding HR & payroll records...", "Building attendance & leave data...", "Finalizing seed..."],
    durations: [3000, 8000, 10000, 8000, 5000, 2000],
  },
  run_workflows: {
    steps: ["Initializing workflow engine...", "Running finance workflows (invoices, bills, journals)...", "Running HR workflows (attendance, leaves)...", "Running payroll workflows...", "Running ISA / SA(ICAI) / Ind AS compliance checks...", "Running SOX / ICFR / Co. Act governance checks...", "Running GST & IT Act statutory checks...", "Running multi-role approval chains...", "Running performance & goal workflows...", "Aggregating results..."],
    durations: [2000, 15000, 10000, 12000, 8000, 8000, 6000, 15000, 8000, 3000],
  },
  run_stress_test: {
    steps: ["Spawning 20 concurrent users...", "Executing parallel operations...", "Measuring throughput & latency...", "Collecting results..."],
    durations: [3000, 20000, 10000, 2000],
  },
  run_chaos_test: {
    steps: ["Injecting invalid data patterns...", "Testing boundary violations...", "Verifying rejection handling...", "Scoring resilience..."],
    durations: [5000, 15000, 10000, 3000],
  },
  run_validation: {
    steps: ["Running V3 integrity checks...", "Checking trial balance & accounting equation...", "Scanning for duplicates & orphans...", "Validating RLS coverage...", "Running ISA / SA(ICAI) assertion checks...", "Running SOX/SOC / ICFR control checks...", "Running GST/IT Act statutory checks...", "Generating report..."],
    durations: [5000, 8000, 8000, 5000, 5000, 5000, 4000, 2000],
  },
  run_full_simulation: {
    steps: ["Phase 1/5 — Resetting & seeding sandbox...", "Phase 2/5 — Running 120+ workflow simulations...", "Phase 3/5 — Stress testing (20 concurrent users)...", "Phase 4/5 — Chaos testing (boundary abuse)...", "Phase 5/5 — ISA/COSO/SOX/SOC + SA(ICAI)/Ind AS/Co.Act/GST/IT Act validation..."],
    durations: [30000, 60000, 30000, 25000, 15000],
  },
};

// ── Compliance Coverage Card ──
function ComplianceCoverageCard() {
  const totalTests = ALL_STANDARD_TESTS.length;
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Standards Compliance Coverage
          </CardTitle>
          <Badge className="bg-primary/10 text-primary border-primary/30 font-mono text-xs">
            {totalTests} Canonical Tests
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Simulation engine validates against internationally recognized and Indian statutory audit and control frameworks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          {COMPLIANCE_STANDARDS.map(std => {
            const Icon = std.icon;
            return (
              <motion.div
                key={std.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border ${std.borderColor} ${std.bgColor} p-4 space-y-2.5`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4.5 w-4.5 ${std.color}`} />
                  <span className={`font-bold text-sm ${std.color}`}>{std.code}</span>
                </div>
                <p className="text-[11px] font-medium text-foreground leading-tight">{std.name}</p>
                <p className="text-[10px] text-muted-foreground">{std.body}</p>
                <Separator className="opacity-30" />
                <div className="space-y-1">
                  {std.tests.map(t => (
                    <div key={t.id} className="flex items-start gap-1.5">
                      <CheckCircle2 className={`h-3 w-3 mt-0.5 shrink-0 ${std.color}`} />
                      <div>
                        <span className="text-[10px] text-foreground leading-tight block">{t.name}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">{t.assertion}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">{std.tests.length} tests</span>
                  <Badge variant="outline" className={`text-[9px] ${std.color} ${std.borderColor}`}>
                    Implemented
                  </Badge>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Enhanced Results Card ──
function EnhancedResultsCard({ lastResult, expandedSections, toggleSection }: {
  lastResult: any;
  expandedSections: Set<string>;
  toggleSection: (s: string) => void;
}) {
  if (!lastResult) return null;

  const workflowDetails = lastResult.workflow_details ?? [];
  const validationDetails = lastResult.details ?? [];

  // Categorize workflows
  const categorizedWorkflows: Record<string, any[]> = {};
  for (const w of workflowDetails) {
    const cat = categorizeWorkflow(w.workflow || w.check || "");
    if (!categorizedWorkflows[cat]) categorizedWorkflows[cat] = [];
    categorizedWorkflows[cat].push(w);
  }

  // Extract standards-specific results from validation
  const standardsResults: Record<string, { passed: number; total: number; checks: any[] }> = {};
  for (const v of [...workflowDetails, ...validationDetails]) {
    const name = v.workflow || v.check || "";
    const match = ALL_STANDARD_TESTS.find(t => name.toUpperCase().includes(t.id));
    if (match) {
      if (!standardsResults[match.standard]) standardsResults[match.standard] = { passed: 0, total: 0, checks: [] };
      standardsResults[match.standard].total++;
      if (v.status === "passed") standardsResults[match.standard].passed++;
      standardsResults[match.standard].checks.push(v);
    }
  }

  const totalPassed = lastResult.passed ?? lastResult.workflows_passed ?? 0;
  const totalFailed = lastResult.failed ?? lastResult.workflows_failed ?? 0;
  const totalTests = totalPassed + totalFailed;
  const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Latest Simulation Result
          </CardTitle>
          {lastResult.execution_time_ms && (
            <Badge variant="outline" className="font-mono text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {(lastResult.execution_time_ms / 1000).toFixed(1)}s
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hero Metrics */}
        {lastResult.report && (
          <div className="grid gap-3 md:grid-cols-5">
            {[
              { label: "Records Created", value: lastResult.report.summary?.total_records_created ?? 0, color: "text-foreground" },
              { label: "Total Workflows", value: lastResult.report.summary?.total_workflows ?? 0, color: "text-foreground" },
              { label: "Errors", value: lastResult.report.summary?.total_errors ?? 0, color: (lastResult.report.summary?.total_errors ?? 0) > 0 ? "text-destructive" : "text-emerald-500" },
              { label: "Concurrent Users", value: lastResult.report.summary?.concurrent_users_tested ?? 0, color: "text-foreground" },
              { label: "Integrity", value: lastResult.report.summary?.validation_passed ? "✓ PASS" : "✗ FAIL", color: lastResult.report.summary?.validation_passed ? "text-emerald-500" : "text-destructive" },
            ].map((m, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-4 text-center">
                <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Pass Rate Bar */}
        {totalTests > 0 && (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Overall Pass Rate</span>
              <span className={`text-2xl font-bold ${passRate === 100 ? "text-emerald-500" : passRate >= 80 ? "text-amber-500" : "text-destructive"}`}>
                {passRate}%
              </span>
            </div>
            <Progress value={passRate} className="h-2.5" />
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{totalPassed} passed</span>
              {totalFailed > 0 && <span className="text-destructive">{totalFailed} failed</span>}
              <span>{totalTests} total</span>
            </div>
          </div>
        )}

        {/* Standards Compliance Scorecard */}
        {Object.keys(standardsResults).length > 0 && (
          <Collapsible open={expandedSections.has("standards")} onOpenChange={() => toggleSection("standards")}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer mb-2">
                <div className="flex items-center gap-2">
                  {expandedSections.has("standards") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Award className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm text-foreground">Standards Compliance Scorecard</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {COMPLIANCE_STANDARDS.map(s => {
                    const r = standardsResults[s.code];
                    if (!r) return null;
                    return (
                      <Badge key={s.code} variant="outline" className={`text-[10px] ${r.passed === r.total ? "text-emerald-600 border-emerald-500/30" : "text-amber-600 border-amber-500/30"}`}>
                        {s.code} {r.passed}/{r.total}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-4">
                {COMPLIANCE_STANDARDS.map(std => {
                  const r = standardsResults[std.code];
                  if (!r) return null;
                  const Icon = std.icon;
                  const pct = Math.round((r.passed / r.total) * 100);
                  return (
                    <div key={std.code} className={`rounded-lg border ${std.borderColor} ${std.bgColor} p-3 space-y-2`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-4 w-4 ${std.color}`} />
                          <span className={`text-xs font-bold ${std.color}`}>{std.code}</span>
                        </div>
                        <span className={`text-lg font-bold ${pct === 100 ? "text-emerald-500" : "text-amber-500"}`}>
                          {pct}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <div className="space-y-1">
                        {r.checks.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px]">
                            {c.status === "passed" ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            ) : (
                              <XCircle className="h-3 w-3 text-destructive shrink-0" />
                            )}
                            <span className="text-foreground truncate">{c.workflow || c.check}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Categorized Workflows */}
        {workflowDetails.length > 0 && (
          <Collapsible open={expandedSections.has("workflows")} onOpenChange={() => toggleSection("workflows")}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer mb-2">
                <div className="flex items-center gap-2">
                  {expandedSections.has("workflows") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium text-sm text-foreground">Workflow Details by Category</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-emerald-600">
                    {totalPassed} passed
                  </Badge>
                  {totalFailed > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {totalFailed} failed
                    </Badge>
                  )}
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
              {WORKFLOW_CATEGORIES.map(cat => {
                const items = categorizedWorkflows[cat.key];
                if (!items || items.length === 0) return null;
                const catPassed = items.filter((w: any) => w.status === "passed").length;
                const CatIcon = cat.icon;
                return (
                  <div key={cat.key} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <CatIcon className={`h-4 w-4 ${cat.color}`} />
                        <span className="text-sm font-medium text-foreground">{cat.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {catPassed}/{items.length} passed
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">Status</TableHead>
                          <TableHead>Test</TableHead>
                          <TableHead>Standard</TableHead>
                          <TableHead>Detail</TableHead>
                          <TableHead className="text-right w-[80px]">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((w: any, i: number) => {
                          const testName = w.workflow || w.check || "";
                          const stdMatch = ALL_STANDARD_TESTS.find(t => testName.toUpperCase().includes(t.id));
                          return (
                            <TableRow key={i}>
                              <TableCell>
                                {w.status === "passed" ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-foreground">{testName}</TableCell>
                              <TableCell>
                                {stdMatch ? (
                                  <Badge variant="outline" className={`text-[9px] ${stdMatch.color} border-current/30`}>
                                    {stdMatch.standard} · {stdMatch.assertion}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] text-muted-foreground">Custom</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{w.detail}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{w.duration_ms ? `${w.duration_ms}ms` : "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Stress test details */}
        {lastResult.details && lastResult.action === "run_stress_test" && (
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Concurrent Users", value: lastResult.concurrent_users, color: "text-foreground" },
              { label: "Passed", value: lastResult.passed, color: "text-emerald-500" },
              { label: "Avg Duration", value: `${lastResult.avg_duration_ms}ms`, color: "text-foreground" },
              { label: "Max Duration", value: `${lastResult.max_duration_ms}ms`, color: "text-foreground" },
            ].map((m, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-3 text-center">
                <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chaos test details */}
        {lastResult.details && lastResult.action === "run_chaos_test" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lastResult.details ?? []).map((c: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-sm font-medium text-foreground">{c.test}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        c.status === "passed" || c.status === "blocked" ? "text-emerald-600 border-emerald-500/30" :
                        c.status === "anomaly" ? "text-destructive border-destructive/30" :
                        "text-yellow-600 border-yellow-500/30"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Validation details */}
        {lastResult.details && lastResult.action === "run_validation" && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Badge
                className={lastResult.validation_passed
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : "bg-destructive/10 text-destructive border-destructive/30"}
              >
                {lastResult.validation_passed ? "ALL CHECKS PASSED" : "ISSUES DETECTED"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {lastResult.passed}/{lastResult.total_checks} passed
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Standard</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lastResult.details ?? []).map((v: any, i: number) => {
                  const stdMatch = ALL_STANDARD_TESTS.find(t => (v.check || "").toUpperCase().includes(t.id));
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs text-foreground">{v.check}</TableCell>
                      <TableCell>
                        {stdMatch ? (
                          <Badge variant="outline" className={`text-[9px] ${stdMatch.color}`}>
                            {stdMatch.standard}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Internal</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {v.status === "passed" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                         v.status === "warning" ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
                         <XCircle className="h-4 w-4 text-destructive" />}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.detail}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Seed summary */}
        {lastResult.seed_summary && lastResult.action === "reset_and_seed" && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Seeded Data</h4>
            <div className="grid gap-2 md:grid-cols-4">
              {Object.entries(lastResult.seed_summary).map(([key, val]) => (
                <div key={key} className="bg-muted/30 rounded p-3 text-center">
                  <div className="text-lg font-bold text-foreground">{val as number}</div>
                  <div className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──
export function SimulationContent() {
  return <SimulationContentInner />;
}

function SimulationContentInner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastResult, setLastResult] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["summary", "standards"]));
  const startTimeRef = useRef<number>(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: sandboxOrgs, isLoading: orgsLoading } = useSandboxOrgs();
  const { data: runs } = useSimulationRuns(selectedOrg);

  const toggleSection = (s: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const stopProgressTracking = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
  }, []);

  const startProgressTracking = useCallback((action: string) => {
    const phases = SIMULATION_PHASES[action];
    if (!phases) return;
    setCurrentStep(0);
    setCompletedSteps([]);
    setElapsedMs(0);
    startTimeRef.current = Date.now();

    let accumulated = 0;
    for (let i = 0; i < phases.durations.length - 1; i++) {
      accumulated += phases.durations[i];
      const nextStep = i + 1;
      timeoutsRef.current.push(setTimeout(() => {
        setCompletedSteps(prev => [...prev, nextStep - 1]);
        setCurrentStep(nextStep);
      }, accumulated));
    }

    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  useEffect(() => {
    return () => stopProgressTracking();
  }, [stopProgressTracking]);

  const runSimulation = useMutation({
    mutationFn: async (action: string) => {
      if (!selectedOrg) throw new Error("Select a sandbox environment first");
      setActivePhase(action);
      startProgressTracking(action);

      const { data, error } = await supabase.functions.invoke("sandbox-simulation", {
        body: { action, sandbox_org_id: selectedOrg },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, action) => {
      stopProgressTracking();
      setLastResult(data);
      setActivePhase(null);
      queryClient.invalidateQueries({ queryKey: ["simulation-runs", selectedOrg] });
      toast.success(`${PHASE_LABELS[action]?.label ?? action} completed successfully`);
    },
    onError: (err: Error) => {
      stopProgressTracking();
      setActivePhase(null);
      toast.error(err.message);
    },
  });

  const downloadReport = (run: SimulationRun) => {
    if (!run.report_html) return;
    const blob = new Blob([run.report_html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation-report-${run.id.slice(0, 8)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = (run: SimulationRun) => {
    if (!run.report_json) return;
    const blob = new Blob([JSON.stringify(run.report_json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation-report-${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isRunning = runSimulation.isPending;

  const actions = [
    { key: "reset_and_seed", label: "Reset Sandbox", icon: RotateCcw, variant: "outline" as const, desc: "Clear data & seed fresh master data" },
    { key: "run_workflows", label: "Run Workflows", icon: Play, variant: "outline" as const, desc: "Finance, HR, Payroll + ISA/SOX checks" },
    { key: "run_stress_test", label: "Stress Test", icon: Zap, variant: "outline" as const, desc: "20 concurrent users across all modules" },
    { key: "run_chaos_test", label: "Chaos Test", icon: Bug, variant: "outline" as const, desc: "Boundary abuse & invalid data" },
    { key: "run_validation", label: "Validate Integrity", icon: Shield, variant: "outline" as const, desc: "ISA/SOX/COSO/SOC compliance audit" },
    { key: "run_full_simulation", label: "Run Full Simulation", icon: FlaskConical, variant: "default" as const, desc: "Complete end-to-end all-standards simulation" },
  ];

  return (
    <>
      {/* Org Selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <Select value={selectedOrg ?? ""} onValueChange={setSelectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a sandbox environment..." />
                </SelectTrigger>
                <SelectContent>
                  {(sandboxOrgs ?? []).map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOrg && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Sandbox Isolated</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                  {ALL_STANDARD_TESTS.length} Standard Tests
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedOrg ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Select a Sandbox</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Choose a sandbox environment to run financial simulations. All operations are strictly
                isolated — production data is never affected.
              </p>
            </CardContent>
          </Card>
          {/* Show compliance coverage even before selecting sandbox */}
          <ComplianceCoverageCard />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Compliance Standards Banner */}
          <ComplianceCoverageCard />

          {/* Action Buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Simulation Controls
              </CardTitle>
              <CardDescription>
                Run individual phases or execute the complete pipeline — all tests are mapped to ISA/COSO/SOX/SOC assertions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                {actions.filter(a => a.key !== "run_full_simulation").map(a => (
                  <Button
                    key={a.key}
                    variant={a.variant}
                    className="h-auto flex-col gap-2 py-4"
                    disabled={isRunning}
                    onClick={() => runSimulation.mutate(a.key)}
                  >
                    {isRunning && activePhase === a.key ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <a.icon className="h-5 w-5" />
                    )}
                    <span className="text-xs font-medium">{a.label}</span>
                    <span className="text-[10px] opacity-70">{a.desc}</span>
                  </Button>
                ))}
              </div>
              <Button
                variant="default"
                className="w-full mt-3 h-auto flex-col gap-2 py-4 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={isRunning}
                onClick={() => runSimulation.mutate("run_full_simulation")}
              >
                {isRunning && activePhase === "run_full_simulation" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <FlaskConical className="h-6 w-6" />
                )}
                <span className="text-sm font-semibold">Run Full Simulation</span>
                <span className="text-xs opacity-70">
                  Complete end-to-end: Seed → 120+ Workflows → Stress → Chaos → ISA/SOX/COSO/SOC Validation
                </span>
              </Button>

              {/* Progress Tracker */}
              <AnimatePresence>
                {isRunning && activePhase && SIMULATION_PHASES[activePhase] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 rounded-xl border border-border bg-muted/30 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="font-semibold text-sm text-foreground">
                          {PHASE_LABELS[activePhase]?.label ?? activePhase}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs tabular-nums">
                          {(elapsedMs / 1000).toFixed(1)}s
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Step {currentStep + 1} / {SIMULATION_PHASES[activePhase].steps.length}
                        </Badge>
                      </div>
                    </div>
                    <div className="px-5 pt-3">
                      <Progress
                        value={((currentStep + 1) / SIMULATION_PHASES[activePhase].steps.length) * 100}
                        className="h-1.5"
                      />
                    </div>
                    <div className="px-5 py-3 space-y-1.5">
                      {SIMULATION_PHASES[activePhase].steps.map((step, idx) => {
                        const isCompleted = completedSteps.includes(idx);
                        const isCurrent = idx === currentStep;
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`flex items-center gap-3 py-1.5 px-3 rounded-md text-sm transition-colors ${
                              isCurrent ? "bg-primary/10 text-foreground" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/40"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                            ) : isCurrent ? (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                            ) : (
                              <div className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/20" />
                            )}
                            <span className={isCurrent ? "font-medium" : ""}>{step}</span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Enhanced Results */}
          <EnhancedResultsCard
            lastResult={lastResult}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
          />

          {/* Past Runs */}
          {(runs ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Simulation History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Workflows</TableHead>
                      <TableHead>Validation</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Reports</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runs ?? []).map(run => (
                      <TableRow key={run.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {run.started_at ? format(new Date(run.started_at), "MMM d, HH:mm") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {run.run_type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                        {(() => {
                            const isStale = run.status === "running" && run.started_at &&
                              (Date.now() - new Date(run.started_at).getTime()) > 5 * 60 * 1000;
                            const displayStatus = isStale ? "timed out" : run.status === "timed_out" ? "timed out" : run.status;
                            return (
                              <Badge
                                variant="outline"
                                className={
                                  run.status === "completed" ? "text-emerald-600 border-emerald-500/30" :
                                  (isStale || run.status === "timed_out") ? "text-amber-600 border-amber-500/30" :
                                  run.status === "running" ? "text-blue-600 border-blue-500/30" :
                                  run.status === "failed" ? "text-destructive border-destructive/30" :
                                  "text-muted-foreground"
                                }
                              >
                                {displayStatus}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {run.workflows_executed > 0 ? (
                            <span>
                              <span className="text-emerald-500">{run.workflows_passed}</span>
                              {" / "}
                              <span className={run.workflows_failed > 0 ? "text-destructive" : "text-muted-foreground"}>{run.workflows_failed}</span>
                              {" / "}
                              <span className="text-muted-foreground">{run.workflows_executed}</span>
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {run.validation_passed !== null ? (
                            run.validation_passed ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {run.total_execution_time_ms > 0
                            ? `${(run.total_execution_time_ms / 1000).toFixed(1)}s`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {run.report_html && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => downloadReport(run)}
                                title="Download HTML report"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {run.report_json && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => downloadJSON(run)}
                                title="Download JSON report"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function PlatformSimulation() {
  return (
    <MainLayout title="Sandbox System Simulation" subtitle="Enterprise-grade validation against ISA, COSO, SOX/ITGC & AICPA SOC 1 standards">
      <SimulationContent />
    </MainLayout>
  );
}
