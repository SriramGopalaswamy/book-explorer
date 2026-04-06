import { useEffect, useMemo, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/dashboard/StatCard";
import { MessageDebugPanel } from "@/components/financial/MessageDebugPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useCurrentRole } from "@/hooks/useRoles";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Bell,
  Bug,
  CheckCircle2,
  Eye,
  GitBranch,
  GripVertical,
  Info,
  Mail,
  MessageCircle,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";

interface WorkflowStep {
  id?: string;
  step_order: number;
  step_type: "delay" | "condition" | "action";
  config: Record<string, any>;
}

interface WorkflowDef {
  id: string;
  name: string;
  trigger_event: string;
  is_active: boolean;
  created_at: string;
  workflow_steps?: WorkflowStep[];
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  entity_type: string;
  entity_id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  current_step: number;
  next_run_at: string | null;
  created_at: string;
  updated_at?: string;
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

const NEW_WORKFLOW_ID = "__new_workflow__";

const TRIGGER_EVENTS = [
  { value: "invoice_sent", label: "Invoice Sent" },
  { value: "message_received", label: "Message Received" },
  { value: "email_received", label: "Email Received" },
  { value: "whatsapp_message_received", label: "WhatsApp Message Received" },
  { value: "invoice_acknowledged", label: "Invoice Acknowledged" },
  { value: "invoice_disputed", label: "Invoice Disputed" },
  { value: "invoice_overdue", label: "Invoice Overdue" },
  { value: "message_delivery_failed", label: "Message Delivery Failed" },
  { value: "message_delivered", label: "Message Delivered" },
  { value: "message_read", label: "Message Read" },
] as const;

const ACTION_TYPES = [
  { value: "send_message", label: "Send Message" },
  { value: "send_email", label: "Send Email" },
  { value: "update_invoice_status", label: "Update Invoice Status" },
  { value: "notify_internal", label: "Notify Internal Team" },
] as const;

const EMAIL_TEMPLATES = [
  { value: "reminder_1", label: "Reminder #1 (Friendly)" },
  { value: "reminder_2", label: "Reminder #2 (Final)" },
] as const;

const WHATSAPP_TEMPLATES = [
  { value: "invoice_reminder_1", label: "Invoice Reminder #1" },
  { value: "invoice_reminder_2", label: "Invoice Reminder #2 (Final)" },
  { value: "reminder_1", label: "Reminder #1 (Friendly)" },
  { value: "reminder_2", label: "Reminder #2 (Final)" },
] as const;

const INVOICE_STATUSES = [
  { value: "acknowledged", label: "Acknowledged" },
  { value: "escalated", label: "Escalated" },
  { value: "overdue", label: "Overdue" },
] as const;

const CONDITION_OPERATORS = [
  { value: "!=", label: "is not equal to" },
  { value: "=", label: "is equal to" },
  { value: ">", label: "is greater than" },
  { value: "<", label: "is less than" },
] as const;

const RUN_STATUS_STYLES: Record<string, string> = {
  running: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-success/10 text-success border-success/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  acknowledged: "bg-success/10 text-success border-success/20",
  paid: "bg-success/10 text-success border-success/20",
  sent: "bg-warning/10 text-warning border-warning/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  draft: "bg-muted text-muted-foreground border-border",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  dispute: "bg-destructive/10 text-destructive border-destructive/20",
  disputed: "bg-destructive/10 text-destructive border-destructive/20",
  escalated: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const MESSAGE_STATUS_STYLES: Record<string, string> = {
  sent: "bg-primary/10 text-primary border-primary/20",
  delivered: "bg-success/10 text-success border-success/20",
  read: "bg-success/10 text-success border-success/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  queued: "bg-warning/10 text-warning border-warning/20",
  pending: "bg-warning/10 text-warning border-warning/20",
};

const STEP_CARD_STYLES: Record<WorkflowStep["step_type"], string> = {
  delay: "border-primary/20 bg-primary/5",
  condition: "border-warning/20 bg-warning/5",
  action: "border-success/20 bg-success/5",
};

function normalizeSteps(steps: WorkflowStep[]) {
  return steps.map((step, index) => ({ ...step, step_order: index + 1 }));
}

function createDefaultStep(): WorkflowStep {
  return { step_order: 1, step_type: "delay", config: { duration_hours: 24 } };
}

function humanReadableSummary(trigger: string, steps: WorkflowStep[]) {
  const triggerLabel = TRIGGER_EVENTS.find((event) => event.value === trigger)?.label ?? trigger;
  const parts = [`When ${triggerLabel}`];
  normalizeSteps(steps).forEach((step) => {
    if (step.step_type === "delay") {
      parts.push(`→ wait ${step.config.duration_hours ?? 24}h`);
      return;
    }
    if (step.step_type === "condition") {
      parts.push(`→ if ${step.config.field ?? "field"} ${step.config.operator ?? "!="} \"${step.config.value ?? ""}\"`);
      return;
    }

    const actionType = step.config.action_type;
    if (actionType === "send_message") parts.push(`→ send ${step.config.channel ?? "email"} reminder`);
    else if (actionType === "send_email") parts.push("→ send email reminder");
    else if (actionType === "update_invoice_status") parts.push(`→ update invoice to ${step.config.status ?? "status"}`);
    else if (actionType === "notify_internal") parts.push("→ notify internal team");
  });
  return parts.join(" ");
}

function stepPreview(step: WorkflowStep) {
  if (step.step_type === "delay") return `Wait ${step.config.duration_hours ?? 24} hours`;
  if (step.step_type === "condition") return `If ${step.config.field ?? "field"} ${step.config.operator ?? "!="} ${step.config.value ?? "value"}`;
  const actionType = step.config.action_type;
  if (actionType === "send_message") return `Send ${step.config.channel ?? "email"} using ${step.config.template ?? "template"}`;
  if (actionType === "send_email") return `Send email using ${step.config.template ?? "template"}`;
  if (actionType === "update_invoice_status") return `Set invoice status to ${step.config.status ?? "status"}`;
  if (actionType === "notify_internal") return "Notify team";
  return "Configure action";
}

function workflowEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    run_created: "Workflow started",
    run_completed: "Workflow completed",
    run_failed: "Workflow failed",
    step_delay_executed: "Delay step executed",
    step_condition_executed: "Condition evaluated",
    step_action_executed: "Action executed",
    condition_false_stopped: "Stopped because condition failed",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ");
}

function urgencyClass(createdAt: string, status: string) {
  if (status === "completed" || status === "cancelled") return "";
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days > 3) return "border-l-4 border-l-red-500";
  if (days > 1) return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-emerald-500";
}

function channelBadge(channel: string | null) {
  if (!channel) return <span className="text-xs text-muted-foreground">No messages</span>;
  return (
    <Badge variant="outline" className={channel === "whatsapp" ? "bg-success/10 text-success border-success/20" : "bg-primary/10 text-primary border-primary/20"}>
      {channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
      {channel}
    </Badge>
  );
}

function messageStatusBadge(status: string | null) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge variant="outline" className={MESSAGE_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border"}>{status}</Badge>;
}

function BuilderStepCard({
  index,
  step,
  dragOver,
  onChange,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
}: {
  index: number;
  step: WorkflowStep;
  dragOver: boolean;
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  const updateConfig = (key: string, value: any) => onChange({ ...step, config: { ...step.config, [key]: value } });

  return (
    <div className={`rounded-2xl border p-4 transition-all ${STEP_CARD_STYLES[step.step_type]} ${dragOver ? "ring-2 ring-primary/30" : ""}`} draggable onDragStart={() => onDragStart(index)} onDragEnter={() => onDragEnter(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(index)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step {index + 1}</p>
            <p className="text-sm font-medium">{stepPreview(step)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={step.step_type} onValueChange={(value: WorkflowStep["step_type"]) => onChange({ ...step, step_type: value, config: value === "delay" ? { duration_hours: 24 } : {} })}>
            <SelectTrigger className="w-36 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delay">Delay</SelectItem>
              <SelectItem value="condition">Condition</SelectItem>
              <SelectItem value="action">Action</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {step.step_type === "delay" && (
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground">Wait</Label>
          <Input type="number" min={1} className="w-28 bg-background" value={step.config.duration_hours ?? 24} onChange={(event) => updateConfig("duration_hours", Number(event.target.value))} />
          <span className="text-sm text-muted-foreground">hours</span>
        </div>
      )}

      {step.step_type === "condition" && (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Field</Label>
            <Select value={step.config.field ?? ""} onValueChange={(value) => updateConfig("field", value)}>
              <SelectTrigger className="mt-1 bg-background"><SelectValue placeholder="Select field" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice.status">invoice.status</SelectItem>
                <SelectItem value="last_message.channel">last_message.channel</SelectItem>
                <SelectItem value="last_message.status">last_message.status</SelectItem>
                <SelectItem value="last_message.classification">last_message.classification</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Operator</Label>
            <Select value={step.config.operator ?? "!="} onValueChange={(value) => updateConfig("operator", value)}>
              <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input className="mt-1 bg-background" placeholder="acknowledged" value={step.config.value ?? ""} onChange={(event) => updateConfig("value", event.target.value)} />
          </div>
        </div>
      )}

      {step.step_type === "action" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Action Type</Label>
            <Select value={step.config.action_type ?? ""} onValueChange={(value) => onChange({ ...step, config: { action_type: value } })}>
              <SelectTrigger className="mt-1 bg-background"><SelectValue placeholder="Select action" /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((action) => <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {step.config.action_type === "send_message" && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Channel</Label>
                  <Select value={step.config.channel ?? "email"} onValueChange={(value) => updateConfig("channel", value)}>
                    <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Template</Label>
                  <Select value={step.config.template ?? (step.config.channel === "whatsapp" ? "invoice_reminder_1" : "reminder_1")} onValueChange={(value) => updateConfig("template", value)}>
                    <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(step.config.channel === "whatsapp" ? WHATSAPP_TEMPLATES : EMAIL_TEMPLATES).map((template) => <SelectItem key={template.value} value={template.value}>{template.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Recipient</Label>
                <Input className="mt-1 bg-background" placeholder={step.config.channel === "whatsapp" ? "client_phone" : "client_email"} value={step.config.to ?? (step.config.channel === "whatsapp" ? "client_phone" : "client_email")} onChange={(event) => updateConfig("to", event.target.value)} />
              </div>
            </>
          )}

          {step.config.action_type === "send_email" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Template</Label>
                <Select value={step.config.template ?? "reminder_1"} onValueChange={(value) => updateConfig("template", value)}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMAIL_TEMPLATES.map((template) => <SelectItem key={template.value} value={template.value}>{template.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Recipient</Label>
                <Input className="mt-1 bg-background" placeholder="client_email" value={step.config.to ?? "client_email"} onChange={(event) => updateConfig("to", event.target.value)} />
              </div>
            </div>
          )}

          {step.config.action_type === "update_invoice_status" && (
            <div>
              <Label className="text-xs text-muted-foreground">Set Invoice Status</Label>
              <Select value={step.config.status ?? ""} onValueChange={(value) => updateConfig("status", value)}>
                <SelectTrigger className="mt-1 bg-background"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {step.config.action_type === "notify_internal" && (
            <div>
              <Label className="text-xs text-muted-foreground">Internal Message</Label>
              <Input className="mt-1 bg-background" placeholder="Invoice pending acknowledgement" value={step.config.message ?? ""} onChange={(event) => updateConfig("message", event.target.value)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunDetailDialog({ run, invoice, onClose }: { run: WorkflowRun | null; invoice?: InvoiceInfo; onClose: () => void }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["workflow-run-events", run?.id],
    enabled: !!run,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("workflow_events").select("*").eq("workflow_run_id", run!.id).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkflowEvent[];
    },
  });

  if (!run) return null;

  return (
    <Dialog open={!!run} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" />Workflow Run Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Workflow</p><p className="mt-1 text-sm font-medium">{run.workflows?.name ?? "Workflow"}</p></div>
            <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p><Badge variant="outline" className={`mt-1 ${RUN_STATUS_STYLES[run.status]}`}>{run.status}</Badge></div>
            <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current Step</p><p className="mt-1 text-sm font-medium">Step {run.current_step + 1}</p></div>
            <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Started</p><p className="mt-1 text-sm font-medium">{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</p></div>
          </div>

          {invoice && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-mono text-sm font-semibold">{invoice.invoice_number}</p><p className="text-sm text-muted-foreground">{invoice.client_name}</p></div>
                <div className="text-right"><Badge variant="outline" className={INVOICE_STATUS_STYLES[invoice.status] ?? "bg-muted text-muted-foreground border-border"}>{invoice.status}</Badge><p className="mt-1 text-sm font-medium">₹{invoice.total_amount?.toLocaleString?.() ?? "0"}</p></div>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4">
            <div className="mb-4"><p className="text-sm font-semibold">Execution Timeline</p><p className="text-xs text-muted-foreground">Backend truth for this workflow run.</p></div>

            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
            ) : events.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No workflow events have been recorded yet.</div>
            ) : (
              <div className="relative pl-6">
                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-4">
                  {events.map((event, index) => {
                    const isLast = index === events.length - 1;
                    const isFailed = event.event_type === "run_failed" || event.event_type === "condition_false_stopped";
                    const isCompleted = event.event_type === "run_completed";
                    return (
                      <div key={event.id} className="relative flex gap-3">
                        <div className={`absolute -left-6 top-1.5 h-4 w-4 rounded-full border ${isCompleted ? "border-success bg-success" : isFailed ? "border-destructive bg-destructive" : isLast ? "border-primary bg-primary" : "border-border bg-background"}`} />
                        <div className="min-w-0 flex-1 rounded-xl border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{workflowEventLabel(event.event_type)}</p><p className="text-xs text-muted-foreground">{format(new Date(event.created_at), "dd MMM HH:mm")}</p></div>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</p>
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

export default function AutomationDashboard() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const { data: currentRole } = useCurrentRole();
  const queryClient = useQueryClient();

  const organizationId = orgData?.organizationId;
  const isRefreshing = useIsFetching({ queryKey: ["workflows"] }) > 0 || useIsFetching({ queryKey: ["workflow-runs"] }) > 0;
  const canSeeDebug = !currentRole || ["finance", "admin", "superadmin"].includes(currentRole);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(NEW_WORKFLOW_ID);
  const [draftName, setDraftName] = useState("");
  const [draftTrigger, setDraftTrigger] = useState("invoice_sent");
  const [draftSteps, setDraftSteps] = useState<WorkflowStep[]>([createDefaultStep()]);
  const [draftActive, setDraftActive] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const { data: workflows = [], isLoading: workflowsLoading, error: workflowsError } = useQuery({
    queryKey: ["workflows", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("workflows").select("*, workflow_steps(*)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkflowDef[];
    },
  });

  const { data: runs = [], isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ["workflow-runs", organizationId],
    enabled: !!organizationId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("workflow_runs").select("*, workflows(name, trigger_event)").eq("organization_id", organizationId!).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as WorkflowRun[];
    },
  });

  const invoiceIds = useMemo(() => [...new Set(runs.filter((run) => run.entity_type === "invoice").map((run) => run.entity_id))], [runs]);

  const { data: invoices = [] } = useQuery({
    queryKey: ["workflow-run-invoices", invoiceIds.join(",")],
    enabled: invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id, invoice_number, client_name, total_amount, status, created_at").in("id", invoiceIds);
      if (error) throw error;
      return (data ?? []) as InvoiceInfo[];
    },
  });

  const { data: enrichmentList = [] } = useQuery({
    queryKey: ["message-enrichment", organizationId, invoiceIds.join(",")],
    enabled: !!organizationId && invoiceIds.length > 0,
    queryFn: async () => {
      const response = await supabase.functions.invoke("invoice-dashboard-enrichment", { body: { organization_id: organizationId, invoice_ids: invoiceIds } });
      if (response.error) throw response.error;
      return (response.data ?? []) as MessageEnrichment[];
    },
  });

  const workflowMap = useMemo(() => Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow])), [workflows]);
  const invoiceMap = useMemo(() => Object.fromEntries(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const enrichmentMap = useMemo(() => Object.fromEntries(enrichmentList.map((item) => [item.invoice_id, item])), [enrichmentList]);
  const runCountByWorkflow = useMemo(() => runs.reduce<Record<string, number>>((accumulator, run) => { accumulator[run.workflow_id] = (accumulator[run.workflow_id] ?? 0) + 1; return accumulator; }, {}), [runs]);

  useEffect(() => {
    if (!workflows.length) {
      setSelectedWorkflowId(NEW_WORKFLOW_ID);
      return;
    }
    const exists = selectedWorkflowId === NEW_WORKFLOW_ID || workflows.some((workflow) => workflow.id === selectedWorkflowId);
    if (!exists) setSelectedWorkflowId(workflows[0].id);
  }, [selectedWorkflowId, workflows]);

  useEffect(() => {
    if (selectedWorkflowId === NEW_WORKFLOW_ID) {
      setDraftName("");
      setDraftTrigger("invoice_sent");
      setDraftSteps([createDefaultStep()]);
      setDraftActive(true);
      return;
    }

    const workflow = workflowMap[selectedWorkflowId];
    if (!workflow) return;
    setDraftName(workflow.name);
    setDraftTrigger(workflow.trigger_event);
    setDraftSteps(normalizeSteps(workflow.workflow_steps ?? [createDefaultStep()]));
    setDraftActive(workflow.is_active);
  }, [selectedWorkflowId, workflowMap]);

  const saveWorkflow = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organization context is missing");
      if (!draftName.trim()) throw new Error("Workflow name is required");
      if (!draftSteps.length) throw new Error("Add at least one workflow step");

      const stepsPayload = normalizeSteps(draftSteps).map((step, index) => ({ workflow_id: "", step_order: index + 1, step_type: step.step_type, config: step.config }));

      if (selectedWorkflowId === NEW_WORKFLOW_ID) {
        const { data, error } = await (supabase.from as any)("workflows").insert({ organization_id: organizationId, name: draftName.trim(), trigger_event: draftTrigger, is_active: draftActive, created_by: user?.id ?? null }).select("id").single();
        if (error) throw error;
        const workflowId = data.id as string;
        const { error: stepsError } = await (supabase.from as any)("workflow_steps").insert(stepsPayload.map((step) => ({ ...step, workflow_id: workflowId })));
        if (stepsError) throw stepsError;
        return { workflowId, created: true };
      }

      const { error: workflowError } = await (supabase.from as any)("workflows").update({ name: draftName.trim(), trigger_event: draftTrigger, is_active: draftActive }).eq("id", selectedWorkflowId);
      if (workflowError) throw workflowError;
      const { error: deleteError } = await (supabase.from as any)("workflow_steps").delete().eq("workflow_id", selectedWorkflowId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await (supabase.from as any)("workflow_steps").insert(stepsPayload.map((step) => ({ ...step, workflow_id: selectedWorkflowId })));
      if (insertError) throw insertError;
      return { workflowId: selectedWorkflowId, created: false };
    },
    onSuccess: ({ workflowId, created }) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast({ title: created ? "Workflow created" : "Workflow saved", description: created ? "The workflow is ready to run from this screen." : "Your workflow configuration has been updated." });
      setSelectedWorkflowId(workflowId);
    },
    onError: (error: any) => toast({ title: "Workflow save failed", description: error.message, variant: "destructive" }),
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (workflowId: string) => {
      const { error } = await (supabase.from as any)("workflows").delete().eq("id", workflowId);
      if (error) throw error;
    },
    onSuccess: (_, workflowId) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
      toast({ title: "Workflow deleted" });
      if (selectedWorkflowId === workflowId) setSelectedWorkflowId(NEW_WORKFLOW_ID);
    },
    onError: (error: any) => toast({ title: "Delete failed", description: error.message, variant: "destructive" }),
  });

  const toggleWorkflow = useMutation({
    mutationFn: async ({ workflowId, isActive }: { workflowId: string; isActive: boolean }) => {
      const { error } = await (supabase.from as any)("workflows").update({ is_active: !isActive }).eq("id", workflowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast({ title: "Workflow status updated" });
    },
    onError: (error: any) => toast({ title: "Status update failed", description: error.message, variant: "destructive" }),
  });

  const triggerEngine = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke("workflow-engine", { body: {} });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast({ title: "Engine executed", description: `${data?.processed ?? 0} workflow run(s) processed.` });
      refetchRuns();
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-run-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["message-enrichment"] });
    },
    onError: (error: any) => toast({ title: "Engine error", description: error.message, variant: "destructive" }),
  });

  const sendReminder = useMutation({
    mutationFn: async ({ invoiceId, channel }: { invoiceId: string; channel: string }) => {
      const response = await supabase.functions.invoke("messaging-service", { body: { organization_id: organizationId, entity_type: "invoice", entity_id: invoiceId, channel, template: channel === "whatsapp" ? "invoice_reminder_1" : "reminder_1" } });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (_, variables) => {
      toast({ title: `Reminder sent via ${variables.channel}` });
      queryClient.invalidateQueries({ queryKey: ["message-enrichment"] });
    },
    onError: (error: any) => toast({ title: "Send failed", description: error.message, variant: "destructive" }),
  });

  const markAcknowledged = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.from("invoices").update({ status: "acknowledged" }).eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invoice marked acknowledged" });
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-run-invoices"] });
    },
    onError: (error: any) => toast({ title: "Status update failed", description: error.message, variant: "destructive" }),
  });

  const activeWorkflowCount = workflows.filter((workflow) => workflow.is_active).length;
  const failedCount = runs.filter((run) => run.status === "failed").length;
  const runningCount = runs.filter((run) => run.status === "running").length;
  const staleCount = runs.filter((run) => run.status === "running" && differenceInDays(new Date(), new Date(run.created_at)) > 3).length;
  const workflowMismatchCount = workflows.filter((workflow) => (workflow.workflow_steps?.length ?? 0) === 0).length;
  const invoiceMismatchCount = runs.filter((run) => run.entity_type === "invoice" && !invoiceMap[run.entity_id]).length;
  const selectedWorkflow = selectedWorkflowId === NEW_WORKFLOW_ID ? null : workflowMap[selectedWorkflowId];

  const builderWarnings = [
    workflowsError ? `Workflow builder is disconnected: ${(workflowsError as Error).message}` : null,
    runsError ? `Automation tracker is disconnected: ${(runsError as Error).message}` : null,
    workflowMismatchCount > 0 ? `${workflowMismatchCount} workflow(s) have no steps configured.` : null,
    invoiceMismatchCount > 0 ? `${invoiceMismatchCount} workflow run(s) are not linked to invoice records.` : null,
  ].filter(Boolean) as string[];

  const addStep = () => setDraftSteps((current) => normalizeSteps([...current, createDefaultStep()]));
  const updateStep = (index: number, step: WorkflowStep) => setDraftSteps((current) => current.map((item, itemIndex) => (itemIndex === index ? step : item)));
  const removeStep = (index: number) => setDraftSteps((current) => { const next = current.filter((_, itemIndex) => itemIndex !== index); return next.length ? normalizeSteps(next) : [createDefaultStep()]; });

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setDraftSteps((current) => {
      const reordered = [...current];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      return normalizeSteps(reordered);
    });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <MainLayout title="Automation Studio" subtitle="Build, monitor, and run invoice workflows from one finance workspace">
      <div className="space-y-6">
        <div className="rounded-[1.75rem] border bg-gradient-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-gradient-financial p-3 text-primary-foreground shadow-lg"><Workflow className="h-6 w-6" /></div>
              <div>
                <div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Finance only</Badge><Badge variant="outline" className="bg-muted text-muted-foreground border-border">Single workspace</Badge></div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Automation Studio</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Create workflows with drag-and-drop steps, monitor live invoice runs, and run the automation engine from the same page.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {canSeeDebug && <Button variant="outline" className="gap-2" onClick={() => setShowDebug((current) => !current)}><Bug className="h-4 w-4" />{showDebug ? "Hide Debug" : "Show Debug"}</Button>}
              <Button variant="outline" className="gap-2" disabled={isRefreshing} onClick={() => { queryClient.invalidateQueries({ queryKey: ["workflows", organizationId] }); queryClient.invalidateQueries({ queryKey: ["workflow-runs", organizationId] }); queryClient.invalidateQueries({ queryKey: ["workflow-run-invoices"] }); queryClient.invalidateQueries({ queryKey: ["message-enrichment", organizationId] }); }}><RefreshCw className={`h-4 w-4${isRefreshing ? " animate-spin" : ""}`} />Refresh</Button>
              <Button className="gap-2" onClick={() => triggerEngine.mutate()} disabled={triggerEngine.isPending}><Play className="h-4 w-4" />{triggerEngine.isPending ? "Running…" : "Run Engine"}</Button>
            </div>
          </div>
        </div>

        {builderWarnings.length > 0 && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="space-y-1"><p className="font-medium text-destructive">Automation health warnings</p><ul className="space-y-1 text-sm text-foreground">{builderWarnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard title="Workflows" value={String(workflows.length)} icon={<Workflow className="h-4 w-4" />} />
          <StatCard title="Active Workflows" value={String(activeWorkflowCount)} icon={<Activity className="h-4 w-4" />} />
          <StatCard title="Live Runs" value={String(runningCount)} icon={<Play className="h-4 w-4" />} />
          <StatCard title="Failed" value={String(failedCount)} icon={<XCircle className="h-4 w-4" />} />
          <StatCard title="No Response >3d" value={String(staleCount)} icon={<Bell className="h-4 w-4" />} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-5 py-4"><div><p className="text-sm font-semibold">Workflow Library</p><p className="text-xs text-muted-foreground">Pick a workflow or start a new one.</p></div><Button size="sm" className="gap-2" onClick={() => setSelectedWorkflowId(NEW_WORKFLOW_ID)}><Plus className="h-4 w-4" />New</Button></div>
              <div className="space-y-3 p-4">
                <button type="button" onClick={() => setSelectedWorkflowId(NEW_WORKFLOW_ID)} className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedWorkflowId === NEW_WORKFLOW_ID ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/30"}`}><div className="flex items-center justify-between gap-3"><div><p className="font-medium">New workflow</p><p className="text-xs text-muted-foreground">Blank drag-and-drop canvas</p></div><Badge variant="outline" className="bg-muted text-muted-foreground border-border">Draft</Badge></div></button>

                {workflowsLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />) : workflows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-center"><Workflow className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">No workflows created yet</p><p className="mt-1 text-xs text-muted-foreground">Use the blank canvas to build your first automation.</p></div>
                ) : workflows.map((workflow) => (
                  <button type="button" key={workflow.id} onClick={() => setSelectedWorkflowId(workflow.id)} className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedWorkflowId === workflow.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/30"}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{workflow.name}</p><p className="mt-1 text-xs text-muted-foreground">{TRIGGER_EVENTS.find((event) => event.value === workflow.trigger_event)?.label ?? workflow.trigger_event}</p></div><Badge variant="outline" className={workflow.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}>{workflow.is_active ? "Active" : "Paused"}</Badge></div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><span>{workflow.workflow_steps?.length ?? 0} steps</span><span>•</span><span>{runCountByWorkflow[workflow.id] ?? 0} runs</span></div>
                  </button>
                ))}
              </div>
            </section>

            {showDebug && canSeeDebug && organizationId && <MessageDebugPanel organizationId={organizationId} />}
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border bg-card shadow-sm">
              <div className="flex flex-col gap-4 border-b px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Builder</Badge>{selectedWorkflow ? <Badge variant="outline" className={selectedWorkflow.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}>{selectedWorkflow.is_active ? "Active" : "Paused"}</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Unsaved</Badge>}</div>
                  <h2 className="text-xl font-semibold">{selectedWorkflow ? selectedWorkflow.name : "Build a new workflow"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Drag steps to reorder, save your configuration, then run the engine without leaving this page.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedWorkflow && <Button variant="outline" className="gap-2" onClick={() => toggleWorkflow.mutate({ workflowId: selectedWorkflow.id, isActive: selectedWorkflow.is_active })} disabled={toggleWorkflow.isPending}>{selectedWorkflow.is_active ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}{selectedWorkflow.is_active ? "Pause" : "Activate"}</Button>}
                  {selectedWorkflow && <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => deleteWorkflow.mutate(selectedWorkflow.id)} disabled={deleteWorkflow.isPending}><Trash2 className="h-4 w-4" />Delete</Button>}
                  <Button className="gap-2" onClick={() => saveWorkflow.mutate()} disabled={saveWorkflow.isPending || !organizationId}><Save className="h-4 w-4" />{saveWorkflow.isPending ? "Saving…" : selectedWorkflow ? "Save Changes" : "Create Workflow"}</Button>
                </div>
              </div>

              <div className="space-y-5 p-6">
                {!organizationId && <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-foreground">Finish onboarding to load your organization before creating finance workflows.</div>}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div><Label>Workflow Name</Label><Input className="mt-2" placeholder="Invoice follow-up" value={draftName} onChange={(event) => setDraftName(event.target.value)} /></div>
                  <div><Label>Trigger Event</Label><Select value={draftTrigger} onValueChange={setDraftTrigger}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{TRIGGER_EVENTS.map((event) => <SelectItem key={event.value} value={event.value}>{event.label}</SelectItem>)}</SelectContent></Select></div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4"><div className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" /><p className="text-sm font-medium">Human-readable flow</p></div><p className="mt-2 text-sm text-muted-foreground">{humanReadableSummary(draftTrigger, draftSteps)}</p></div>

                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Drag-and-drop steps</p><p className="text-xs text-muted-foreground">Delay, condition, and action blocks can be reordered visually.</p></div><div className="flex gap-2"><Button variant="outline" className="gap-2" onClick={() => setDraftActive((current) => !current)}>{draftActive ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}{draftActive ? "Set paused" : "Set active"}</Button><Button variant="outline" className="gap-2" onClick={addStep}><Plus className="h-4 w-4" />Add Step</Button></div></div>

                <div className="space-y-3">{draftSteps.map((step, index) => <div key={`${index}-${step.step_type}-${step.config.action_type ?? "base"}`} className="space-y-3"><BuilderStepCard index={index} step={step} dragOver={dragOverIndex === index} onChange={(nextStep) => updateStep(index, nextStep)} onRemove={() => removeStep(index)} onDragStart={(nextIndex) => setDragIndex(nextIndex)} onDragEnter={(nextIndex) => setDragOverIndex(nextIndex)} onDrop={handleDrop} />{index < draftSteps.length - 1 && <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-muted-foreground/50" /></div>}</div>)}</div>
              </div>
            </section>

            <section className="rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-6 py-4"><div><h2 className="font-semibold">Live Automation Tracker</h2><p className="text-sm text-muted-foreground">Every invoice run, its latest message, and the next action.</p></div><Badge variant="outline" className="bg-muted text-muted-foreground border-border">{runs.length} runs</Badge></div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Invoice ID</TableHead><TableHead>Client</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Last Message</TableHead><TableHead>Last Contacted</TableHead><TableHead>Progress</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                     {runsLoading ? Array.from({ length: 5 }).map((_, rowIndex) => <TableRow key={rowIndex}>{Array.from({ length: 8 }).map((_, cellIndex) => <TableCell key={cellIndex}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>) : runs.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="py-16 text-center"><div className="flex flex-col items-center gap-3 text-muted-foreground"><Send className="h-8 w-8 opacity-40" /><div><p className="font-medium">No active workflows yet</p><p className="text-sm">Create a workflow above and send an invoice to trigger it.</p></div></div></TableCell></TableRow>
                    ) : runs.map((run) => {
                      const invoice = invoiceMap[run.entity_id];
                      const enrichment = enrichmentMap[run.entity_id];
                      return (
                        <TableRow key={run.id} className={urgencyClass(run.created_at, run.status)}>
                          <TableCell className="font-mono text-sm font-medium">{invoice?.invoice_number ?? `${run.entity_id.slice(0, 8)}…`}</TableCell>
                          <TableCell>{invoice?.client_name ?? <span className="text-destructive">Missing invoice</span>}</TableCell>
                          <TableCell>{invoice ? `₹${invoice.total_amount.toLocaleString()}` : "—"}</TableCell>
                          <TableCell><Badge variant="outline" className={INVOICE_STATUS_STYLES[invoice?.status ?? run.status] ?? "bg-muted text-muted-foreground border-border"}>{invoice?.status ?? run.status}</Badge></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {channelBadge(enrichment?.last_message_channel ?? null)}
                              {enrichment?.last_message_status && messageStatusBadge(enrichment.last_message_status)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{enrichment?.last_contacted_at ? formatDistanceToNow(new Date(enrichment.last_contacted_at), { addSuffix: true }) : "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className={RUN_STATUS_STYLES[run.status] ?? "bg-muted text-muted-foreground border-border"}>Step {run.current_step + 1}</Badge>
                              {run.next_run_at && run.status === "running" && <span className="text-[10px] text-muted-foreground">Next: {formatDistanceToNow(new Date(run.next_run_at), { addSuffix: true })}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {run.status === "running" && (
                                <>
                                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => sendReminder.mutate({ invoiceId: run.entity_id, channel: "email" })} disabled={sendReminder.isPending}><Mail className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Send Email Reminder</TooltipContent></Tooltip>
                                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => sendReminder.mutate({ invoiceId: run.entity_id, channel: "whatsapp" })} disabled={sendReminder.isPending}><MessageCircle className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Send WhatsApp Reminder</TooltipContent></Tooltip>
                                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markAcknowledged.mutate(run.entity_id)} disabled={markAcknowledged.isPending}><CheckCircle2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Mark Acknowledged</TooltipContent></Tooltip>
                                </>
                              )}
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedRun(run)}><Eye className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>View Details</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </div>

        <RunDetailDialog run={selectedRun} invoice={selectedRun ? invoiceMap[selectedRun.entity_id] : undefined} onClose={() => setSelectedRun(null)} />
      </div>
    </MainLayout>
  );
}
