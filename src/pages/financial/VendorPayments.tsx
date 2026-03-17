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
import { Plus, Filter, X } from "lucide-react";
import { useVendorPayments, useCreateVendorPayment } from "@/hooks/usePayments";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";

const METHODS = ["bank_transfer", "cash", "cheque", "upi"];

export default function VendorPaymentsPage() {
  const { data: payments = [], isLoading } = useVendorPayments();
  const createPayment = useCreateVendorPayment();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: "", payment_date: new Date().toISOString().split("T")[0], amount: "", payment_method: "bank_transfer", reference_number: "", notes: "" });

  // Filters
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name").eq("status", "active").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const handleCreate = () => {
    const vendor = vendors.find(v => v.id === form.vendor_id);
    if (!vendor || !form.amount) return;
    createPayment.mutate(
      { vendor_name: vendor.name, vendor_id: vendor.id, payment_date: form.payment_date, amount: Number(form.amount), payment_method: form.payment_method, reference_number: form.reference_number, notes: form.notes },
      { onSuccess: () => { setOpen(false); setForm({ vendor_id: "", payment_date: new Date().toISOString().split("T")[0], amount: "", payment_method: "bank_transfer", reference_number: "", notes: "" }); } }
    );
  };

  const filtered = payments.filter(p => {
    if (methodFilter !== "all" && p.payment_method !== methodFilter) return false;
    if (dateFrom && isBefore(parseISO(p.payment_date), startOfDay(parseISO(dateFrom)))) return false;
    if (dateTo && isAfter(parseISO(p.payment_date), endOfDay(parseISO(dateTo)))) return false;
    return true;
  });

  const hasActiveFilters = methodFilter !== "all" || dateFrom || dateTo;
  const pagination = usePagination(filtered, 10);
  const clearFilters = () => { setMethodFilter("all"); setDateFrom(""); setDateTo(""); };

  if (isLoading) return <MainLayout title="Vendor Payments"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Vendor Payments">
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
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px] h-9 text-sm" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px] h-9 text-sm" />
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
              <DialogHeader><DialogTitle>Record Vendor Payment</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Vendor</Label>
                  <Select value={form.vendor_id} onValueChange={v => setForm(p => ({ ...p, vendor_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                      {vendors.length === 0 && (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">No vendors found. Add vendors first.</div>
                      )}
                    </SelectContent>
                  </Select>
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
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reference Number</Label><Input value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
                <Button onClick={handleCreate} disabled={createPayment.isPending || !form.vendor_id} className="w-full">{createPayment.isPending ? "Saving..." : "Record Payment"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>All Vendor Payments {hasActiveFilters && <span className="text-sm font-normal text-muted-foreground ml-2">({filtered.length} of {payments.length})</span>}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-foreground">{p.payment_number}</TableCell>
                    <TableCell className="text-foreground">{p.vendor_name}</TableCell>
                    <TableCell className="text-foreground">{format(new Date(p.payment_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-foreground capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">₹{Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate" title={p.notes || ""}>{p.notes || "—"}</TableCell>
                    <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{hasActiveFilters ? "No payments match filters" : "No vendor payments yet"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
