import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Play, Pause, Workflow,
  Clock, GitBranch, Zap, AlertCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useCurrentRole } from "@/hooks/useRoles";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  step_order: number;
  step_type: "delay" | "condition" | "action";
  config: Record<string, any>;
}

interface Workflow {
  id: string;
  name: string;
  trigger_event: string;
  is_active: boolean;
  created_at: string;
  workflow_steps?: WorkflowStep[];
}

const TRIGGER_EVENTS = [
  { value: "invoice_sent", label: "Invoice Sent" },
  { value: "message_received", label: "Message Received (any channel)" },
  { value: "email_received", label: "Email Received (legacy)" },
  { value: "whatsapp_message_received", label: "WhatsApp Message Received" },
  { value: "invoice_acknowledged", label: "Invoice Acknowledged" },
  { value: "invoice_disputed", label: "Invoice Disputed" },
  { value: "invoice_overdue", label: "Invoice Overdue" },
  { value: "message_delivery_failed", label: "Message Delivery Failed" },
  { value: "message_delivered", label: "Message Delivered" },
  { value: "message_read", label: "Message Read" },
];

const ACTION_TYPES = [
  { value: "send_message", label: "Send Message (Email or WhatsApp)" },
  { value: "send_email", label: "Send Email (legacy)" },
  { value: "update_invoice_status", label: "Update Invoice Status" },
  { value: "notify_internal", label: "Notify Internal Team" },
];

const EMAIL_TEMPLATES = [
  { value: "reminder_1", label: "Reminder #1 (Friendly)" },
  { value: "reminder_2", label: "Reminder #2 (Final)" },
];

const WHATSAPP_TEMPLATES = [
  { value: "invoice_reminder_1", label: "Invoice Reminder #1" },
  { value: "invoice_reminder_2", label: "Invoice Reminder #2 (Final)" },
  { value: "reminder_1", label: "Reminder #1 (Friendly)" },
  { value: "reminder_2", label: "Reminder #2 (Final)" },
];

const INVOICE_STATUSES = [
  { value: "acknowledged", label: "Acknowledged" },
  { value: "escalated", label: "Escalated" },
  { value: "overdue", label: "Overdue" },
];

const CONDITION_OPERATORS = [
  { value: "!=", label: "is not equal to" },
  { value: "=", label: "is equal to" },
  { value: ">", label: "is greater than" },
  { value: "<", label: "is less than" },
];

// ─── Step Icon ────────────────────────────────────────────────────────────────

function StepIcon({ type }: { type: string }) {
  if (type === "delay") return <Clock className="h-4 w-4 text-blue-500" />;
  if (type === "condition") return <GitBranch className="h-4 w-4 text-amber-500" />;
  return <Zap className="h-4 w-4 text-emerald-500" />;
}

function stepLabel(step: WorkflowStep): string {
  if (step.step_type === "delay") {
    return `Wait ${step.config.duration_hours ?? 24} hour(s)`;
  }
  if (step.step_type === "condition") {
    return `If ${step.config.field ?? "field"} ${step.config.operator ?? "!="} "${step.config.value ?? ""}"`;
  }
  if (step.step_type === "action") {
    const at = step.config.action_type;
    if (at === "send_message") {
      const ch = step.config.channel ?? "email";
      return `Send ${ch} message (${step.config.template ?? "template"})`;
    }
    if (at === "send_email") return `Send email (${step.config.template ?? "template"})`;
    if (at === "update_invoice_status") return `Update status → ${step.config.status ?? "?"}`;
    if (at === "notify_internal") return `Notify team: ${step.config.message ?? ""}`;
  }
  return step.step_type;
}

// ─── Step Editor ──────────────────────────────────────────────────────────────

