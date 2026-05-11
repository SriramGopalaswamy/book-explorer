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

// GBC-60: line draft for editable partial-receipt quantities. Pre-filled
// with the remaining qty (ordered - already-received) when a PO is
// selected; user can edit down or set to 0 to skip a line.
type GRLineDraft = {
  item_id: string | null;
  description: string;
  unit_price: number;
  remaining: number;      // ordered - already_received (for the "Max" UI hint)
  receive_now: string;    // user-editable, kept as string for input control
};

export default function GoodsReceipts() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPO, setSelectedPO] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  // GBC-60: editable line drafts for the create-GR dialog
  const [poLines, setPoLines] = useState<GRLineDraft[]>([]);
  const [poLinesLoading, setPoLinesLoading] = useState(false);
  const [viewingGR, setViewingGR] = useState<GoodsReceipt | null>(null);
  const [viewGRItems, setViewGRItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["goods-receipts", orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("goods_receipts").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
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
      const { data: deleted, error } = await supabase.from("goods_receipts").delete().eq("id", id).eq("organization_id", orgId).select("id");
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

  // GBC-60: when a PO is selected, fetch its open lines and prefill the
  // editable drafts. Lines with zero remaining are excluded.
  const loadPoLines = async (poId: string) => {
    if (!poId) { setPoLines([]); return; }
    setPoLinesLoading(true);
    try {
      const { data: poItems, error } = await supabase
        .from("purchase_order_items")
        .select("item_id, description, quantity, received_quantity, unit_price")
        .eq("purchase_order_id", poId);
      if (error) throw error;
      const drafts: GRLineDraft[] = ((poItems as any[]) || []).map((i: any) => {
        const remaining = Math.max(Number(i.quantity) - Number(i.received_quantity || 0), 0);
        return {
          item_id: i.item_id ?? null,
          description: i.description,
          unit_price: Number(i.unit_price || 0),
          remaining,
          receive_now: remaining > 0 ? String(remaining) : "0",
        };
      }).filter(d => d.remaining > 0);
      setPoLines(drafts);
    } catch (e: any) {
      toast.error(e.message || "Failed to load PO lines");
      setPoLines([]);
    } finally {
      setPoLinesLoading(false);
    }
  };

  // Refresh draft lines whenever the PO changes.
  // (eslint-disable-next-line react-hooks/exhaustive-deps — loadPoLines is stable enough)
  // Intentionally not using useEffect to keep the change minimal — call from onValueChange.

  const handleCreate = async () => {
    if (!selectedPO) { toast.error("Select a Purchase Order"); return; }

    // GBC-60: build items from the editable drafts. Any receive_now <= 0 is
    // dropped (skipped); the remaining unreceived qty stays open on the PO
    // line item, so subsequent GRNs naturally back-order it.
    const items = poLines
      .map(d => {
        const qty = Number(d.receive_now || 0);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        if (qty > d.remaining + 0.0001) {
          throw new Error(
            `Cannot receive ${qty} of "${d.description}" — only ${d.remaining} remaining on PO`,
          );
        }
        return {
          item_id: d.item_id || undefined,
          description: d.description,
          quantity_received: qty,
          unit_price: d.unit_price || undefined,
          amount: d.unit_price ? qty * d.unit_price : undefined,
        };
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);

    if (items.length === 0) { toast.error("Set a non-zero received qty on at least one line"); return; }

    try {
      await new Promise((resolve, reject) =>
        createGR.mutate(
          { purchase_order_id: selectedPO, receipt_date: receiptDate, notes, items },
          {
            onSuccess: () => {
              setShowCreate(false);
              setSelectedPO("");
              setPoLines([]);
              setNotes("");
              resolve(null);
            },
            onError: (e) => reject(e),
          },
        ),
      );
    } catch (e: any) {
      // useCreateGoodsReceipt already surfaces a toast in onError; nothing more to do.
    }
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
              const { data } = await supabase.from("goods_receipt_items").select("*").eq("goods_receipt_id", r.id);
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
        <Dialog open={showCreate} onOpenChange={(v) => { if (!v) { setSelectedPO(""); setPoLines([]); } setShowCreate(v); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Create Goods Receipt from PO</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Purchase Order</Label>
                  <Select
                    value={selectedPO}
                    onValueChange={(v) => { setSelectedPO(v); loadPoLines(v); }}
                  >
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
              </div>

              {/* GBC-60: editable per-line received quantity */}
              {selectedPO && (
                <div className="space-y-2">
                  <Label>Items Received (edit Qty to receive partial; 0 to skip)</Label>
                  {poLinesLoading ? (
                    <p className="text-xs text-muted-foreground">Loading PO lines…</p>
                  ) : poLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">All items already received for this PO.</p>
                  ) : (
                    <div className="rounded border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Description</TableHead>
                            <TableHead className="text-xs text-right">Remaining</TableHead>
                            <TableHead className="text-xs text-right w-32">Receive Now</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {poLines.map((d, i) => (
                            <TableRow key={`${d.item_id ?? "noitem"}-${i}`}>
                              <TableCell className="text-sm">{d.description}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {d.remaining.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  max={d.remaining}
                                  step="0.001"
                                  value={d.receive_now}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPoLines(prev => prev.map((row, idx) => idx === i ? { ...row, receive_now: v } : row));
                                  }}
                                  className="text-right h-8"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Unreceived quantity stays open on the PO — additional GRNs will pick it up automatically.
                  </p>
                </div>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createGR.isPending || poLines.length === 0}>
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
