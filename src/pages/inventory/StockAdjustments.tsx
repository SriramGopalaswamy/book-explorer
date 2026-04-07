import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { useStockAdjustments, useCreateStockAdjustment, useWarehouses } from "@/hooks/useInventory";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, Search, MoreHorizontal, Eye, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function useUpdateAdjustmentStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      const VALID = ["draft", "approved", "posted", "cancelled"];
      if (!VALID.includes(status)) throw new Error(`Invalid status: ${status}`);
      const { error } = await supabase.from("stock_adjustments" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-adjustments"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

function useDeleteAdjustment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const orgId = orgData?.organizationId;
      if (!orgId) throw new Error("No organization found");
      const { data: deleted, error } = await supabase.from("stock_adjustments" as any).delete().eq("id", id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0)
        throw new Error("Adjustment not found or could not be deleted. You may not have permission.");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-adjustments"] }); toast.success("Adjustment deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export default function StockAdjustments() {
  const { user } = useAuth();
  const { data: adjustments, isLoading } = useStockAdjustments();
  const { data: warehouses } = useWarehouses();
  const createAdj = useCreateStockAdjustment();
  const updateStatus = useUpdateAdjustmentStatus();
  const deleteAdj = useDeleteAdjustment();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ adjustment_number: "", warehouse_id: "", reason: "", notes: "" });

  const filtered = (adjustments || []).filter((a: any) => {
    const matchSearch = a.adjustment_number?.toLowerCase().includes(search.toLowerCase()) ||
      a.reason?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });
  const pagination = usePagination(filtered, 10);

  const whName = (id: string) => warehouses?.find((w: any) => w.id === id)?.name || id?.slice(0, 8);

  const statusBadgeClass = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      approved: "bg-blue-500/20 text-blue-400",
      posted: "bg-green-500/20 text-green-400",
      cancelled: "bg-destructive/20 text-destructive",
    };
    return map[s] || "bg-muted text-muted-foreground";
  };

  const handleCreate = () => {
    createAdj.mutate({
      adjustment_number: form.adjustment_number,
      warehouse_id: form.warehouse_id,
      reason: form.reason,
      notes: form.notes || null,
      created_by: user?.id,
    }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ adjustment_number: "", warehouse_id: "", reason: "", notes: "" });
      },
    });
  };

  return (
    <MainLayout title="Stock Adjustments" subtitle="Create and manage inventory adjustments">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><ClipboardList className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold text-foreground">{adjustments?.length || 0}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-muted"><ClipboardList className="h-6 w-6 text-muted-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Draft</p><p className="text-2xl font-bold text-foreground">{(adjustments || []).filter((a: any) => a.status === "draft").length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><ClipboardList className="h-6 w-6 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Approved</p><p className="text-2xl font-bold text-foreground">{(adjustments || []).filter((a: any) => a.status === "approved").length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10"><ClipboardList className="h-6 w-6 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Posted</p><p className="text-2xl font-bold text-foreground">{(adjustments || []).filter((a: any) => a.status === "posted").length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10"><ClipboardList className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Cancelled</p><p className="text-2xl font-bold text-foreground">{(adjustments || []).filter((a: any) => a.status === "cancelled").length}</p></div>
          </CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search adjustments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Adjustment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Stock Adjustment</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label>Adjustment # *</Label><Input value={form.adjustment_number} onChange={e => setForm(f => ({ ...f, adjustment_number: e.target.value }))} /></div>
                <div><Label>Warehouse *</Label>
                  <Select value={form.warehouse_id} onValueChange={v => setForm(f => ({ ...f, warehouse_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {(warehouses || []).filter((w: any) => w.is_active !== false).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reason *</Label><Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleCreate} disabled={!form.adjustment_number || !form.warehouse_id || !form.reason || createAdj.isPending}>
                  {createAdj.isPending ? "Creating..." : "Create Adjustment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adjustment #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No stock adjustments found.</TableCell></TableRow>
                  ) : pagination.paginatedItems.map((adj: any) => (
                    <TableRow key={adj.id}>
                      <TableCell className="font-mono font-medium text-foreground">{adj.adjustment_number}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(adj.adjustment_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-foreground">{whName(adj.warehouse_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{adj.reason}</TableCell>
                      <TableCell><Badge className={statusBadgeClass(adj.status)}>{adj.status.charAt(0).toUpperCase() + adj.status.slice(1)}</Badge></TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{adj.notes || "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {adj.status === "draft" && (
                              <>
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: adj.id, status: "approved" })}>
                                  <CheckCircle className="h-4 w-4 mr-2" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setForm({ adjustment_number: adj.adjustment_number, warehouse_id: adj.warehouse_id, reason: adj.reason, notes: adj.notes || "" });
                                  setOpen(true);
                                }}>
                                  <Eye className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                              </>
                            )}
                            {adj.status === "approved" && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: adj.id, status: "posted" })}>
                                <CheckCircle className="h-4 w-4 mr-2" /> Post
                              </DropdownMenuItem>
                            )}
                            {(adj.status === "draft" || adj.status === "approved") && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: adj.id, status: "cancelled" })} className="text-destructive">
                                <XCircle className="h-4 w-4 mr-2" /> Cancel
                              </DropdownMenuItem>
                            )}
                            {adj.status === "draft" && (
                              <DropdownMenuItem onClick={() => deleteAdj.mutate(adj.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
