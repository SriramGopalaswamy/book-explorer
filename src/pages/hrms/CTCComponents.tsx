import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, TrendingUp, TrendingDown, Users, AlertTriangle,
} from "lucide-react";
import {
  useMasterCTCComponents,
  useCreateMasterComponent,
  useUpdateMasterComponent,
  useDeleteMasterComponent,
  useAffectedEmployees,
  type MasterCTCComponent,
} from "@/hooks/useMasterCTCComponents";

type FormData = {
  component_name: string;
  component_type: "earning" | "deduction";
  is_taxable: boolean;
  default_percentage_of_basic: string;
  display_order: string;
};

const emptyForm: FormData = {
  component_name: "",
  component_type: "earning",
  is_taxable: true,
  default_percentage_of_basic: "",
  display_order: "0",
};

export default function CTCComponents() {
  const { data: components = [], isLoading } = useMasterCTCComponents();
  const createMutation = useCreateMasterComponent();
  const updateMutation = useUpdateMasterComponent();
  const deleteMutation = useDeleteMasterComponent();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<MasterCTCComponent | null>(null);
  const [impactCheckName, setImpactCheckName] = useState<string | null>(null);

  const { data: affectedEmployees = [], isLoading: loadingAffected } = useAffectedEmployees(impactCheckName);

  const earnings = components.filter((c) => c.component_type === "earning");
  const deductions = components.filter((c) => c.component_type === "deduction");

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setImpactCheckName(null);
    setFormOpen(true);
  };

  const openEdit = (c: MasterCTCComponent) => {
    setEditingId(c.id);
    setForm({
      component_name: c.component_name,
      component_type: c.component_type,
      is_taxable: c.is_taxable,
      default_percentage_of_basic: c.default_percentage_of_basic?.toString() ?? "",
      display_order: c.display_order.toString(),
    });
    setImpactCheckName(c.component_name);
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.component_name.trim()) return;

    const payload = {
      component_name: form.component_name.trim(),
      component_type: form.component_type,
      is_taxable: form.is_taxable,
      default_percentage_of_basic: form.default_percentage_of_basic
        ? parseFloat(form.default_percentage_of_basic)
        : null,
      display_order: parseInt(form.display_order) || 0,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, ...payload },
        { onSuccess: () => setFormOpen(false) }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const confirmDelete = (c: MasterCTCComponent) => {
    setImpactCheckName(c.component_name);
    setDeleteTarget(c);
  };

  const renderTable = (items: MasterCTCComponent[], type: "earning" | "deduction") => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {type === "earning" ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-destructive" />
        )}
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {type === "earning" ? "Earnings" : "Deductions"}
        </h3>
        <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
          No {type} components defined yet
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component Name</TableHead>
                <TableHead className="w-24 text-center">Taxable</TableHead>
                <TableHead className="w-32 text-center">% of Basic</TableHead>
                <TableHead className="w-20 text-center">Order</TableHead>
                <TableHead className="w-20 text-center">Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.component_name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={c.is_taxable ? "default" : "secondary"} className="text-[10px]">
                      {c.is_taxable ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {c.default_percentage_of_basic != null ? `${c.default_percentage_of_basic}%` : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {c.display_order}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={c.is_active
                        ? "bg-green-500/10 text-green-600 border-green-500/30 text-[10px]"
                        : "bg-muted text-muted-foreground border-border text-[10px]"
                      }
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => confirmDelete(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  return (
    <MainLayout title="CTC Components" subtitle="Manage master salary component templates">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Define and manage salary component templates used across all employee CTC structures
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Component
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {renderTable(earnings, "earning")}
            {renderTable(deductions, "deduction")}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Component" : "Add CTC Component"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Changes to the template do not retroactively modify existing employee structures."
                : "Define a new salary component template for your organization."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Component Name *</Label>
              <Input
                value={form.component_name}
                onChange={(e) => setForm((f) => ({ ...f, component_name: e.target.value }))}
                placeholder="e.g. Basic Salary, HRA, PF"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={form.component_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, component_type: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earning">Earning</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Display Order</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Default % of Basic</Label>
                <Input
                  type="number"
                  value={form.default_percentage_of_basic}
                  onChange={(e) => setForm((f) => ({ ...f, default_percentage_of_basic: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={form.is_taxable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_taxable: v }))}
                />
                <Label className="text-xs">Taxable</Label>
              </div>
            </div>

            {/* Affected employees panel (only when editing) */}
            {editingId && impactCheckName && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">Affected Employees</span>
                </div>
                {loadingAffected ? (
                  <Skeleton className="h-6 w-full" />
                ) : affectedEmployees.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No employees currently use this component.</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {affectedEmployees.map((emp) => (
                      <div key={emp.profileId} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">
                          {emp.fullName}
                          {emp.employeeCode && (
                            <span className="text-muted-foreground ml-1">({emp.employeeCode})</span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          ₹{Number(emp.annualAmount).toLocaleString("en-IN")}/yr
                        </span>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {affectedEmployees.length} employee(s) have this component in their active CTC structure.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.component_name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save Changes" : "Create Component"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Component
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.component_name}</strong>?
              This only removes the master template — existing employee structures are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteTarget && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 my-2">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">Impact Check</span>
              </div>
              {loadingAffected ? (
                <Skeleton className="h-6 w-full" />
              ) : affectedEmployees.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active employees use this component.</p>
              ) : (
                <p className="text-xs text-amber-700">
                  ⚠ {affectedEmployees.length} employee(s) currently have "{deleteTarget.component_name}" in their active CTC structure.
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
