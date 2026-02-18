import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, MoreHorizontal, Trash2, ArrowRight, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

interface Customer { id: string; name: string; email: string | null; }
interface QuoteItem { description: string; quantity: number; rate: number; amount: number; }
interface Quote {
  id: string; quote_number: string; client_name: string; client_email: string | null;
  customer_id: string | null; amount: number; due_date: string; status: string;
  notes: string | null; converted_invoice_id: string | null; created_at: string;
}

const emptyItem: QuoteItem = { description: "", quantity: 1, rate: 0, amount: 0 };
const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;
const statusConfig: Record<string, string> = {
  draft: "", sent: "bg-primary/10 text-primary", accepted: "bg-success/20 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive", converted: "bg-muted text-muted-foreground",
};

export default function Quotes() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [formData, setFormData] = useState({ client_name: "", client_email: "", due_date: "", notes: "" });
  const [items, setItems] = useState<QuoteItem[]>([{ ...emptyItem }]);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("quotes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
    enabled: !!user,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("customers").select("id,name,email").eq("user_id", user.id).eq("status", "active");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!formData.client_name || !formData.due_date) throw new Error("Client name and due date are required.");
      const total = items.reduce((s, i) => s + i.amount, 0);
      const quoteNum = `QT-${Date.now().toString().slice(-6)}`;
      const { data: quote, error } = await supabase.from("quotes").insert({
        user_id: user.id, quote_number: quoteNum, client_name: formData.client_name,
        client_email: formData.client_email || null, customer_id: selectedCustomerId || null,
        amount: total, due_date: formData.due_date, notes: formData.notes || null,
      }).select().single();
      if (error) throw error;
      if (items.filter((i) => i.description).length > 0) {
        await supabase.from("quote_items").insert(items.filter((i) => i.description).map((i) => ({ ...i, quote_id: quote.id })));
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: "Quote Created" }); setIsDialogOpen(false); resetForm(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const convertToInvoice = useMutation({
    mutationFn: async (quote: Quote) => {
      if (!user) throw new Error("Not authenticated");
      const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
      const { data: inv, error } = await supabase.from("invoices").insert({
        user_id: user.id, invoice_number: invoiceNum, client_name: quote.client_name,
        client_email: quote.client_email ?? "", amount: quote.amount, due_date: quote.due_date,
        customer_id: quote.customer_id,
      }).select().single();
      if (error) throw error;
      const { data: qItems } = await supabase.from("quote_items").select("*").eq("quote_id", quote.id);
      if (qItems && qItems.length > 0) {
        await supabase.from("invoice_items").insert(qItems.map((i) => ({ invoice_id: inv.id, description: i.description, quantity: i.quantity, rate: i.rate, amount: i.amount })));
      }
      await supabase.from("quotes").update({ status: "converted", converted_invoice_id: inv.id }).eq("id", quote.id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); toast({ title: "Converted to Invoice" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("quotes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: "Quote Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => { setFormData({ client_name: "", client_email: "", due_date: "", notes: "" }); setItems([{ ...emptyItem }]); setSelectedCustomerId(""); };

  const updateItem = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "quantity" || field === "rate") updated[idx].amount = Number(updated[idx].quantity) * Number(updated[idx].rate);
      return updated;
    });
  };

  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) setFormData((f) => ({ ...f, client_name: c.name, client_email: c.email ?? "" }));
  };

  const total = items.reduce((s, i) => s + i.amount, 0);
  const filtered = quotes.filter((q) => q.client_name.toLowerCase().includes(search.toLowerCase()) || q.quote_number.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, 10);

  if (isCheckingRole) return null;
  if (!hasFinanceAccess) return <AccessDenied />;

  return (
    <MainLayout title="Quotes" subtitle="Create and manage quotes against registered customers">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Quotes" value={String(quotes.length)} icon={<FileText className="h-4 w-4" />} />
          <StatCard title="Accepted" value={String(quotes.filter((q) => q.status === "accepted").length)} icon={<FileText className="h-4 w-4" />} />
          <StatCard title="Converted" value={String(quotes.filter((q) => q.status === "converted").length)} icon={<FileText className="h-4 w-4" />} />
          <StatCard title="Draft" value={String(quotes.filter((q) => q.status === "draft").length)} icon={<FileText className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Quote</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Quote</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                    <SelectTrigger><SelectValue placeholder="Select a registered customer" /></SelectTrigger>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Client Name *</Label><Input value={formData.client_name} onChange={(e) => setFormData({ ...formData, client_name: e.target.value })} /></div>
                  <div><Label>Client Email</Label><Input type="email" value={formData.client_email} onChange={(e) => setFormData({ ...formData, client_email: e.target.value })} /></div>
                  <div><Label>Valid Until *</Label><Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} /></div>
                </div>
                <div>
                  <Label className="mb-2 block">Line Items</Label>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead><TableHead className="w-20">Qty</TableHead>
                          <TableHead className="w-28">Rate (₹)</TableHead><TableHead className="w-28">Amount</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell><Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="h-8" /></TableCell>
                            <TableCell><Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="h-8" /></TableCell>
                            <TableCell><Input type="number" min={0} value={item.rate} onChange={(e) => updateItem(idx, "rate", Number(e.target.value))} className="h-8" /></TableCell>
                            <TableCell className="text-sm font-medium">{formatCurrency(item.amount)}</TableCell>
                            <TableCell><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))}>×</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setItems([...items, { ...emptyItem }])}><Plus className="h-3 w-3 mr-1" />Add Line</Button>
                  <div className="mt-2 text-right font-semibold">Total: {formatCurrency(total)}</div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create Quote</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead><TableHead>Client</TableHead><TableHead>Amount</TableHead>
                <TableHead>Valid Until</TableHead><TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{search ? "No quotes match." : "No quotes yet."}</TableCell></TableRow>
              ) : pagination.paginatedItems.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-sm">{q.quote_number}</TableCell>
                  <TableCell><div className="font-medium">{q.client_name}</div><div className="text-xs text-muted-foreground">{q.client_email}</div></TableCell>
                  <TableCell className="font-semibold">{formatCurrency(q.amount)}</TableCell>
                  <TableCell className="text-sm">{new Date(q.due_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell><Badge variant="outline" className={statusConfig[q.status] ?? ""}>{q.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {q.status !== "converted" && <DropdownMenuItem onClick={() => convertToInvoice.mutate(q)}><ArrowRight className="h-4 w-4 mr-2" />Convert to Invoice</DropdownMenuItem>}
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(q.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4">
            <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
