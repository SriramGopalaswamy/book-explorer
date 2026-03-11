import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useSalesReturns, useCreateSalesReturn, useUpdateSalesReturnStatus, useCreateCreditNoteFromReturn } from "@/hooks/useReturns";
import { format } from "date-fns";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", confirmed: "default", processed: "default", cancelled: "destructive",
};

export default function SalesReturnsPage() {
  const { data: returns = [], isLoading } = useSalesReturns();
  const createReturn = useCreateSalesReturn();
  const updateStatus = useUpdateSalesReturnStatus();
  const createCreditNote = useCreateCreditNoteFromReturn();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", return_date: new Date().toISOString().split("T")[0], reason: "", notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]);

  const addItem = () => setItems(p => [...p, { description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const handleCreate = () => {
    if (!form.customer_name || items.length === 0) return;
    createReturn.mutate({ ...form, items }, {
      onSuccess: () => { setOpen(false); setForm({ customer_name: "", return_date: new Date().toISOString().split("T")[0], reason: "", notes: "" }); setItems([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, reason: "" }]); },
    });
  };

  if (isLoading) return <MainLayout title="Sales Returns"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Sales Returns">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Return</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Sales Return</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Customer Name</Label><Input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} /></div>
                  <div><Label>Return Date</Label><Input type="date" value={form.return_date} onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))} /></div>
                </div>
                <div><Label>Reason</Label><Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
                <div>
                  <div className="flex items-center justify-between mb-2"><Label>Return Items</Label><Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 mb-2">
                      <div><Label className="text-xs">Description</Label><Input placeholder="Description" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} /></div>
                      <div><Label className="text-xs">Qty</Label><Input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Price</Label><Input type="number" placeholder="Price" value={item.unit_price} onChange={e => updateItem(i, "unit_price", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Tax %</Label><Input type="number" placeholder="Tax %" value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", Number(e.target.value))} /></div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={items.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreate} disabled={createReturn.isPending} className="w-full">{createReturn.isPending ? "Creating..." : "Create Return"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>All Sales Returns</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-foreground">{r.return_number}</TableCell>
                    <TableCell className="text-foreground">{r.customer_name}</TableCell>
                    <TableCell className="text-foreground">{format(new Date(r.return_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">₹{Number(r.total_amount).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={statusColors[r.status] || "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.status === "draft" && (
                          <Select onValueChange={v => updateStatus.mutate({ id: r.id, status: v })}>
                            <SelectTrigger className="w-[120px] h-8"><SelectValue placeholder="Advance…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="submitted">Submit</SelectItem>
                              <SelectItem value="cancelled">Cancel</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {r.status === "submitted" && (
                          <Select onValueChange={v => updateStatus.mutate({ id: r.id, status: v })}>
                            <SelectTrigger className="w-[120px] h-8"><SelectValue placeholder="Advance…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approved">Approve</SelectItem>
                              <SelectItem value="cancelled">Cancel</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {r.status === "approved" && !r.credit_note_id && (
                          <Button size="sm" variant="outline" onClick={() => createCreditNote.mutate(r.id)} disabled={createCreditNote.isPending}>
                            Credit Note
                          </Button>
                        )}
                        {r.status === "approved" && r.credit_note_id && (
                          <Badge variant="outline" className="text-green-500 border-green-500/50">CN Issued</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {returns.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No sales returns</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
