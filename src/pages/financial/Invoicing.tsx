import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Plus,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Download,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  downloadInvoicePdf,
  Invoice,
} from "@/hooks/useInvoices";

const formatCurrency = (amount: number) => {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
};

const getStatusConfig = (status: Invoice["status"]) => {
  switch (status) {
    case "paid":
      return { label: "Paid", variant: "default" as const, icon: CheckCircle2, className: "bg-success text-success-foreground" };
    case "sent":
      return { label: "Sent", variant: "secondary" as const, icon: Send, className: "bg-primary/10 text-primary" };
    case "overdue":
      return { label: "Overdue", variant: "destructive" as const, icon: XCircle, className: "" };
    case "draft":
      return { label: "Draft", variant: "outline" as const, icon: Clock, className: "" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" as const, icon: XCircle, className: "text-muted-foreground" };
    default:
      return { label: status, variant: "outline" as const, icon: Clock, className: "" };
  }
};

export default function Invoicing() {
  const { data: invoices = [], isLoading } = useInvoices();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  
  const [formData, setFormData] = useState({
    clientName: "",
    clientEmail: "",
    description: "",
    quantity: "1",
    rate: "",
    dueDate: "",
    notes: "",
  });

  const [editFormData, setEditFormData] = useState({
    clientName: "",
    clientEmail: "",
    description: "",
    quantity: "1",
    rate: "",
    dueDate: "",
  });

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  const overdueCount = invoices.filter((inv) => inv.status === "overdue").length;
  const draftCount = invoices.filter((inv) => inv.status === "draft").length;

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditInputChange = (field: string, value: string) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    const firstItem = invoice.invoice_items?.[0];
    setEditFormData({
      clientName: invoice.client_name,
      clientEmail: invoice.client_email,
      description: firstItem?.description || "",
      quantity: String(firstItem?.quantity || 1),
      rate: String(firstItem?.rate || invoice.amount),
      dueDate: invoice.due_date,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateInvoice = () => {
    if (!editingInvoice) return;
    
    if (!editFormData.clientName.trim() || !editFormData.clientEmail.trim() || !editFormData.rate || !editFormData.dueDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const quantity = parseInt(editFormData.quantity) || 1;
    const rate = parseFloat(editFormData.rate) || 0;
    const amount = quantity * rate;

    updateInvoice.mutate(
      {
        id: editingInvoice.id,
        client_name: editFormData.clientName.trim(),
        client_email: editFormData.clientEmail.trim(),
        amount,
        due_date: editFormData.dueDate,
        items: [
          {
            description: editFormData.description || "Services",
            quantity,
            rate,
            amount,
          },
        ],
      },
      {
        onSuccess: () => {
          setEditingInvoice(null);
          setIsEditDialogOpen(false);
        },
      }
    );
  };

  const handleCreateInvoice = () => {
    if (!formData.clientName.trim() || !formData.clientEmail.trim() || !formData.rate || !formData.dueDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const quantity = parseInt(formData.quantity) || 1;
    const rate = parseFloat(formData.rate) || 0;
    const amount = quantity * rate;

    createInvoice.mutate(
      {
        client_name: formData.clientName.trim(),
        client_email: formData.clientEmail.trim(),
        amount,
        due_date: formData.dueDate,
        items: [
          {
            description: formData.description || "Services",
            quantity,
            rate,
            amount,
          },
        ],
      },
      {
        onSuccess: () => {
          setFormData({
            clientName: "",
            clientEmail: "",
            description: "",
            quantity: "1",
            rate: "",
            dueDate: "",
            notes: "",
          });
          setIsDialogOpen(false);
        },
      }
    );
  };

  const handleStatusChange = (invoiceId: string, newStatus: Invoice["status"]) => {
    updateStatus.mutate({ id: invoiceId, status: newStatus });
  };

  const handleDelete = (invoiceId: string) => {
    deleteInvoice.mutate(invoiceId);
  };

  return (
    <MainLayout
      title="Invoicing"
      subtitle="Create, send, and track invoices for your clients"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Outstanding"
            value={formatCurrency(totalOutstanding)}
            icon={<Send className="h-4 w-4" />}
          />
          <StatCard
            title="Total Paid"
            value={formatCurrency(totalPaid)}
            change={totalPaid > 0 ? { value: "8.2%", type: "increase" } : undefined}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatCard
            title="Overdue Invoices"
            value={overdueCount.toString()}
            change={overdueCount > 0 ? { value: "Needs attention", type: "decrease" } : undefined}
            icon={<XCircle className="h-4 w-4" />}
          />
          <StatCard
            title="Draft Invoices"
            value={draftCount.toString()}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>

        {/* Invoices Table */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">All Invoices</h3>
              <p className="text-sm text-muted-foreground">
                Manage and track all your invoices
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-financial text-white hover:opacity-90">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create New Invoice</DialogTitle>
                  <DialogDescription>
                    Fill in the details to create a new invoice. It will be saved as a draft.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="clientName">Client Name *</Label>
                    <Input
                      id="clientName"
                      placeholder="Enter client name"
                      value={formData.clientName}
                      onChange={(e) => handleInputChange("clientName", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="clientEmail">Client Email *</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      placeholder="client@example.com"
                      value={formData.clientEmail}
                      onChange={(e) => handleInputChange("clientEmail", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="Services rendered"
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={formData.quantity}
                        onChange={(e) => handleInputChange("quantity", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="rate">Rate (₹) *</Label>
                      <Input
                        id="rate"
                        type="number"
                        min="0"
                        placeholder="Enter amount"
                        value={formData.rate}
                        onChange={(e) => handleInputChange("rate", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dueDate">Due Date *</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => handleInputChange("dueDate", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Additional notes for the invoice"
                      value={formData.notes}
                      onChange={(e) => handleInputChange("notes", e.target.value)}
                      rows={3}
                    />
                  </div>
                  {formData.rate && (
                    <div className="rounded-lg bg-secondary/50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Amount</span>
                        <span className="text-lg font-semibold text-foreground">
                          {formatCurrency(
                            (parseInt(formData.quantity) || 1) * (parseFloat(formData.rate) || 0)
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateInvoice}
                    disabled={createInvoice.isPending}
                    className="bg-gradient-financial text-white hover:opacity-90"
                  >
                    {createInvoice.isPending ? "Creating..." : "Create Invoice"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No invoices yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first invoice to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const statusConfig = getStatusConfig(invoice.status);
                  const StatusIcon = statusConfig.icon;
                  return (
                    <TableRow key={invoice.id} className="cursor-pointer hover:bg-secondary/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{invoice.invoice_number}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{invoice.client_name}</p>
                          <p className="text-sm text-muted-foreground">{invoice.client_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(Number(invoice.amount))}
                      </TableCell>
                      <TableCell>{invoice.due_date}</TableCell>
                      <TableCell>
                        <Badge variant={statusConfig.variant} className={statusConfig.className}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditInvoice(invoice)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  toast({
                                    title: "Generating PDF",
                                    description: "Please wait while we generate your invoice...",
                                  });
                                  await downloadInvoicePdf(invoice.id);
                                  toast({
                                    title: "Download Complete",
                                    description: `Invoice ${invoice.invoice_number} has been downloaded.`,
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Download Failed",
                                    description: error instanceof Error ? error.message : "Failed to download PDF",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            {invoice.status === "draft" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "sent")}>
                                <Send className="mr-2 h-4 w-4" />
                                Send Invoice
                              </DropdownMenuItem>
                            )}
                            {(invoice.status === "sent" || invoice.status === "overdue") && (
                              <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "paid")}>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Mark as Paid
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(invoice.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
