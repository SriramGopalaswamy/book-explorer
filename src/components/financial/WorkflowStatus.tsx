import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Zap, Play,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";

interface WorkflowStatusProps {
  invoiceId: string;
  organizationId: string;
}

interface WorkflowRun {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  current_step: number;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  workflows?: { name: string; trigger_event: string };
}

interface WorkflowEvent {
  id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-700 border-blue-200",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  failed: "bg-red-500/15 text-red-700 border-red-200",
  cancelled: "bg-gray-500/15 text-gray-500 border-gray-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Play className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
  cancelled: <AlertCircle className="h-3 w-3" />,
};

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    run_created: "Workflow started",
    run_completed: "Workflow completed",
    run_failed: "Workflow failed",
    step_delay_executed: "Delay — waiting",
    step_condition_executed: "Condition evaluated",
    step_action_executed: "Action executed",
    condition_false_stopped: "Stopped — invoice already acknowledged",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ");
}

export function WorkflowStatus({ invoiceId, organizationId }: WorkflowStatusProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Fetch workflow runs for this invoice
  const { data: runs = [], isLoading, refetch } = useQuery({
    queryKey: ["workflow-runs-invoice", invoiceId],
    enabled: !!invoiceId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select("*, workflows(name, trigger_event)")
        .eq("entity_type", "invoice")
        .eq("entity_id", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkflowRun[];
    },
  });

  // Fetch events for expanded run
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["workflow-events-run", expandedRunId],
    enabled: !!expandedRunId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_events")
        .select("*")
        .eq("workflow_run_id", expandedRunId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkflowEvent[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <Zap className="h-5 w-5 mx-auto mb-2 opacity-40" />
        No active workflows for this invoice.
        <br />
        Workflows start automatically when an invoice is sent.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" /> Workflow Status
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => refetch()}
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {runs.map((run) => (
        <div key={run.id} className="rounded-lg border bg-card overflow-hidden">
          {/* Run header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Badge className={`text-xs gap-1 shrink-0 ${STATUS_STYLES[run.status]}`}>
                {STATUS_ICONS[run.status]} {run.status}
              </Badge>
              <span className="text-sm font-medium truncate">
                {run.workflows?.name ?? "Workflow"}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="text-xs text-muted-foreground hidden sm:block">
                Step {run.current_step}
              </span>
              {expandedRunId === run.id
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {/* Run details */}
          {expandedRunId === run.id && (
            <div className="px-4 pb-4 space-y-4 border-t bg-muted/10">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Current Step</p>
                  <p className="font-medium flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-primary" /> Step {run.current_step}
                  </p>
                </div>
                {run.next_run_at && run.status === "running" && (
                  <div>
                    <p className="text-xs text-muted-foreground">Next Action</p>
                    <p className="font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      {formatDistanceToNow(new Date(run.next_run_at), { addSuffix: true })}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p className="font-medium text-xs">
                    {format(new Date(run.created_at), "dd MMM yyyy HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="font-medium text-xs">
                    {formatDistanceToNow(new Date(run.updated_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {/* Event history */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  History
                </p>
                {eventsLoading ? (
                  <div className="space-y-1.5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start gap-2.5 text-sm py-1.5"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{eventLabel(ev.event_type)}</span>
                          <span className="text-muted-foreground text-xs ml-2">
                            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
