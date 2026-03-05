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
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, Play, RotateCcw, Zap, AlertTriangle, Shield,
  Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight,
  FileText, Activity, Bug, Download, Info, Terminal
} from "lucide-react";
import { format } from "date-fns";

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

const PHASE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  reset_and_seed: { label: "Reset & Seed", icon: RotateCcw },
  run_workflows: { label: "Workflow Simulation", icon: Play },
  run_stress_test: { label: "Stress Test", icon: Zap },
  run_chaos_test: { label: "Chaos Test", icon: Bug },
  run_validation: { label: "Integrity Validation", icon: Shield },
  run_full_simulation: { label: "Full Simulation", icon: FlaskConical },
};

export default function PlatformSimulation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [lastResult, setLastResult] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["summary"]));

  const { data: sandboxOrgs, isLoading: orgsLoading } = useSandboxOrgs();
  const { data: runs } = useSimulationRuns(selectedOrg);

  const toggleSection = (s: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const runSimulation = useMutation({
    mutationFn: async (action: string) => {
      if (!selectedOrg) throw new Error("Select a sandbox environment first");
      setActivePhase(action);
      setPhaseProgress(10);

      const { data, error } = await supabase.functions.invoke("sandbox-simulation", {
        body: { action, sandbox_org_id: selectedOrg },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, action) => {
      setLastResult(data);
      setPhaseProgress(100);
      setActivePhase(null);
      queryClient.invalidateQueries({ queryKey: ["simulation-runs", selectedOrg] });
      toast.success(`${PHASE_LABELS[action]?.label ?? action} completed successfully`);
    },
    onError: (err: Error) => {
      setActivePhase(null);
      setPhaseProgress(0);
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
    { key: "run_workflows", label: "Run Workflows", icon: Play, variant: "outline" as const, desc: "Finance, HR, Payroll, Leave, Attendance" },
    { key: "run_stress_test", label: "Stress Test", icon: Zap, variant: "outline" as const, desc: "20 concurrent users across all modules" },
    { key: "run_chaos_test", label: "Chaos Test", icon: Bug, variant: "outline" as const, desc: "Invalid data across all modules" },
    { key: "run_validation", label: "Validate Integrity", icon: Shield, variant: "outline" as const, desc: "Full system integrity check" },
    { key: "run_full_simulation", label: "Run Full Simulation", icon: FlaskConical, variant: "default" as const, desc: "Complete end-to-end all-module simulation" },
  ];

  return (
    <MainLayout title="Sandbox System Simulation" subtitle="End-to-end simulation across Finance, HR, Payroll, Attendance, Leave & Performance">
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
              <Badge variant="outline" className="text-xs">
                Sandbox Isolated
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedOrg ? (
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
      ) : (
        <div className="space-y-6">
          {/* Action Buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Simulation Controls
              </CardTitle>
              <CardDescription>
                Run individual phases or execute the complete simulation pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                {actions.map(a => (
                  <Button
                    key={a.key}
                    variant={a.variant}
                    className={`h-auto flex-col gap-2 py-4 ${a.key === "run_full_simulation" ? "md:col-span-3 lg:col-span-6 bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
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

              {/* Progress */}
              {isRunning && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running: {PHASE_LABELS[activePhase ?? ""]?.label ?? activePhase}
                    </span>
                  </div>
                  <Progress value={phaseProgress} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Result Display */}
          {lastResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Latest Result
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Summary metrics for full simulation */}
                {lastResult.report && (
                  <div className="grid gap-3 md:grid-cols-5 mb-6">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {lastResult.report.summary?.total_records_created ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Records Created</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {lastResult.report.summary?.total_workflows ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Workflows</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-bold ${(lastResult.report.summary?.total_errors ?? 0) > 0 ? "text-destructive" : "text-emerald-500"}`}>
                        {lastResult.report.summary?.total_errors ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Errors</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {lastResult.report.summary?.concurrent_users_tested ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Concurrent Users</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-bold ${lastResult.report.summary?.validation_passed ? "text-emerald-500" : "text-destructive"}`}>
                        {lastResult.report.summary?.validation_passed ? "✓ PASS" : "✗ FAIL"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Integrity</div>
                    </div>
                  </div>
                )}

                {/* Workflow details */}
                {lastResult.workflow_details && (
                  <Collapsible
                    open={expandedSections.has("workflows")}
                    onOpenChange={() => toggleSection("workflows")}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer mb-2">
                        <div className="flex items-center gap-2">
                          {expandedSections.has("workflows") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="font-medium text-sm text-foreground">Workflow Details</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs text-emerald-600">
                            {lastResult.passed ?? lastResult.workflows_passed ?? 0} passed
                          </Badge>
                          {(lastResult.failed ?? lastResult.workflows_failed ?? 0) > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {lastResult.failed ?? lastResult.workflows_failed ?? 0} failed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                         <TableHeader>
                          <TableRow>
                            <TableHead>Module</TableHead>
                            <TableHead>Workflow</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Detail</TableHead>
                            <TableHead className="text-right">Duration</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(lastResult.workflow_details ?? []).map((w: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{w.module ?? "Finance"}</Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-foreground">{w.workflow}</TableCell>
                              <TableCell>
                                {w.status === "passed" ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{w.detail}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{w.duration_ms}ms</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Stress test details */}
                {lastResult.details && lastResult.action === "run_stress_test" && (
                  <div className="mt-4">
                    <div className="grid gap-3 md:grid-cols-4 mb-4">
                      <div className="bg-muted/30 rounded p-3 text-center">
                        <div className="text-lg font-bold text-foreground">{lastResult.concurrent_users}</div>
                        <div className="text-xs text-muted-foreground">Concurrent Users</div>
                      </div>
                      <div className="bg-muted/30 rounded p-3 text-center">
                        <div className="text-lg font-bold text-emerald-500">{lastResult.passed}</div>
                        <div className="text-xs text-muted-foreground">Passed</div>
                      </div>
                      <div className="bg-muted/30 rounded p-3 text-center">
                        <div className="text-lg font-bold text-foreground">{lastResult.avg_duration_ms}ms</div>
                        <div className="text-xs text-muted-foreground">Avg Duration</div>
                      </div>
                      <div className="bg-muted/30 rounded p-3 text-center">
                        <div className="text-lg font-bold text-foreground">{lastResult.max_duration_ms}ms</div>
                        <div className="text-xs text-muted-foreground">Max Duration</div>
                      </div>
                    </div>
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
                          <TableHead>Status</TableHead>
                          <TableHead>Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(lastResult.details ?? []).map((v: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs text-foreground">{v.check}</TableCell>
                            <TableCell>
                              {v.status === "passed" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                               v.status === "warning" ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
                               <XCircle className="h-4 w-4 text-destructive" />}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{v.detail}</TableCell>
                          </TableRow>
                        ))}
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

                {lastResult.execution_time_ms && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Completed in {(lastResult.execution_time_ms / 1000).toFixed(1)}s
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
                          <Badge
                            variant="outline"
                            className={
                              run.status === "completed" ? "text-emerald-600 border-emerald-500/30" :
                              run.status === "running" ? "text-blue-600 border-blue-500/30" :
                              run.status === "failed" ? "text-destructive border-destructive/30" :
                              "text-muted-foreground"
                            }
                          >
                            {run.status}
                          </Badge>
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
    </MainLayout>
  );
}
