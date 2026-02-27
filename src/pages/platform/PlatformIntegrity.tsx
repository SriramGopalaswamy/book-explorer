import { useState } from "react";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield, Play, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Clock, ChevronDown, ChevronRight, Lock, Database, FileCheck, Server,
  ShieldAlert, Wrench, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface VerificationCheck {
  id: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "PASS" | "FAIL" | "WARNING";
  detail: string;
  auto_fix_possible: boolean;
}

interface VerificationResult {
  engine_status: "OPERATIONAL" | "DEGRADED" | "BLOCKED";
  timestamp?: string;
  run_at?: string;
  org_filter: string | null;
  total_checks: number;
  checks: VerificationCheck[];
}

interface RunLogEntry {
  timestamp: Date;
  status: string;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
}

const CATEGORY_META: Record<string, { icon: React.ElementType; order: number }> = {
  "Tenant & Access Integrity": { icon: Lock, order: 0 },
  "Financial Integrity": { icon: Database, order: 1 },
  "Compliance & Audit": { icon: FileCheck, order: 2 },
  "Operational & API Safety": { icon: Server, order: 3 },
};

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const severityColor = (s: string) => {
  switch (s) {
    case "CRITICAL": return "bg-destructive/10 text-destructive border-destructive/30";
    case "HIGH": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "MEDIUM": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
    case "LOW": return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

const statusIcon = (s: string) => {
  switch (s) {
    case "PASS": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "FAIL": return <XCircle className="h-4 w-4 text-destructive" />;
    case "WARNING": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
  }
};

const engineStatusConfig = (s: string) => {
  switch (s) {
    case "OPERATIONAL": return { label: "OPERATIONAL", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 };
    case "DEGRADED": return { label: "DEGRADED", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", icon: AlertTriangle };
    case "BLOCKED": return { label: "BLOCKED", color: "bg-destructive/10 text-destructive border-destructive/30", icon: ShieldAlert };
    default: return { label: "UNKNOWN", color: "bg-muted text-muted-foreground", icon: Info };
  }
};

export default function PlatformIntegrity() {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<RunLogEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleCheck = (id: string) => {
    setExpandedChecks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runVerification = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("run_financial_verification" as any);
      console.log("Verification RPC raw response:", { data, error });
      if (error) throw error;
      if (!data) throw new Error("No data returned from verification engine");

      const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as VerificationResult;
      if (!parsed.checks || !Array.isArray(parsed.checks)) {
        throw new Error("Invalid response structure: missing checks array");
      }
      setResult(parsed);

      // Expand all categories by default
      const cats = new Set(parsed.checks.map(c => c.category));
      setExpandedCategories(cats);

      const passed = parsed.checks.filter(c => c.status === "PASS").length;
      const failed = parsed.checks.filter(c => c.status === "FAIL").length;
      const warnings = parsed.checks.filter(c => c.status === "WARNING").length;

      setRunLog(prev => [{
        timestamp: new Date(),
        status: parsed.engine_status,
        totalChecks: parsed.total_checks,
        passed, failed, warnings
      }, ...prev.slice(0, 9)]);

      if (parsed.engine_status === "OPERATIONAL") {
        toast.success("Verification complete — system operational");
      } else if (parsed.engine_status === "DEGRADED") {
        toast.warning("Verification complete — system degraded");
      } else {
        toast.error("Verification complete — system BLOCKED");
      }
    } catch (err) {
      toast.error(`Verification failed: ${(err as Error).message}`);
    }
    setRunning(false);
  };

  const checks = result?.checks ?? [];
  const passCount = checks.filter(c => c.status === "PASS").length;
  const failCount = checks.filter(c => c.status === "FAIL").length;
  const warnCount = checks.filter(c => c.status === "WARNING").length;
  const critFails = checks.filter(c => c.severity === "CRITICAL" && c.status === "FAIL").length;

  // Group by category
  const grouped = checks.reduce<Record<string, VerificationCheck[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99)
  );

  const esConfig = result ? engineStatusConfig(result.engine_status) : null;

  return (
    <PlatformLayout title="Financial System Verification" subtitle="Production-grade integrity engine v2">
      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <div className="text-center">
              {esConfig ? (
                <>
                  <div className="flex justify-center mb-2">
                    <Badge className={`text-lg px-4 py-1.5 ${esConfig.color}`}>
                      <esConfig.icon className="h-5 w-5 mr-2" />
                      {esConfig.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Deployment Readiness</p>
                </>
              ) : (
                <>
                  <div className="text-4xl font-bold text-muted-foreground">—</div>
                  <p className="text-sm text-muted-foreground mt-1">Not yet verified</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-emerald-500">{passCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-destructive">{failCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Failed</p>
            {critFails > 0 && (
              <p className="text-xs text-destructive mt-0.5">{critFails} critical</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-yellow-500">{warnCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Warnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Engine Card */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Verification Engine v2
          </CardTitle>
          <div className="flex items-center gap-3">
            {result && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(new Date(result.run_at || result.timestamp || new Date()), "yyyy-MM-dd HH:mm:ss")}
              </div>
            )}
            <Button onClick={runVerification} disabled={running} size="sm">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {running ? "Running…" : "Run Verification"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!result ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Click "Run Verification" to execute the financial system integrity engine</p>
              <p className="text-xs mt-1">4 categories · 20+ deterministic checks · read-only</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedCategories.map(cat => {
                const catChecks = grouped[cat].sort(
                  (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
                );
                const catPassed = catChecks.filter(c => c.status === "PASS").length;
                const catFailed = catChecks.filter(c => c.status === "FAIL").length;
                const CatIcon = CATEGORY_META[cat]?.icon ?? Shield;
                const isExpanded = expandedCategories.has(cat);

                return (
                  <Collapsible key={cat} open={isExpanded} onOpenChange={() => toggleCategory(cat)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <CatIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{cat}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {catFailed > 0 && (
                            <Badge variant="destructive" className="text-xs">{catFailed} fail</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {catPassed}/{catChecks.length} passed
                          </span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-1 space-y-1 pl-4">
                        {catChecks.map(check => (
                          <Collapsible
                            key={check.id}
                            open={expandedChecks.has(check.id)}
                            onOpenChange={() => toggleCheck(check.id)}
                          >
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/30 cursor-pointer transition-colors">
                                {expandedChecks.has(check.id) ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                                {statusIcon(check.status)}
                                <span className="text-sm font-mono text-muted-foreground flex-shrink-0">{check.id}</span>
                                <Badge className={`text-[10px] px-1.5 py-0 ${severityColor(check.severity)}`}>
                                  {check.severity}
                                </Badge>
                                <span className="text-sm text-foreground truncate flex-1">{check.detail.split(' | ')[0]}</span>
                                {check.auto_fix_possible && (
                                  <Wrench className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-10 mr-4 mb-2 p-3 rounded-md bg-muted/20 border border-border/50 text-sm space-y-1.5">
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground font-medium min-w-[80px]">Check ID:</span>
                                  <span className="font-mono text-foreground">{check.id}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground font-medium min-w-[80px]">Status:</span>
                                  <div className="flex items-center gap-1">{statusIcon(check.status)} <span className="text-foreground">{check.status}</span></div>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground font-medium min-w-[80px]">Severity:</span>
                                  <Badge className={`text-xs ${severityColor(check.severity)}`}>{check.severity}</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground font-medium min-w-[80px]">Detail:</span>
                                  <span className="text-foreground">{check.detail}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground font-medium min-w-[80px]">Auto-fix:</span>
                                  <span className={check.auto_fix_possible ? "text-emerald-500" : "text-muted-foreground"}>
                                    {check.auto_fix_possible ? "Available" : "Manual review required"}
                                  </span>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run Log */}
      {runLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Verification Run Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runLog.map((entry, i) => {
                const ec = engineStatusConfig(entry.status);
                return (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(entry.timestamp, "yyyy-MM-dd HH:mm:ss")}
                      </span>
                      <Badge className={`text-xs ${ec.color}`}>{ec.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-emerald-500">{entry.passed}P</span>
                      <span className="text-destructive">{entry.failed}F</span>
                      <span className="text-yellow-500">{entry.warnings}W</span>
                      <span>/ {entry.totalChecks}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </PlatformLayout>
  );
}
