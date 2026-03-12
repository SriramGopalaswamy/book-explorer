import { useState } from "react";
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
import { Plus, CheckCircle, XCircle } from "lucide-react";
import { useApprovalWorkflows, useCreateApprovalWorkflow, useToggleWorkflow, useApprovalRequests, useApproveRequest, useRejectRequest } from "@/hooks/useApprovalWorkflows";
import { format } from "date-fns";

export default function ApprovalWorkflowsPage() {
  const { data: workflows = [], isLoading: wfLoading } = useApprovalWorkflows();
  const { data: requests = [], isLoading: reqLoading } = useApprovalRequests();
  const createWorkflow = useCreateApprovalWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const approveReq = useApproveRequest();
  const rejectReq = useRejectRequest();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ workflow_type: "purchase_order", threshold_amount: "", required_role: "admin" });
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleCreate = () => {
    if (!form.threshold_amount) return;
    createWorkflow.mutate({ ...form, threshold_amount: Number(form.threshold_amount) }, { onSuccess: () => { setOpen(false); setForm({ workflow_type: "purchase_order", threshold_amount: "", required_role: "admin" }); } });
  };

  const isLoading = wfLoading || reqLoading;
  if (isLoading) return <MainLayout title="Approval Workflows"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  const pendingRequests = requests.filter(r => r.status === "pending");
  const processedRequests = requests.filter(r => r.status !== "pending");

  return (
    <MainLayout title="Approval Workflows" subtitle="Configure and manage approval rules">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Workflow</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Approval Workflow</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Document Type</Label>
                  <Select value={form.workflow_type} onValueChange={v => setForm(p => ({ ...p, workflow_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                <div><Label>Threshold Amount (₹)</Label><Input type="number" value={form.threshold_amount} onChange={e => setForm(p => ({ ...p, threshold_amount: e.target.value }))} placeholder="Amounts above this require approval" /></div>
                <div><Label>Required Role</Label>
                  <Select value={form.required_role} onValueChange={v => setForm(p => ({ ...p, required_role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} disabled={createWorkflow.isPending} className="w-full">{createWorkflow.isPending ? "Creating..." : "Create Workflow"}</Button>
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
              <CardHeader><CardTitle>Configured Workflows</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Threshold Amount</TableHead>
                      <TableHead>Required Role</TableHead>
                      <TableHead>Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflows.map(w => (
                      <TableRow key={w.id}>
                        <TableCell className="text-foreground capitalize">{w.workflow_type.replace("_", " ")}</TableCell>
                        <TableCell className="text-foreground">₹{Number(w.threshold_amount).toLocaleString()}</TableCell>
                        <TableCell className="text-foreground capitalize">{w.required_role}</TableCell>
                        <TableCell>
                          <Switch checked={w.is_active} onCheckedChange={(v) => toggleWorkflow.mutate({ id: w.id, is_active: v })} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {workflows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No workflows configured</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardHeader><CardTitle>Pending Approvals</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Document #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-foreground capitalize">{r.document_type.replace("_", " ")}</TableCell>
                        <TableCell className="font-mono text-foreground">{r.document_number || "—"}</TableCell>
                        <TableCell className="text-foreground">{r.document_amount ? `₹${Number(r.document_amount).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-foreground">{format(new Date(r.requested_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="default" onClick={() => approveReq.mutate({ id: r.id })}><CheckCircle className="h-4 w-4 mr-1" />Approve</Button>
                          <Dialog open={rejectId === r.id} onOpenChange={v => { if (!v) setRejectId(null); }}>
                            <DialogTrigger asChild><Button size="sm" variant="destructive" onClick={() => setRejectId(r.id)}><XCircle className="h-4 w-4 mr-1" />Reject</Button></DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Reject Request</DialogTitle></DialogHeader>
                              <div className="space-y-4">
                                <div><Label>Reason</Label><Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection" /></div>
                                <Button variant="destructive" className="w-full" onClick={() => { rejectReq.mutate({ id: r.id, reason: rejectReason }); setRejectId(null); setRejectReason(""); }}>Confirm Rejection</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingRequests.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No pending approvals</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Document #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedRequests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-foreground capitalize">{r.document_type.replace("_", " ")}</TableCell>
                        <TableCell className="font-mono text-foreground">{r.document_number || "—"}</TableCell>
                        <TableCell className="text-foreground">{r.document_amount ? `₹${Number(r.document_amount).toLocaleString()}` : "—"}</TableCell>
                        <TableCell><Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge></TableCell>
                        <TableCell className="text-foreground">{format(new Date(r.approved_at || r.rejected_at || r.created_at), "dd MMM yyyy")}</TableCell>
                      </TableRow>
                    ))}
                    {processedRequests.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No history yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
