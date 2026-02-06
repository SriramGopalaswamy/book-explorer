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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  dueDate: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  createdAt: string;
  items: InvoiceItem[];
}

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

const initialInvoices: Invoice[] = [
  {
    id: "1",
    invoiceNumber: "INV-2024-001",
    clientName: "Acme Corporation",
    clientEmail: "billing@acme.com",
    amount: 250000,
    dueDate: "2024-02-15",
    status: "paid",
    createdAt: "2024-01-15",
    items: [{ description: "Consulting Services", quantity: 1, rate: 250000, amount: 250000 }],
  },
  {
    id: "2",
    invoiceNumber: "INV-2024-002",
    clientName: "TechStart Innovations",
    clientEmail: "accounts@techstart.io",
    amount: 180000,
    dueDate: "2024-02-20",
    status: "sent",
    createdAt: "2024-01-18",
    items: [{ description: "Software Development", quantity: 1, rate: 180000, amount: 180000 }],
  },
  {
    id: "3",
    invoiceNumber: "INV-2024-003",
    clientName: "Global Logistics Ltd",
    clientEmail: "finance@globallogistics.com",
    amount: 95000,
    dueDate: "2024-01-25",
    status: "overdue",
    createdAt: "2024-01-10",
    items: [{ description: "IT Support", quantity: 1, rate: 95000, amount: 95000 }],
  },
  {
    id: "4",
    invoiceNumber: "INV-2024-004",
    clientName: "Design Studio Pro",
    clientEmail: "hello@designstudio.in",
    amount: 45000,
    dueDate: "2024-02-28",
    status: "draft",
    createdAt: "2024-01-20",
    items: [{ description: "Branding Package", quantity: 1, rate: 45000, amount: 45000 }],
  },
  {
    id: "5",
    invoiceNumber: "INV-2024-005",
    clientName: "Retail Masters",
    clientEmail: "payments@retailmasters.com",
    amount: 320000,
    dueDate: "2024-02-10",
    status: "sent",
    createdAt: "2024-01-22",
    items: [{ description: "E-commerce Integration", quantity: 1, rate: 320000, amount: 320000 }],
  },
];

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
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    clientName: "",
    clientEmail: "",
    description: "",
    quantity: "1",
    rate: "",
    dueDate: "",
    notes: "",
  });

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const overdueCount = invoices.filter((inv) => inv.status === "overdue").length;
  const draftCount = invoices.filter((inv) => inv.status === "draft").length;

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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

    const newInvoice: Invoice = {
      id: Date.now().toString(),
      invoiceNumber: `INV-2024-${String(invoices.length + 1).padStart(3, "0")}`,
      clientName: formData.clientName.trim(),
      clientEmail: formData.clientEmail.trim(),
      amount,
      dueDate: formData.dueDate,
      status: "draft",
      createdAt: new Date().toISOString().split("T")[0],
      items: [
        {
          description: formData.description || "Services",
          quantity,
          rate,
          amount,
        },
      ],
    };

    setInvoices((prev) => [newInvoice, ...prev]);
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

    toast({
      title: "Invoice Created",
      description: `Invoice ${newInvoice.invoiceNumber} has been created as a draft.`,
    });
  };

  const handleStatusChange = (invoiceId: string, newStatus: Invoice["status"]) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: newStatus } : inv))
    );
    toast({
      title: "Status Updated",
      description: `Invoice status changed to ${newStatus}.`,
    });
  };

  const handleDelete = (invoiceId: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
    toast({
      title: "Invoice Deleted",
      description: "The invoice has been removed.",
    });
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
            change={{ value: "8.2%", type: "increase" }}
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
                    className="bg-gradient-financial text-white hover:opacity-90"
                  >
                    Create Invoice
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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
                        <span className="font-medium">{invoice.invoiceNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.clientName}</p>
                        <p className="text-sm text-muted-foreground">{invoice.clientEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(invoice.amount)}
                    </TableCell>
                    <TableCell>{invoice.dueDate}</TableCell>
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
                          <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem>
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
        </div>
      </div>
    </MainLayout>
  );
}
