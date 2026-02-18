import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Wallet,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useFinancialRecords, useAddFinancialRecord, useUpdateFinancialRecord, useDeleteFinancialRecord, type FinancialRecord } from "@/hooks/useFinancialData";
import { financialRecordSchema } from "@/lib/validation-schemas";
import { toast } from "sonner";
import { format } from "date-fns";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

const REVENUE_CATEGORIES = ["Software Services", "SaaS Subscriptions", "Training & Workshops", "Support Contracts", "Consulting"];
const EXPENSE_CATEGORIES = ["Salaries & Wages", "Rent & Utilities", "Cloud & Infrastructure", "Marketing & Sales", "Professional Fees", "Travel & Conveyance", "Office Supplies", "Depreciation"];

function formatAmount(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `₹${amount.toLocaleString("en-IN")}`;
  return `₹${amount}`;
}

export default function Accounting() {
  // Role-based access control
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  
  const { data: records = [], isLoading } = useFinancialRecords();
  const addRecord = useAddFinancialRecord();
  const updateRecord = useUpdateFinancialRecord();
  const deleteRecord = useDeleteFinancialRecord();

  // Show loading state while checking permissions
  if (isCheckingRole) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // Deny access if user doesn't have finance role
  if (!hasFinanceAccess) {
    return (
      <AccessDenied 
        message="Finance Access Required"
        description="You need finance or admin role to access the Accounting module. Contact your administrator for access."
      />
    );
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<FinancialRecord | null>(null);

  // Form state
  const [type, setType] = useState<"revenue" | "expense">("revenue");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [recordDate, setRecordDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalRevenue = records.filter(r => r.type === "revenue").reduce((s, r) => s + r.amount, 0);
  const totalExpenses = records.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  const resetForm = () => {
    setType("revenue");
    setCategory("");
    setAmount("");
    setDescription("");
    setRecordDate(format(new Date(), "yyyy-MM-dd"));
    setErrors({});
    setEditingRecord(null);
  };

  const openEditDialog = (record: FinancialRecord) => {
    setEditingRecord(record);
    setType(record.type as "revenue" | "expense");
    setCategory(record.category);
    setAmount(String(record.amount));
    setDescription(record.description || "");
    setRecordDate(record.record_date);
    setErrors({});
    setDialogOpen(true);
  };

  const openDeleteDialog = (record: FinancialRecord) => {
    setDeletingRecord(record);
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!deletingRecord) return;
    deleteRecord.mutate(deletingRecord.id, {
      onSuccess: () => {
        toast.success("Entry deleted successfully");
        setDeleteDialogOpen(false);
        setDeletingRecord(null);
      },
      onError: (err) => {
        toast.error("Failed to delete entry: " + err.message);
      },
    });
  };

  const handleSubmit = () => {
    const parsed = financialRecordSchema.safeParse({
      type,
      category,
      amount: parseFloat(amount) || 0,
      description: description || null,
      record_date: recordDate,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((e) => {
        const field = e.path[0] as string;
        fieldErrors[field] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    if (editingRecord) {
      updateRecord.mutate({
        id: editingRecord.id,
        type: parsed.data.type,
        category: parsed.data.category,
        amount: parsed.data.amount,
        description: parsed.data.description ?? null,
        record_date: parsed.data.record_date,
      }, {
        onSuccess: () => {
          toast.success("Entry updated successfully");
          setDialogOpen(false);
          resetForm();
        },
        onError: (err) => {
          toast.error("Failed to update entry: " + err.message);
        },
      });
    } else {
      addRecord.mutate({
        type: parsed.data.type,
        category: parsed.data.category,
        amount: parsed.data.amount,
        description: parsed.data.description ?? null,
        record_date: parsed.data.record_date,
      }, {
        onSuccess: () => {
          toast.success("Entry added successfully");
          setDialogOpen(false);
          resetForm();
        },
        onError: (err) => {
          toast.error("Failed to add entry: " + err.message);
        },
      });
    }
  };

  const categories = type === "revenue" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;
  const isSaving = addRecord.isPending || updateRecord.isPending;

  return (
    <MainLayout
      title="Accounting"
      subtitle="Manage your financial transactions and ledgers"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Revenue"
            value={formatAmount(totalRevenue)}
            change={{ value: records.length > 0 ? `${records.filter(r => r.type === "revenue").length} entries` : "0", type: "increase" }}
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            title="Total Expenses"
            value={formatAmount(totalExpenses)}
            change={{ value: records.length > 0 ? `${records.filter(r => r.type === "expense").length} entries` : "0", type: "decrease" }}
            icon={<ArrowDownRight className="h-4 w-4" />}
          />
          <StatCard
            title="Net Income"
            value={formatAmount(netIncome)}
            change={{ value: totalRevenue > 0 ? `${((netIncome / totalRevenue) * 100).toFixed(1)}% margin` : "0%", type: netIncome >= 0 ? "increase" : "decrease" }}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            title="Total Entries"
            value={String(records.length)}
            icon={<BookOpen className="h-4 w-4" />}
          />
        </div>

        {/* Transactions Table */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Recent Transactions
              </h3>
              <p className="text-sm text-muted-foreground">
                View and manage all financial transactions
              </p>
            </div>
            <Button
              className="bg-gradient-financial text-white hover:opacity-90"
              onClick={() => { resetForm(); setDialogOpen(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BookOpen className="h-10 w-10 mb-2 opacity-40" />
              <p>No financial records yet. Click "Add Entry" to create one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id} className="group hover:bg-secondary/50">
                    <TableCell>{record.record_date}</TableCell>
                    <TableCell>{record.description || "—"}</TableCell>
                    <TableCell>{record.category}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          record.type === "revenue"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                        }
                      >
                        {record.type === "revenue" ? "Revenue" : "Expense"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {record.type === "revenue" ? (
                          <ArrowUpRight className="h-4 w-4 text-success" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-destructive" />
                        )}
                        <span
                          className={
                            record.type === "revenue" ? "text-success" : "text-destructive"
                          }
                        >
                          {formatAmount(record.amount)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(record)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(record)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Add/Edit Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit Financial Entry" : "Add Financial Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => { setType(v as "revenue" | "expense"); setCategory(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
            </div>

            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
              />
              {errors.record_date && <p className="text-sm text-destructive">{errors.record_date}</p>}
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Enter description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
              {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-gradient-financial text-white hover:opacity-90"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : editingRecord ? (
                <Pencil className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingRecord ? "Update Entry" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deletingRecord?.type} entry of {deletingRecord ? formatAmount(deletingRecord.amount) : ""}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteRecord.isPending}
            >
              {deleteRecord.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}