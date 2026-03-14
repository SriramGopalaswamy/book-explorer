import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useCreateGoodsReceipt, useUpdateGRStatus, useCreateBillFromGR } from "@/hooks/useDocumentChains";
import { PackageCheck, ClipboardList, AlertTriangle, CheckCircle, Plus, MoreHorizontal, FileText, ArrowRight, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface GoodsReceipt {
  id: string;
  grn_number: string;
  purchase_order_id: string | null;
  receipt_date: string;
  status: string;
  notes: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  inspecting: "bg-yellow-500/20 text-yellow-400",
  accepted: "bg-green-500/20 text-green-400",
  rejected: "bg-destructive/20 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function GoodsReceipts() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPO, setSelectedPO] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [viewingGR, setViewingGR] = useState<GoodsReceipt | null>(null);
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("goods_receipts" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GoodsReceipt[];
    },
  });

  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const approvedPOs = purchaseOrders.filter(po => ["approved", "confirmed", "partially_received"].includes(po.status));

  const createGR = useCreateGoodsReceipt();
  const updateGRStatus = useUpdateGRStatus();
  const createBillFromGR = useCreateBillFromGR();

  const deleteGR = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goods_receipts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Goods receipt deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreate = async () => {
    if (!selectedPO) { toast.error("Select a Purchase Order"); return; }

    const { data: poItems } = await supabase
      .from("purchase_order_items" as any)
      .select("item_id, description, quantity, received_quantity")
      .eq("purchase_order_id", selectedPO);

    const items = ((poItems as any[]) || []).map((i: any) => ({
      item_id: i.item_id || undefined,
      description: i.description,
      quantity_received: Number(i.quantity) - Number(i.received_quantity || 0),
    })).filter(i => i.quantity_received > 0);

    if (items.length === 0) { toast.error("All items already received for this PO"); return; }

    createGR.mutate({ purchase_order_id: selectedPO, receipt_date: receiptDate, notes, items }, {
      onSuccess: () => { setShowCreate(false); setSelectedPO(""); setNotes(""); },
    });
  };

  const stats = {
    total: receipts.length,
    inspecting: receipts.filter((r) => r.status === "inspecting").length,
    accepted: receipts.filter((r) => r.status === "accepted").length,
    rejected: receipts.filter((r) => r.status === "rejected").length,
  };

  const columns: Column<GoodsReceipt>[] = [
    { key: "grn_number", header: "GRN #", render: (r) => <span className="font-mono font-semibold text-foreground">{r.grn_number}</span> },
    { key: "receipt_date", header: "Date", render: (r) => format(new Date(r.receipt_date), "dd MMM yyyy") },
    { key: "status", header: "Status", render: (r) => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge> },
    { key: "notes", header: "Notes", render: (r) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
    {
      key: "id" as any, header: "Actions", render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewingGR(r)}>
              <Eye className="h-4 w-4 mr-2" /> View Receipt
            </DropdownMenuItem>
            {r.status === "draft" && (
              <>
                <DropdownMenuItem onClick={() => updateGRStatus.mutate({ id: r.id, status: "inspecting" })}>
                  <PackageCheck className="h-4 w-4 mr-2" /> Start Inspection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateGRStatus.mutate({ id: r.id, status: "accepted" })}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Accept
                </DropdownMenuItem>
              </>
            )}
            {r.status === "inspecting" && (
              <>
                <DropdownMenuItem onClick={() => updateGRStatus.mutate({ id: r.id, status: "accepted" })}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Accept
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateGRStatus.mutate({ id: r.id, status: "rejected" })}>
                  <AlertTriangle className="h-4 w-4 mr-2" /> Reject
                </DropdownMenuItem>
              </>
            )}
            {r.status === "accepted" && r.purchase_order_id && (
              <DropdownMenuItem onClick={() => createBillFromGR.mutate({ goods_receipt_id: r.id, purchase_order_id: r.purchase_order_id! })}>
                <FileText className="h-4 w-4 mr-2" /> Create Bill
              </DropdownMenuItem>
            )}
            {(r.status === "draft" || r.status === "rejected") && (
              <DropdownMenuItem onClick={() => deleteGR.mutate(r.id)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MainLayout title="Goods Receipts" subtitle="Track incoming material">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div></div>
          <Button onClick={() => setShowCreate(true)} disabled={approvedPOs.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Create from PO
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total GRNs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PackageCheck className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.inspecting}</p><p className="text-xs text-muted-foreground">Inspecting</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.accepted}</p><p className="text-xs text-muted-foreground">Accepted</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{stats.rejected}</p><p className="text-xs text-muted-foreground">Rejected</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={receipts} isLoading={isLoading} emptyMessage="No goods receipts yet. Create one from a Purchase Order." />

        {/* Create GR Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Goods Receipt from PO</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Purchase Order</Label>
                <Select value={selectedPO} onValueChange={setSelectedPO}>
                  <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                  <SelectContent>
                    {approvedPOs.map(po => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.po_number} — {po.vendor_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Receipt Date</Label>
                <Input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createGR.isPending}>
                {createGR.isPending ? "Creating..." : "Create GRN"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* View GR Dialog */}
        {viewingGR && (
          <Dialog open={!!viewingGR} onOpenChange={(v) => { if (!v) setViewingGR(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Goods Receipt — {viewingGR.grn_number}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">GRN #</p><p className="font-mono font-medium">{viewingGR.grn_number}</p></div>
                  <div><p className="text-xs text-muted-foreground">Date</p><p>{format(new Date(viewingGR.receipt_date), "dd MMM yyyy")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge className={statusColors[viewingGR.status] || ""}>{viewingGR.status}</Badge></div>
                </div>
                {viewingGR.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p>{viewingGR.notes}</p></div>}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setViewingGR(null)}>Close</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  );
}
