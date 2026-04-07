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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageCheck, ClipboardList, AlertTriangle, CheckCircle, Plus, MoreHorizontal, FileText, Eye, Trash2, Search } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
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
  bill_created: "bg-purple-500/20 text-purple-400",
  rejected: "bg-destructive/20 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function GoodsReceipts() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPO, setSelectedPO] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [viewingGR, setViewingGR] = useState<GoodsReceipt | null>(null);
  const [viewGRItems, setViewGRItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["goods-receipts", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("goods_receipts" as any).select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
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
      if (!orgId) throw new Error("Organization not found");
      const { data: deleted, error } = await supabase.from("goods_receipts" as any).delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0)
        throw new Error("Receipt not found or could not be deleted. You may not have permission.");
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
      .select("item_id, description, quantity, received_quantity, unit_price")
      .eq("purchase_order_id", selectedPO);

    const items = ((poItems as any[]) || []).map((i: any) => {
      const qty = Number(i.quantity) - Number(i.received_quantity || 0);
      const unitPrice = Number(i.unit_price || 0);
      return {
        item_id: i.item_id || undefined,
        description: i.description,
        quantity_received: qty,
        unit_price: unitPrice || undefined,
        amount: unitPrice ? qty * unitPrice : undefined,
      };
    }).filter(i => i.quantity_received > 0);

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
            <DropdownMenuItem onClick={async () => {
              setViewingGR(r);
              const { data } = await supabase.from("goods_receipt_items" as any).select("*").eq("goods_receipt_id", r.id);
              setViewGRItems((data as any[]) || []);
            }}>
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
            {r.status === "bill_created" && (
              <DropdownMenuItem disabled className="text-muted-foreground">
                <FileText className="h-4 w-4 mr-2" /> Bill Already Created
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

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search GRNs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="inspecting">Inspecting</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="bill_created">Bill Created</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable columns={columns} data={receipts.filter((r) => {
          const matchesSearch = r.grn_number.toLowerCase().includes(search.toLowerCase()) || (r.notes || "").toLowerCase().includes(search.toLowerCase());
          const matchesStatus = statusFilter === "all" || r.status === statusFilter;
          return matchesSearch && matchesStatus;
        })} isLoading={isLoading} emptyMessage="No goods receipts yet. Create one from a Purchase Order." />

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
          <Dialog open={!!viewingGR} onOpenChange={(v) => { if (!v) { setViewingGR(null); setViewGRItems([]); } }}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Goods Receipt — {viewingGR.grn_number}</DialogTitle></DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">GRN #</p><p className="font-mono font-medium">{viewingGR.grn_number}</p></div>
                  <div><p className="text-xs text-muted-foreground">Date</p><p>{format(new Date(viewingGR.receipt_date), "dd MMM yyyy")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge className={statusColors[viewingGR.status] || ""}>{viewingGR.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge></div>
                </div>
                {viewingGR.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p>{viewingGR.notes}</p></div>}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Items Received</p>
                  {viewGRItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No items found for this receipt.</p>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Item / Description</TableHead>
                            <TableHead className="text-right text-xs">Qty Received</TableHead>
                            <TableHead className="text-right text-xs">Unit Price</TableHead>
                            <TableHead className="text-right text-xs">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewGRItems.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="text-foreground text-xs">{item.description || item.item_name || "—"}</TableCell>
                              <TableCell className="text-right text-xs">{item.quantity_received ?? item.quantity ?? "—"}</TableCell>
                              <TableCell className="text-right text-xs">{item.unit_price != null ? `₹${Number(item.unit_price).toLocaleString("en-IN")}` : "—"}</TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {item.amount != null ? `₹${Number(item.amount).toLocaleString("en-IN")}` :
                                  (item.quantity_received != null && item.unit_price != null ? `₹${(item.quantity_received * item.unit_price).toLocaleString("en-IN")}` : "—")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => { setViewingGR(null); setViewGRItems([]); }}>Close</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  );
}