function StepEditor({
  step,
  onChange,
  onRemove,
  index,
}: {
  step: WorkflowStep;
  onChange: (s: WorkflowStep) => void;
  onRemove: () => void;
  index: number;
}) {
  const updateConfig = (key: string, val: any) =>
    onChange({ ...step, config: { ...step.config, [key]: val } });

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <StepIcon type={step.step_type} />
          <Select
            value={step.step_type}
            onValueChange={(v: any) => onChange({ ...step, step_type: v, config: {} })}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delay">Delay</SelectItem>
              <SelectItem value="condition">Condition</SelectItem>
              <SelectItem value="action">Action</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Delay config */}
      {step.step_type === "delay" && (
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Wait</Label>
          <Input
            type="number"
            min={1}
            className="w-24 h-8 text-sm"
            value={step.config.duration_hours ?? 24}
            onChange={(e) => updateConfig("duration_hours", Number(e.target.value))}
          />
          <span className="text-sm text-muted-foreground">hours</span>
        </div>
      )}

      {/* Condition config */}
      {step.step_type === "condition" && (
        <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Field</Label>
            <Select
              value={step.config.field ?? ""}
              onValueChange={(v) => updateConfig("field", v)}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice.status">invoice.status</SelectItem>
                <SelectItem value="last_message.channel">last_message.channel</SelectItem>
                <SelectItem value="last_message.status">last_message.status</SelectItem>
                <SelectItem value="last_message.classification">last_message.classification</SelectItem>
                <SelectItem value="last_message.created_at">last_message.created_at</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Operator</Label>
            <Select
              value={step.config.operator ?? "!="}
              onValueChange={(v) => updateConfig("operator", v)}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input
              className="h-8 text-sm mt-1"
              placeholder="acknowledged"
              value={step.config.value ?? ""}
              onChange={(e) => updateConfig("value", e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Use <code className="bg-muted px-1 rounded">invoice.status</code> for invoice fields,
          or <code className="bg-muted px-1 rounded">last_message.*</code> for channel/status/classification checks.
        </p>
        </div>
      )}

      {/* Action config */}
      {step.step_type === "action" && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Action Type</Label>
            <Select
              value={step.config.action_type ?? ""}
              onValueChange={(v) => onChange({ ...step, config: { action_type: v } })}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="Select action…" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {step.config.action_type === "send_message" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Channel</Label>
                  <Select
                    value={step.config.channel ?? "email"}
                    onValueChange={(v) => updateConfig("channel", v)}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Template</Label>
                  <Select
                    value={step.config.template ?? (step.config.channel === "whatsapp" ? "invoice_reminder_1" : "reminder_1")}
                    onValueChange={(v) => updateConfig("template", v)}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(step.config.channel === "whatsapp" ? WHATSAPP_TEMPLATES : EMAIL_TEMPLATES).map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  To {step.config.channel === "whatsapp" ? "(phone / client_phone)" : "(email / client_email)"}
                </Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder={step.config.channel === "whatsapp" ? "client_phone" : "client_email"}
                  value={step.config.to ?? (step.config.channel === "whatsapp" ? "client_phone" : "client_email")}
                  onChange={(e) => updateConfig("to", e.target.value)}
                />
              </div>
            </div>
          )}

          {step.config.action_type === "send_email" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Template</Label>
                <Select
                  value={step.config.template ?? "reminder_1"}
                  onValueChange={(v) => updateConfig("template", v)}
                >
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder="client_email"
                  value={step.config.to ?? "client_email"}
                  onChange={(e) => updateConfig("to", e.target.value)}
                />
              </div>
            </div>
          )}

          {step.config.action_type === "update_invoice_status" && (
            <div>
              <Label className="text-xs text-muted-foreground">Set Status To</Label>
              <Select
                value={step.config.status ?? ""}
                onValueChange={(v) => updateConfig("status", v)}
              >
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {step.config.action_type === "notify_internal" && (
            <div>
              <Label className="text-xs text-muted-foreground">Message</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="Invoice pending acknowledgement"
                value={step.config.message ?? ""}
                onChange={(e) => updateConfig("message", e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const { data: currentRole } = useCurrentRole();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("invoice_sent");
  const [newSteps, setNewSteps] = useState<WorkflowStep[]>([
    { step_order: 1, step_type: "delay", config: { duration_hours: 24 } },
  ]);

  const organizationId = orgData?.organizationId;

  // Fetch workflows
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*, workflow_steps(*)")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Workflow[];
    },
  });

  // Create workflow mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Workflow name is required");
      if (newSteps.length === 0) throw new Error("At least one step is required");

      const { data: wf, error: wfErr } = await supabase
        .from("workflows")
        .insert({
          organization_id: organizationId,
          name: newName.trim(),
          trigger_event: newTrigger,
          is_active: true,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (wfErr) throw wfErr;

      const steps = newSteps.map((s, i) => ({
        workflow_id: wf.id,
        step_order: i + 1,
        step_type: s.step_type,
        config: s.config,
      }));
      const { error: stepErr } = await supabase.from("workflow_steps").insert(steps);
      if (stepErr) throw stepErr;

      return wf.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", organizationId] });
      toast({ title: "Workflow created" });
      setCreateOpen(false);
      setNewName("");
      setNewTrigger("invoice_sent");
      setNewSteps([{ step_order: 1, step_type: "delay", config: { duration_hours: 24 } }]);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("workflows")
        .update({ is_active: !is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", organizationId] });
      toast({ title: "Workflow updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete workflow
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", organizationId] });
      toast({ title: "Workflow deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addStep = () => {
    setNewSteps((prev) => [
      ...prev,
      { step_order: prev.length + 1, step_type: "delay", config: { duration_hours: 24 } },
    ]);
  };

  const updateStep = (i: number, s: WorkflowStep) => {
    setNewSteps((prev) => prev.map((x, idx) => (idx === i ? s : x)));
  };

  const removeStep = (i: number) => {
    setNewSteps((prev) => prev.filter((_, idx) => idx !== i));
  };

  const triggerLabel = (val: string) =>
    TRIGGER_EVENTS.find((e) => e.value === val)?.label ?? val;

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

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Workflow className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Workflow Automation</h1>
              <p className="text-sm text-muted-foreground">
                Automate invoice follow-ups, reminders, and notifications
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Workflow
          </Button>
        </div>

        {/* Workflow list */}
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : workflows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No workflows yet. Create your first workflow to automate invoice follow-ups.
                  </TableCell>
                </TableRow>
              ) : (
                workflows.map((wf) => (
                  <>
                    <TableRow
                      key={wf.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === wf.id ? null : wf.id)}
                    >
                      <TableCell className="font-medium flex items-center gap-2">
                        {expandedId === wf.id
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        {wf.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {triggerLabel(wf.trigger_event)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {wf.workflow_steps?.length ?? 0} steps
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={wf.is_active ? "default" : "secondary"}
                          className={wf.is_active ? "bg-emerald-500/20 text-emerald-700 border-emerald-200" : ""}
                        >
                          {wf.is_active ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(wf.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={wf.is_active ? "Pause" : "Activate"}
                            onClick={() => toggleMutation.mutate({ id: wf.id, is_active: wf.is_active })}
                          >
                            {wf.is_active
                              ? <Pause className="h-4 w-4 text-amber-500" />
                              : <Play className="h-4 w-4 text-emerald-500" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteMutation.mutate(wf.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded steps view */}
                    {expandedId === wf.id && (
                      <TableRow key={`${wf.id}-steps`}>
                        <TableCell colSpan={6} className="bg-muted/30 px-8 py-4">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                              Steps
                            </p>
                            {(wf.workflow_steps ?? [])
                              .sort((a, b) => a.step_order - b.step_order)
                              .map((step, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm py-1.5">
                                  <span className="w-5 h-5 rounded-full bg-muted border flex items-center justify-center text-xs text-muted-foreground font-medium">
                                    {step.step_order}
                                  </span>
                                  <StepIcon type={step.step_type} />
                                  <span className="text-foreground">{stepLabel(step)}</span>
                                </div>
                              ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Workflow Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" /> Create Workflow
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Workflow Name</Label>
              <Input
                placeholder="e.g. Invoice Follow-up"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            {/* Trigger */}
            <div className="space-y-1.5">
              <Label>Trigger Event</Label>
              <Select value={newTrigger} onValueChange={setNewTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_EVENTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The workflow will start whenever this event occurs.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1.5 h-8">
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </Button>
              </div>
              <div className="space-y-3">
                {newSteps.map((step, i) => (
                  <StepEditor
                    key={i}
                    index={i}
                    step={step}
                    onChange={(s) => updateStep(i, s)}
                    onRemove={() => removeStep(i)}
                  />
                ))}
                {newSteps.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                    No steps yet. Click "Add Step" to build your workflow.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName.trim() || newSteps.length === 0}
            >
              {createMutation.isPending ? "Creating…" : "Create Workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
