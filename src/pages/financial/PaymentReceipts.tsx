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
import { Plus } from "lucide-react";
import { usePaymentReceipts, useCreatePaymentReceipt } from "@/hooks/usePayments";
import { format } from "date-fns";

export default function PaymentReceipts() {
  const { data: receipts = [], isLoading } = usePaymentReceipts();
  const createReceipt = useCreatePaymentReceipt();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", payment_date: new Date().toISOString().split("T")[0], amount: "", payment_method: "bank_transfer", reference_number: "", notes: "" });

  const handleCreate = () => {
    if (!form.customer_name || !form.amount) return;
    createReceipt.mutate({ ...form, amount: Number(form.amount) }, { onSuccess: () => { setOpen(false); setForm({ customer_name: "", payment_date: new Date().toISOString().split("T")[0], amount: "", payment_method: "bank_transfer", reference_number: "", notes: "" }); } });
  };

  if (isLoading) return <MainLayout title="Payment Receipts"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Payment Receipts">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Record Payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Payment Receipt</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Customer Name</Label><Input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} /></div>
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
          <CardHeader><CardTitle>All Receipts</CardTitle></CardHeader>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-foreground">{r.receipt_number}</TableCell>
                    <TableCell className="text-foreground">{r.customer_name}</TableCell>
                    <TableCell className="text-foreground">{format(new Date(r.payment_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-foreground capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">₹{Number(r.amount).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={r.status === "received" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {receipts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No payment receipts yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
