import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutDashboard, RefreshCw, Clock, CheckCircle2, XCircle,
  AlertCircle, Play, Zap, ChevronRight, Calendar,
  Activity, CheckCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useCurrentRole } from "@/hooks/useRoles";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowRun {
  id: string;
  workflow_id: string;
  entity_type: string;
  entity_id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  current_step: number;
  next_run_at: string | null;
  created_at: string;
  workflows?: { name: string; trigger_event: string };
}

interface WorkflowEvent {
  id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
}

interface InvoiceInfo {
  id: string;
  invoice_number: string;
  client_name: string;
  status: string;
  created_at: string;
  sent_at?: string;
}

interface MessageEnrichment {
  invoice_id: string;
  last_message_channel: string | null;
  last_message_status: string | null;
  last_message_at: string | null;
  last_contacted_at: string | null;
  total_messages_sent: number;
  total_replies: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-700 border-blue-200",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  failed: "bg-red-500/15 text-red-700 border-red-200",
  cancelled: "bg-gray-500/15 text-gray-600 border-gray-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Play className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
  cancelled: <AlertCircle className="h-3 w-3" />,
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function stepLabel(eventType: string): string {
  const labels: Record<string, string> = {
    run_created: "Workflow started",
    run_completed: "Workflow completed",
    run_failed: "Workflow failed",
    step_delay_executed: "Delay step",
    step_condition_executed: "Condition check",
    step_action_executed: "Action executed",
    condition_false_stopped: "Stopped (condition not met)",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ");
}

// ─── Run Detail Dialog ────────────────────────────────────────────────────────

function RunDetailDialog({
  run,
  onClose,
}: {
  run: WorkflowRun | null;
  onClose: () => void;
}) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["workflow-events", run?.id],
    enabled: !!run,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("workflow_events")
        .select("*")
        .eq("workflow_run_id", run!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkflowEvent[];
    },
  });

  if (!run) return null;

  return (
    <Dialog open={!!run} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Workflow Run Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Workflow</p>
              <p className="font-medium">{run.workflows?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge className={`text-xs gap-1 ${STATUS_STYLES[run.status]}`}>
                {STATUS_ICONS[run.status]} {run.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entity</p>
              <p className="font-medium font-mono text-xs">{run.entity_id.slice(0, 12)}…</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Step</p>
              <p className="font-medium">{run.current_step + 1}</p>
            </div>
            {run.next_run_at && (
              <div>
                <p className="text-xs text-muted-foreground">Next Action</p>
                <p className="font-medium text-xs">
                  {format(new Date(run.next_run_at), "dd MMM yyyy HH:mm")}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="font-medium text-xs">
                {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Event timeline */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Event History
            </p>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 text-sm"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{stepLabel(ev.event_type)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AutomationDashboard() {
  const { data: orgData } = useUserOrganization();
  const { data: currentRole } = useCurrentRole();
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);

  const organizationId = orgData?.organizationId;

  // Fetch workflow runs with workflow name + invoice info
  const { data: runs = [], isLoading, refetch } = useQuery({
    queryKey: ["workflow-runs", organizationId],
    enabled: !!organizationId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select("*, workflows(name, trigger_event)")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WorkflowRun[];
    },
  });

  // Fetch invoice data for entity_id resolution
  const invoiceIds = [...new Set(runs.filter((r) => r.entity_type === "invoice").map((r) => r.entity_id))];
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-for-runs", invoiceIds.join(",")],
    enabled: invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, client_name, status, created_at")
        .in("id", invoiceIds);
      if (error) throw error;
      return (data ?? []) as InvoiceInfo[];
    },
  });

  const invoiceMap = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));

  // Fetch message enrichment data for all invoice entities in view
  const { data: enrichmentList = [] } = useQuery({
    queryKey: ["message-enrichment", organizationId, invoiceIds.join(",")],
    enabled: !!organizationId && invoiceIds.length > 0,
    queryFn: async () => {
      const res = await supabase.functions.invoke("invoice-dashboard-enrichment", {
        body: { organization_id: organizationId, invoice_ids: invoiceIds },
      });
      return (res.data ?? []) as MessageEnrichment[];
    },
  });

  const enrichmentMap = Object.fromEntries(
    enrichmentList.map((e) => [e.invoice_id, e])
  );

  // Manually trigger engine run
  const triggerEngine = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("workflow-engine");
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      toast({ title: `Engine ran: ${data?.processed ?? 0} run(s) processed` });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Engine error", description: err.message, variant: "destructive" });
    },
  });

  if (currentRole && !["admin", "finance"].includes(currentRole)) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
          <AlertCircle className="h-10 w-10" />
          <p className="text-lg font-medium">Finance access required</p>
        </div>
      </MainLayout>
    );
  }

  // Stat counts
  const running = runs.filter((r) => r.status === "running").length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const total = runs.length;

  // Active runs (running only)
  const activeRuns = runs.filter((r) => r.status === "running");

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Automation Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Monitor active invoice workflows and automation runs
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => triggerEngine.mutate()}
              disabled={triggerEngine.isPending}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {triggerEngine.isPending ? "Running…" : "Run Engine"}
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Runs" value={String(total)} icon={<Activity className="h-4 w-4" />} />
          <StatCard title="Active" value={String(running)} icon={<Play className="h-4 w-4" />} />
          <StatCard title="Completed" value={String(completed)} icon={<CheckCircle className="h-4 w-4" />} />
          <StatCard title="Failed" value={String(failed)} icon={<AlertCircle className="h-4 w-4" />} />
        </div>

        {/* Active workflow runs table */}
        <div className="rounded-xl border bg-card">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Active Invoice Workflows</h2>
            <Badge variant="secondary">{activeRuns.length} running</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Days Since Sent</TableHead>
                <TableHead>Last Message</TableHead>
                <TableHead>Msgs Sent / Replies</TableHead>
                <TableHead>Workflow Step</TableHead>
                <TableHead>Next Action</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : activeRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No active workflow runs. Send an invoice to start a workflow.
                  </TableCell>
                </TableRow>
              ) : (
                activeRuns.map((run) => {
                  const inv = invoiceMap[run.entity_id];
                  const enrich = enrichmentMap[run.entity_id];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {inv?.invoice_number ?? run.entity_id.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell>{inv?.client_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs gap-1 ${STATUS_STYLES[run.status] ?? ""}`}>
                          {STATUS_ICONS[run.status]} {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {daysSince(run.created_at)} days
                        </div>
                      </TableCell>
                      <TableCell>
                        {enrich?.last_message_at ? (
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs py-0 h-4">
                                {enrich.last_message_channel ?? "—"}
                              </Badge>
                              <span className="text-muted-foreground">{enrich.last_message_status ?? "—"}</span>
                            </div>
                            <div className="text-muted-foreground">
                              {formatDistanceToNow(new Date(enrich.last_message_at), { addSuffix: true })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No messages</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {enrich
                          ? `${enrich.total_messages_sent} / ${enrich.total_replies}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Zap className="h-3.5 w-3.5" /> Step {run.current_step + 1}
                        </div>
                      </TableCell>
                      <TableCell>
                        {run.next_run_at ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatDistanceToNow(new Date(run.next_run_at), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setSelectedRun(run)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* All runs history */}
        {runs.length > 0 && (
          <div className="rounded-xl border bg-card">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold">All Runs History</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const inv = invoiceMap[run.entity_id];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium text-sm">
                        {run.workflows?.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {inv?.invoice_number ?? run.entity_id.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs gap-1 ${STATUS_STYLES[run.status] ?? ""}`}>
                          {STATUS_ICONS[run.status]} {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.current_step + 1}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setSelectedRun(run)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <RunDetailDialog run={selectedRun} onClose={() => setSelectedRun(null)} />
    </MainLayout>
  );
}
