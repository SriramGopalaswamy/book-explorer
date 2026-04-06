import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Plus, CheckCircle, XCircle, Trash2, ArrowRight, GripVertical, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useApprovalWorkflows, useCreateApprovalWorkflow, useToggleWorkflow, useApprovalRequests, useApproveRequest, useRejectRequest, useApprovalWorkflowSteps } from "@/hooks/useApprovalWorkflows";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { format } from "date-fns";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "HR" },
  { value: "manager", label: "Manager" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  finance: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  hr: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  manager: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export default function ApprovalWorkflowsPage() {
  const { isLoading: orgLoading } = useUserOrganization();
  const { data: workflows = [], isLoading: wfLoading, error: wfError } = useApprovalWorkflows();
  const { data: requests = [], isLoading: reqLoading, error: reqError } = useApprovalRequests();

  const workflowIds = useMemo(() => workflows.map(w => w.id), [workflows]);
  const { data: allSteps = [] } = useApprovalWorkflowSteps(workflowIds);

  const createWorkflow = useCreateApprovalWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const approveReq = useApproveRequest();
  const rejectReq = useRejectRequest();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ workflow_type: "purchase_order", threshold_amount: "" });
  const [steps, setSteps] = useState<{ role: string }[]>([{ role: "manager" }]);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Optimistic active-state overrides for workflow toggles
  const [optimisticWorkflowActive, setOptimisticWorkflowActive] = useState<Record<string, boolean>>({});

  const addStep = () => {
    if (steps.length >= 4) return;
    setSteps([...steps, { role: "admin" }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepRole = (index: number, role: string) => {
    setSteps(steps.map((s, i) => (i === index ? { role } : s)));
  };

  const handleCreate = () => {
    if (!form.threshold_amount) return;
    if (steps.length === 0) return;
    createWorkflow.mutate(
      { ...form, threshold_amount: Number(form.threshold_amount), steps },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ workflow_type: "purchase_order", threshold_amount: "" });
          setSteps([{ role: "manager" }]);
        },
      }
    );
  };

  const stepsMap = useMemo(() => {
    const map: Record<string, typeof allSteps> = {};
    for (const s of allSteps) {
      if (!map[s.workflow_id]) map[s.workflow_id] = [];
      map[s.workflow_id].push(s);
    }
    return map;
  }, [allSteps]);

  const isLoading = orgLoading || wfLoading || reqLoading;
  const pageError = wfError || reqError;

  if (isLoading)
    return (
      <MainLayout title="Approval Workflows">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );

  if (pageError)
    return (
      <MainLayout title="Approval Workflows">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Info className="h-10 w-10 text-destructive" />
          <p className="text-destructive font-medium">Failed to load approval data</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            {(pageError as Error).message || "An unexpected error occurred. Please refresh the page or contact your administrator."}
          </p>
        </div>
      </MainLayout>
    );

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processedRequests = requests.filter((r) => r.status !== "pending");

  const workflowsPagination = usePagination(workflows, 10);
  const pendingPagination = usePagination(pendingRequests, 10);
  const historyPagination = usePagination(processedRequests, 10);

  return (
    <MainLayout title="Approval Workflows" subtitle="Configure and manage approval rules with chain approvals">
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How Approval Workflows Work</AlertTitle>
          <AlertDescription>
            Workflows trigger automatically when documents (Purchase Orders, Expenses, Bills, etc.) exceed the configured threshold amount. Each approver in the chain receives a pending request and can approve or reject it from the <strong>Pending</strong> tab below. Approvers can also access their queue from the relevant module pages (e.g. Expenses, Bills).
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-start">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Workflow
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Approval Workflow</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <div>
                  <Label>Document Type</Label>
                  <Select value={form.workflow_type} onValueChange={(v) => setForm((p) => ({ ...p, workflow_type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase_order">Purchase Order</SelectItem>
                      <SelectItem value="sales_order">Sales Order</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="bill">Bill</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="payroll">Payroll</SelectItem>
                      <SelectItem value="reimbursement">Reimbursement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Threshold Amount (₹)</Label>
                  <Input
                    type="number"
                    value={form.threshold_amount}
                    onChange={(e) => setForm((p) => ({ ...p, threshold_amount: e.target.value }))}
                    placeholder="Amounts above this require approval"
                  />
                </div>

                {/* Approval Chain Steps */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Approval Chain</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addStep} disabled={steps.length >= 4}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Step
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define the approval chain. Each step must be approved in order before the document is fully approved.
                  </p>
                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                          {index + 1}
                        </div>
                        {index > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 -ml-1 -mr-1" />}
                        <Select value={step.role} onValueChange={(v) => updateStepRole(index, v)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {steps.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeStep(index)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {steps.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {steps.map((s, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Badge variant="outline" className={ROLE_COLORS[s.role] || ""}>
                            {ROLE_OPTIONS.find((r) => r.value === s.role)?.label || s.role}
                          </Badge>
                          {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Button onClick={handleCreate} disabled={createWorkflow.isPending} className="w-full">
                  {createWorkflow.isPending ? "Creating..." : "Create Workflow"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="workflows">
          <TabsList>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingRequests.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="workflows">
            <Card>
              <CardHeader>
                <CardTitle>Configured Workflows</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Threshold Amount</TableHead>
                      <TableHead>Approval Chain</TableHead>
                      <TableHead>Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflowsPagination.paginatedItems.map((w) => {
                      const wfSteps = stepsMap[w.id] || [];
                      const isActive = w.id in optimisticWorkflowActive ? optimisticWorkflowActive[w.id] : w.is_active;
                      return (
                        <TableRow key={w.id}>
                          <TableCell className="text-foreground capitalize">{w.workflow_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-foreground">₹{Number(w.threshold_amount).toLocaleString()}</TableCell>
                          <TableCell>
                            {wfSteps.length > 0 ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {wfSteps
                                  .sort((a, b) => a.step_order - b.step_order)
                                  .map((s, i) => (
                                    <span key={s.id} className="flex items-center gap-1">
                                      <Badge variant="outline" className={`text-xs ${ROLE_COLORS[s.required_role] || ""}`}>
                                        {s.step_order}. {ROLE_OPTIONS.find((r) => r.value === s.required_role)?.label || s.required_role}
                                      </Badge>
                                      {i < wfSteps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                                    </span>
                                  ))}
                              </div>
                            ) : (
                              <Badge variant="outline" className={`text-xs ${ROLE_COLORS[w.required_role] || ""}`}>
                                {ROLE_OPTIONS.find((r) => r.value === w.required_role)?.label || w.required_role}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={isActive}
                              onCheckedChange={(v) => {
                                // Optimistically flip the switch immediately
                                setOptimisticWorkflowActive((prev) => ({ ...prev, [w.id]: v }));
                                toggleWorkflow.mutate(
                                  { id: w.id, is_active: v },
                                  {
                                    onSuccess: () => setOptimisticWorkflowActive((prev) => { const n = { ...prev }; delete n[w.id]; return n; }),
                                    onError: () => setOptimisticWorkflowActive((prev) => { const n = { ...prev }; delete n[w.id]; return n; }),
                                  }
                                );
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {workflows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No workflows configured
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {workflows.length > 0 && (
                  <div className="pt-4">
                    <TablePagination
                      page={workflowsPagination.page}
                      totalPages={workflowsPagination.totalPages}
                      totalItems={workflowsPagination.totalItems}
                      from={workflowsPagination.from}
                      to={workflowsPagination.to}
                      pageSize={workflowsPagination.pageSize}
                      onPageChange={workflowsPagination.setPage}
                      onPageSizeChange={(s) => { workflowsPagination.setPageSize(s); workflowsPagination.setPage(1); }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Document #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPagination.paginatedItems.map((r) => {
                      const wfSteps = r.workflow_id ? stepsMap[r.workflow_id] || [] : [];
                      const currentStepInfo = wfSteps.find((s) => s.step_order === r.current_step);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-foreground capitalize">{r.document_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="font-mono text-foreground">{r.document_number || "—"}</TableCell>
                          <TableCell className="text-foreground">{r.document_amount ? `₹${Number(r.document_amount).toLocaleString()}` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Step {r.current_step}/{r.total_steps}
                              </Badge>
                              {currentStepInfo && (
                                <Badge variant="secondary" className={`text-xs ${ROLE_COLORS[currentStepInfo.required_role] || ""}`}>
                                  {ROLE_OPTIONS.find((ro) => ro.value === currentStepInfo.required_role)?.label || currentStepInfo.required_role}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-foreground">{r.requested_at ? format(new Date(r.requested_at), "dd MMM yyyy") : "—"}</TableCell>
                          <TableCell className="flex gap-2">
                            <Button size="sm" variant="default" onClick={() => approveReq.mutate({ id: r.id })}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {r.current_step < r.total_steps ? "Approve Step" : "Final Approve"}
                            </Button>
                            <Dialog open={rejectId === r.id} onOpenChange={(v) => { if (!v) setRejectId(null); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="destructive" onClick={() => setRejectId(r.id)}>
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Reject Request</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label>Reason</Label>
                                    <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection" />
                                  </div>
                                  <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={() => {
                                      rejectReq.mutate({ id: r.id, reason: rejectReason });
                                      setRejectId(null);
                                      setRejectReason("");
                                    }}
                                  >
                                    Confirm Rejection
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pendingRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No pending approvals
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {pendingRequests.length > 0 && (
                  <div className="pt-4">
                    <TablePagination
                      page={pendingPagination.page}
                      totalPages={pendingPagination.totalPages}
                      totalItems={pendingPagination.totalItems}
                      from={pendingPagination.from}
                      to={pendingPagination.to}
                      pageSize={pendingPagination.pageSize}
                      onPageChange={pendingPagination.setPage}
                      onPageSizeChange={(s) => { pendingPagination.setPageSize(s); pendingPagination.setPage(1); }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Approval History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Document #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Steps</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyPagination.paginatedItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-foreground capitalize">{r.document_type.replace(/_/g, " ")}</TableCell>
                        <TableCell className="font-mono text-foreground">{r.document_number || "—"}</TableCell>
                        <TableCell className="text-foreground">{r.document_amount ? `₹${Number(r.document_amount).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {r.total_steps > 1 ? `${r.total_steps}-step chain` : "Single"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-foreground">{(() => { const d = r.approved_at || r.rejected_at || r.created_at; return d ? format(new Date(d), "dd MMM yyyy") : "—"; })()}</TableCell>
                      </TableRow>
                    ))}
                    {processedRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No history yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {processedRequests.length > 0 && (
                  <div className="pt-4">
                    <TablePagination
                      page={historyPagination.page}
                      totalPages={historyPagination.totalPages}
                      totalItems={historyPagination.totalItems}
                      from={historyPagination.from}
                      to={historyPagination.to}
                      pageSize={historyPagination.pageSize}
                      onPageChange={historyPagination.setPage}
                      onPageSizeChange={(s) => { historyPagination.setPageSize(s); historyPagination.setPage(1); }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
