import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, X, Eye } from "lucide-react";
import { usePaymentReceipts, useCreatePaymentReceipt } from "@/hooks/usePayments";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";

const METHODS = ["bank_transfer", "cash", "cheque", "upi", "card"];

type PaymentReceipt = ReturnType<typeof usePaymentReceipts>["data"] extends (infer T)[] | undefined ? T : never;

export default function PaymentReceipts() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const { data: receipts = [], isLoading } = usePaymentReceipts();
  const createReceipt = useCreatePaymentReceipt();
  const [open, setOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<PaymentReceipt | null>(null);
  const [form, setForm] = useState({ customer_name: "", payment_date: new Date().toISOString().split("T")[0], amount: "", payment_method: "bank_transfer", reference_number: "", notes: "" });

  // Fetch active customers for dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-active", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!orgId,
  });

  // Filters
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleCreate = () => {
    if (!form.customer_name || !form.amount) return;
    if (!orgId) { toast.error("Organization not found"); return; }
    createReceipt.mutate({ ...form, amount: Number(form.amount) }, { onSuccess: () => { setOpen(false); setForm({ customer_name: "", payment_date: new Date().toISOString().split("T")[0], amount: "", payment_method: "bank_transfer", reference_number: "", notes: "" }); } });
  };

  const filtered = receipts.filter(r => {
    if (methodFilter !== "all" && r.payment_method !== methodFilter) return false;
    if (dateFrom && isBefore(parseISO(r.payment_date), startOfDay(parseISO(dateFrom)))) return false;
    if (dateTo && isAfter(parseISO(r.payment_date), endOfDay(parseISO(dateTo)))) return false;
    return true;
  });

  const hasActiveFilters = methodFilter !== "all" || dateFrom || dateTo;
  const pagination = usePagination(filtered, 10);
  const clearFilters = () => { setMethodFilter("all"); setDateFrom(""); setDateTo(""); };

  if (isLoading) return <MainLayout title="Payment Receipts"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Payment Receipts">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {METHODS.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px] h-9 text-sm" placeholder="From" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px] h-9 text-sm" placeholder="To" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Record Payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Payment Receipt</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Customer</Label>
                  {customers.length > 0 ? (
                    <Select value={form.customer_name} onValueChange={v => setForm(p => ({ ...p, customer_name: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select active customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} placeholder="Enter customer name" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} /></div>
                  <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
                </div>
                <div><Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm(p => ({ ...p, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reference Number</Label><Input value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
                <Button onClick={handleCreate} disabled={createReceipt.isPending} className="w-full">{createReceipt.isPending ? "Saving..." : "Record Payment"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>All Receipts {hasActiveFilters && <span className="text-sm font-normal text-muted-foreground ml-2">({filtered.length} of {receipts.length})</span>}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-foreground">{r.receipt_number}</TableCell>
                    <TableCell className="text-foreground">{r.customer_name}</TableCell>
                    <TableCell className="text-foreground">{format(new Date(r.payment_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-foreground capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">₹{Number(r.amount).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={r.status === "received" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewReceipt(r)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{hasActiveFilters ? "No receipts match filters" : "No payment receipts yet"}</TableCell></TableRow>}
              </TableBody>
            </Table>
            <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </CardContent>
        </Card>
      </div>

      {/* View Receipt Dialog */}
      <Dialog open={!!viewReceipt} onOpenChange={(o) => !o && setViewReceipt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Receipt Details</DialogTitle></DialogHeader>
          {viewReceipt && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Receipt #</p><p className="font-mono font-medium">{viewReceipt.receipt_number}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={viewReceipt.status === "received" ? "default" : "secondary"}>{viewReceipt.status}</Badge></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{viewReceipt.customer_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Date</p><p>{format(new Date(viewReceipt.payment_date), "dd MMM yyyy")}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Amount</p><p className="text-lg font-semibold">₹{Number(viewReceipt.amount).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Method</p><p className="capitalize">{viewReceipt.payment_method.replace(/_/g, " ")}</p></div>
              </div>
              {viewReceipt.reference_number && (
                <div><p className="text-xs text-muted-foreground">Reference #</p><p className="font-mono">{viewReceipt.reference_number}</p></div>
              )}
              {viewReceipt.notes && (
                <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm">{viewReceipt.notes}</p></div>
              )}
            </div>
          )}
          <div className="flex justify-end"><Button variant="outline" onClick={() => setViewReceipt(null)}>Close</Button></div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
