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
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard, RefreshCw, Clock, CheckCircle2, XCircle,
  AlertCircle, Play, Zap, ChevronRight, Calendar,
  Activity, CheckCircle, Mail, MessageCircle, Send,
  Eye, Bug, Info, Bell,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useCurrentRole } from "@/hooks/useRoles";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { MessageDebugPanel } from "@/components/financial/MessageDebugPanel";

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
  total_amount: number;
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
  running: "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-700 border-red-200 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Play className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
  cancelled: <AlertCircle className="h-3 w-3" />,
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  acknowledged: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  paid: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  sent: "bg-amber-500/15 text-amber-700 border-amber-200",
  pending: "bg-amber-500/15 text-amber-700 border-amber-200",
  draft: "bg-muted text-muted-foreground",
  overdue: "bg-red-500/15 text-red-700 border-red-200",
  dispute: "bg-red-500/15 text-red-700 border-red-200",
  cancelled: "bg-muted text-muted-foreground",
};

function urgencyClass(createdAt: string, status: string): string {
  if (status === "completed" || status === "cancelled") return "";
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days > 3) return "border-l-4 border-l-red-500";
  if (days > 1) return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-emerald-500";
}

function stepLabel(eventType: string): string {
  const labels: Record<string, string> = {
    run_created: "Workflow started",
    run_completed: "Workflow completed",
    run_failed: "Workflow failed",
    step_delay_executed: "Delay step executed",
    step_condition_executed: "Condition evaluated",
    step_action_executed: "Action executed",
    condition_false_stopped: "Stopped (condition not met)",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ");
}

function channelIcon(channel: string | null) {
  if (channel === "whatsapp") return <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />;
  if (channel === "email") return <Mail className="h-3.5 w-3.5 text-blue-600" />;
  return null;
}

function messageStatusBadge(status: string | null) {
  if (!status) return null;
  const styles: Record<string, string> = {
    sent: "bg-blue-500/10 text-blue-700 border-blue-200",
    delivered: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    read: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
    failed: "bg-red-500/10 text-red-700 border-red-200",
  };
  return (
    <Badge variant="outline" className={`text-[10px] py-0 h-4 ${styles[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

// ─── Run Detail Dialog ────────────────────────────────────────────────────────

function RunDetailDialog({
  run,
  invoice,
  onClose,
}: {
  run: WorkflowRun | null;
  invoice?: InvoiceInfo;
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
          {/* Invoice info */}
          {invoice && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{invoice.invoice_number}</span>
                <Badge variant="outline" className={INVOICE_STATUS_STYLES[invoice.status] ?? ""}>
                  {invoice.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
              {invoice.total_amount != null && (
                <p className="text-sm font-medium">₹{invoice.total_amount.toLocaleString()}</p>
              )}
            </div>
          )}

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

          {/* Visual Timeline */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Workflow Timeline
            </p>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                <Clock className="h-5 w-5 mx-auto mb-2 opacity-40" />
                No events recorded yet.
              </div>
            ) : (
              <div className="relative pl-6">
                {/* Vertical connector line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-3">
                  {events.map((ev, idx) => {
                    const isLast = idx === events.length - 1;
                    const isCompleted = ev.event_type === "run_completed";
                    const isFailed = ev.event_type === "run_failed" || ev.event_type === "condition_false_stopped";
                    return (
                      <div key={ev.id} className="relative flex items-start gap-3 text-sm">
                        <div className={`absolute -left-6 w-4 h-4 rounded-full border-2 flex items-center justify-center
                          ${isCompleted ? "bg-emerald-500 border-emerald-500" : 
                            isFailed ? "bg-red-500 border-red-500" :
                            isLast ? "bg-primary border-primary animate-pulse" : 
                            "bg-background border-muted-foreground/40"}`}>
                          {isCompleted && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                          {isFailed && <XCircle className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="font-medium">{stepLabel(ev.event_type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(ev.created_at), "dd MMM HH:mm")} · {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const organizationId = orgData?.organizationId;

  // Fetch workflow runs
  const { data: runs = [], isLoading, refetch } = useQuery({
    queryKey: ["workflow-runs", organizationId],
    enabled: !!organizationId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("workflow_runs")
        .select("*, workflows(name, trigger_event)")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WorkflowRun[];
    },
  });

  // Fetch invoice data
  const invoiceIds = [...new Set(runs.filter((r) => r.entity_type === "invoice").map((r) => r.entity_id))];
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-for-runs", invoiceIds.join(",")],
    enabled: invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, client_name, total_amount, status, created_at")
        .in("id", invoiceIds);
      if (error) throw error;
      return (data ?? []) as InvoiceInfo[];
    },
  });

  const invoiceMap = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));

  // Fetch message enrichment
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

  // Trigger engine
  const triggerEngine = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("workflow-engine");
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      toast({ title: "Engine executed", description: `${data?.processed ?? 0} run(s) processed` });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Engine error", description: err.message, variant: "destructive" });
    },
  });

  // Send manual reminder
  const sendReminder = useMutation({
    mutationFn: async ({ invoiceId, channel }: { invoiceId: string; channel: string }) => {
      const res = await supabase.functions.invoke("messaging-service", {
        body: {
          organization_id: organizationId,
          entity_type: "invoice",
          entity_id: invoiceId,
          channel,
          template: "reminder_1",
        },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (_, vars) => {
      toast({ title: `Reminder sent via ${vars.channel}`, description: "Message queued for delivery." });
      queryClient.invalidateQueries({ queryKey: ["message-enrichment"] });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  // Mark acknowledged
  const markAcknowledged = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "acknowledged" })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invoice marked acknowledged" });
      queryClient.invalidateQueries({ queryKey: ["invoices-for-runs"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (currentRole && !["admin", "finance"].includes(currentRole)) {
    return (
      <MainLayout title="Automation Dashboard">
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
          <AlertCircle className="h-10 w-10" />
          <p className="text-lg font-medium">Finance access required</p>
        </div>
      </MainLayout>
    );
  }

  // Stats
  const running = runs.filter((r) => r.status === "running").length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const noResponse = runs.filter((r) => r.status === "running" && differenceInDays(new Date(), new Date(r.created_at)) > 3).length;

  return (
    <MainLayout title="Automation Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Automation Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Track invoice workflows, messaging, and follow-up automation
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className="gap-2"
            >
              <Bug className="h-4 w-4" /> {showDebug ? "Hide" : "Show"} Debug
            </Button>
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total Runs" value={String(runs.length)} icon={<Activity className="h-4 w-4" />} />
          <StatCard title="Active" value={String(running)} icon={<Play className="h-4 w-4" />} />
          <StatCard title="Completed" value={String(completed)} icon={<CheckCircle className="h-4 w-4" />} />
          <StatCard title="Failed" value={String(failed)} icon={<AlertCircle className="h-4 w-4" />} />
          <StatCard title="No Response >3d" value={String(noResponse)} icon={<Bell className="h-4 w-4" />} />
        </div>

        {/* Active workflow runs table */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Invoice Workflow Tracker</h2>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs">
                  Shows all invoices under active workflows. Red border = no response for 3+ days.
                  Yellow = pending. Green = recently contacted.
                </TooltipContent>
              </Tooltip>
            </div>
            <Badge variant="secondary">{runs.length} total</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Invoice Status
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">
                          Acknowledged = client confirmed receipt. Pending = awaiting response.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>Last Message</TableHead>
                  <TableHead>Last Contacted</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Workflow Step
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">
                          Current step in the automation flow. Each step can be a delay, condition check, or action.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Zap className="h-8 w-8 opacity-30" />
                        <div>
                          <p className="font-medium">No active workflows yet</p>
                          <p className="text-sm">Send an invoice to trigger a workflow automatically.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.map((run) => {
                    const inv = invoiceMap[run.entity_id];
                    const enrich = enrichmentMap[run.entity_id];
                    return (
                      <TableRow key={run.id} className={urgencyClass(run.created_at, run.status)}>
                        <TableCell className="font-mono text-sm font-medium">
                          {inv?.invoice_number ?? run.entity_id.slice(0, 8) + "…"}
                        </TableCell>
                        <TableCell className="text-sm">{inv?.client_name ?? "—"}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {inv?.total_amount != null ? `₹${inv.total_amount.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${INVOICE_STATUS_STYLES[inv?.status ?? ""] ?? ""}`}>
                            {inv?.status ?? run.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {enrich?.last_message_at ? (
                            <div className="flex items-center gap-1.5">
                              {channelIcon(enrich.last_message_channel)}
                              {messageStatusBadge(enrich.last_message_status)}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No messages</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {enrich?.last_contacted_at
                            ? formatDistanceToNow(new Date(enrich.last_contacted_at), { addSuffix: true })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Badge className={`text-xs gap-1 ${STATUS_STYLES[run.status]}`}>
                              {STATUS_ICONS[run.status]} Step {run.current_step + 1}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {run.next_run_at && run.status === "running" ? (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDistanceToNow(new Date(run.next_run_at), { addSuffix: true })}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {run.status === "running" && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => sendReminder.mutate({ invoiceId: run.entity_id, channel: "email" })}
                                      disabled={sendReminder.isPending}
                                    >
                                      <Mail className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Send Email Reminder</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => sendReminder.mutate({ invoiceId: run.entity_id, channel: "whatsapp" })}
                                      disabled={sendReminder.isPending}
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Send WhatsApp Reminder</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => markAcknowledged.mutate(run.entity_id)}
                                      disabled={markAcknowledged.isPending}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Mark Acknowledged</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setSelectedRun(run)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View Details</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && organizationId && (
          <MessageDebugPanel organizationId={organizationId} />
        )}
      </div>

      <RunDetailDialog
        run={selectedRun}
        invoice={selectedRun ? invoiceMap[selectedRun.entity_id] : undefined}
        onClose={() => setSelectedRun(null)}
      />
    </MainLayout>
  );
}
