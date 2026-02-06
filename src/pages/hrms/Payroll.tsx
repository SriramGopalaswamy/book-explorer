import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet, Users, Calendar, TrendingUp, Download, Search, FileText,
  CheckCircle, Clock, Plus, MoreHorizontal, Pencil, Trash2, ShieldAlert, Zap,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsAdminOrHR, useEmployees } from "@/hooks/useEmployees";
import {
  usePayrollRecords, usePayrollStats, useCreatePayroll, useUpdatePayroll,
  useDeletePayroll, useProcessPayroll, type PayrollRecord, type CreatePayrollData,
} from "@/hooks/usePayroll";

const formatCurrency = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString("en-IN")}`;
};

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]} ${y}`;
};

const periods = () => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
};

const statusStyles: Record<string, string> = {
  processed: "bg-green-500/10 text-green-600 border-green-500/30",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  draft: "bg-muted text-muted-foreground border-border",
};

const defaultForm: Omit<CreatePayrollData, "profile_id" | "pay_period"> = {
  basic_salary: 0, hra: 0, transport_allowance: 0, other_allowances: 0,
  pf_deduction: 0, tax_deduction: 0, other_deductions: 0, net_pay: 0,
};

export default function Payroll() {
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null);
  const [editTarget, setEditTarget] = useState<PayrollRecord | null>(null);

  const { data: isAdmin, isLoading: roleLoading } = useIsAdminOrHR();
  const { data: records = [], isLoading } = usePayrollRecords(selectedPeriod);
  const stats = usePayrollStats(selectedPeriod);
  const { data: employees = [] } = useEmployees();
  const createPayroll = useCreatePayroll();
  const updatePayroll = useUpdatePayroll();
  const deletePayroll = useDeletePayroll();
  const processPayroll = useProcessPayroll();

  const [form, setForm] = useState({ profile_id: "", ...defaultForm });

  const calcNet = (f: typeof form) =>
    f.basic_salary + f.hra + f.transport_allowance + f.other_allowances
    - f.pf_deduction - f.tax_deduction - f.other_deductions;

  const setField = (key: string, val: string) => {
    const num = parseFloat(val) || 0;
    setForm((prev) => {
      const next = { ...prev, [key]: num };
      next.net_pay = calcNet(next);
      return next;
    });
  };

  const filtered = useMemo(() =>
    records.filter((r) => {
      const name = r.profiles?.full_name?.toLowerCase() || "";
      const dept = r.profiles?.department?.toLowerCase() || "";
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || name.includes(q) || dept.includes(q);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    }), [records, searchQuery, statusFilter]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedIds((prev) => prev.length === filtered.length ? [] : filtered.map((r) => r.id));

  const handleAdd = () => {
    if (!form.profile_id) return;
    createPayroll.mutate(
      { ...form, pay_period: selectedPeriod, status: "draft" } as CreatePayrollData,
      { onSuccess: () => { setIsAddOpen(false); setForm({ profile_id: "", ...defaultForm }); } }
    );
  };

  const openEdit = (r: PayrollRecord) => {
    setEditTarget(r);
    setForm({
      profile_id: r.profile_id || "",
      basic_salary: Number(r.basic_salary),
      hra: Number(r.hra),
      transport_allowance: Number(r.transport_allowance),
      other_allowances: Number(r.other_allowances),
      pf_deduction: Number(r.pf_deduction),
      tax_deduction: Number(r.tax_deduction),
      other_deductions: Number(r.other_deductions),
      net_pay: Number(r.net_pay),
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!editTarget) return;
    updatePayroll.mutate(
      { id: editTarget.id, ...form },
      { onSuccess: () => { setIsEditOpen(false); setEditTarget(null); } }
    );
  };

  const handleBulkProcess = () => {
    if (selectedIds.length === 0) return;
    processPayroll.mutate(selectedIds, { onSuccess: () => setSelectedIds([]) });
  };

  if (!roleLoading && !isAdmin) {
    return (
      <MainLayout title="Payroll" subtitle="Manage salaries and compensation">
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground text-center max-w-md">
            You need Admin or HR role to manage payroll. Contact your administrator.
          </p>
        </div>
      </MainLayout>
    );
  }

  const SalaryFormFields = () => (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
      {!editTarget && (
        <div className="grid gap-2">
          <Label>Employee *</Label>
          <Select value={form.profile_id} onValueChange={(v) => setForm({ ...form, profile_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name || "Unnamed"} — {e.department || "No dept"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Earnings</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["basic_salary", "Basic Salary"],
            ["hra", "HRA"],
            ["transport_allowance", "Transport"],
            ["other_allowances", "Other Allowances"],
          ].map(([key, label]) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                value={form[key as keyof typeof form] || ""}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Deductions</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["pf_deduction", "PF"],
            ["tax_deduction", "Tax (TDS)"],
            ["other_deductions", "Other"],
          ].map(([key, label]) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                value={form[key as keyof typeof form] || ""}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-muted/50 p-3 flex justify-between items-center">
        <span className="font-medium">Net Pay</span>
        <span className="text-lg font-bold">{formatCurrency(form.net_pay)}</span>
      </div>
    </div>
  );

  return (
    <MainLayout title="Payroll" subtitle="Manage salaries and compensation">
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Payroll</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalPayroll)}</div>
              <p className="text-xs text-muted-foreground">For {periodLabel(selectedPeriod)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">In payroll this period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Processed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.processed}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalEmployees > 0
                  ? `${Math.round((stats.processed / stats.totalEmployees) * 100)}% complete`
                  : "No records"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Awaiting processing</p>
            </CardContent>
          </Card>
        </div>

        {/* Payroll Table */}
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Payroll Register</CardTitle>
              <CardDescription>Salary breakdown for {periodLabel(selectedPeriod)}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods().map((p) => (
                    <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9 w-40"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>

              {selectedIds.length > 0 && (
                <Button
                  onClick={handleBulkProcess}
                  disabled={processPayroll.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Process ({selectedIds.length})
                </Button>
              )}

              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Record
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Payroll Record</DialogTitle>
                    <DialogDescription>Add salary for {periodLabel(selectedPeriod)}</DialogDescription>
                  </DialogHeader>
                  <SalaryFormFields />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleAdd} disabled={createPayroll.isPending}>
                      {createPayroll.isPending ? "Adding..." : "Add Record"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading || roleLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-3 text-muted-foreground">
                  {searchQuery || statusFilter !== "all"
                    ? "No records match your filter"
                    : `No payroll records for ${periodLabel(selectedPeriod)}`}
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setIsAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add First Record
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.length === filtered.length && filtered.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Basic</TableHead>
                      <TableHead className="text-right">Allowances</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const totalAllow = Number(r.hra) + Number(r.transport_allowance) + Number(r.other_allowances);
                      const totalDeduct = Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.other_deductions);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(r.id)}
                              onCheckedChange={() => toggleSelect(r.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{r.profiles?.full_name || "Unknown"}</p>
                              <p className="text-sm text-muted-foreground">{r.profiles?.job_title || ""}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.profiles?.department || "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(r.basic_salary))}</TableCell>
                          <TableCell className="text-right text-green-600">+{formatCurrency(totalAllow)}</TableCell>
                          <TableCell className="text-right text-red-600">-{formatCurrency(totalDeduct)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(Number(r.net_pay))}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusStyles[r.status] || statusStyles.draft}>
                              {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(r)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                {r.status !== "processed" && (
                                  <DropdownMenuItem onClick={() => updatePayroll.mutate({ id: r.id, status: "processed" })}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Mark Processed
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(r)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Summary footer */}
            {filtered.length > 0 && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Basic</p>
                  <p className="font-semibold">{formatCurrency(stats.totalBasic)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Allowances</p>
                  <p className="font-semibold text-green-600">{formatCurrency(stats.totalAllowances)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Deductions</p>
                  <p className="font-semibold text-red-600">{formatCurrency(stats.totalDeductions)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Net Payroll</p>
                  <p className="font-bold text-lg">{formatCurrency(stats.totalPayroll)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payroll</DialogTitle>
            <DialogDescription>
              Update salary for {editTarget?.profiles?.full_name || "employee"}
            </DialogDescription>
          </DialogHeader>
          <SalaryFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updatePayroll.isPending}>
              {updatePayroll.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payroll Record</AlertDialogTitle>
            <AlertDialogDescription>
              Remove payroll record for {deleteTarget?.profiles?.full_name}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deletePayroll.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
