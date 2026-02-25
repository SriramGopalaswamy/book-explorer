import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, MoreHorizontal, Trash2, Search, Receipt, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";

interface Vendor { id: string; name: string; }
interface VendorCredit {
  id: string; vendor_credit_number: string; vendor_name: string; vendor_id: string | null;
  amount: number; reason: string | null; status: string; issue_date: string; created_at: string;
}

const formatCurrency = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${n.toLocaleString("en-IN")}`;

export default function VendorCredits() {
  const { data: hasFinanceAccess, isLoading: isCheckingRole } = useIsFinance();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [form, setForm] = useState({ vendor_name: "", amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });

  const { data: vendorCredits = [], isLoading } = useQuery({
    queryKey: ["vendor-credits", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("vendor_credits").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorCredit[];
    },
    enabled: !!user,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("vendors").select("id,name").eq("status", "active");
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!form.vendor_name || !form.amount) throw new Error("Vendor name and amount are required.");
      const { error } = await supabase.from("vendor_credits").insert({
        user_id: user.id, vendor_credit_number: `VC-${Date.now().toString().slice(-6)}`,
        vendor_name: form.vendor_name, vendor_id: selectedVendorId || null,
        amount: Number(form.amount), reason: form.reason || null, issue_date: form.issue_date,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
      toast({ title: "Vendor Credit Created" });
      setIsDialogOpen(false);
      setForm({ vendor_name: "", amount: "", reason: "", issue_date: new Date().toISOString().split("T")[0], status: "issued" });
      setSelectedVendorId("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("vendor_credits").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendor-credits"] }); toast({ title: "Vendor Credit Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("vendor_credits").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendor-credits"] }); toast({ title: "Status Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleVendorSelect = (id: string) => {
    setSelectedVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) setForm((f) => ({ ...f, vendor_name: v.name }));
  };

  const filtered = vendorCredits.filter((vc) => vc.vendor_name.toLowerCase().includes(search.toLowerCase()) || vc.vendor_credit_number.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, 10);

  if (isCheckingRole) return null;
  if (!hasFinanceAccess) return <AccessDenied />;

  return (
    <MainLayout title="Vendor Credits" subtitle="Manage credit notes received from vendors">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard title="Total Vendor Credits" value={String(vendorCredits.length)} icon={<Receipt className="h-4 w-4" />} />
          <StatCard title="Draft" value={String(vendorCredits.filter((vc) => vc.status === "draft").length)} icon={<Receipt className="h-4 w-4" />} />
          <StatCard title="Total Value" value={formatCurrency(vendorCredits.reduce((s, vc) => s + vc.amount, 0))} icon={<Receipt className="h-4 w-4" />} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search vendor credits..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Vendor Credit</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create Vendor Credit</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Vendor</Label>
                  <Select value={selectedVendorId} onValueChange={handleVendorSelect}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Vendor Name *</Label><Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} /></div>
                <div><Label>Amount (₹) *</Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credit #</TableHead><TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead><TableHead>Issue Date</TableHead>
                <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No vendor credits yet.</TableCell></TableRow>
              ) : pagination.paginatedItems.map((vc) => (
                <TableRow key={vc.id}>
                  <TableCell className="font-mono text-sm">{vc.vendor_credit_number}</TableCell>
                  <TableCell className="font-medium">{vc.vendor_name}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(vc.amount)}</TableCell>
                  <TableCell className="text-sm">{new Date(vc.issue_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell><Badge variant="outline">{vc.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {["draft", "issued", "applied", "void"].filter((s) => s !== vc.status).map((s) => (
                          <DropdownMenuItem key={s} onClick={() => updateStatusMutation.mutate({ id: vc.id, status: s })}>
                            <RefreshCw className="h-4 w-4 mr-2" />Mark as {s.charAt(0).toUpperCase() + s.slice(1)}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(vc.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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
