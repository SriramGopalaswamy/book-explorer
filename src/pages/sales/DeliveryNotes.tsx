import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Truck, PackageCheck, RotateCcw, ClipboardList, ExternalLink, MapPin } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface DeliveryNote {
  id: string;
  dn_number: string;
  delivery_date: string;
  status: string;
  notes: string | null;
  carrier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipping_method: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  shipping_cost: number;
  weight_kg: number | null;
  packages_count: number;
  created_at: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  dispatched: "bg-blue-500/20 text-blue-400",
  in_transit: "bg-yellow-500/20 text-yellow-400",
  delivered: "bg-green-500/20 text-green-400",
  returned: "bg-destructive/20 text-destructive",
};

const CARRIERS = [
  { value: "delhivery", label: "Delhivery" },
  { value: "bluedart", label: "Blue Dart" },
  { value: "dtdc", label: "DTDC" },
  { value: "fedex", label: "FedEx" },
  { value: "dhl", label: "DHL" },
  { value: "ups", label: "UPS" },
  { value: "india_post", label: "India Post" },
  { value: "ecom_express", label: "Ecom Express" },
  { value: "xpressbees", label: "XpressBees" },
  { value: "other", label: "Other" },
];

export default function DeliveryNotes() {
  const qc = useQueryClient();
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["delivery-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_notes" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DeliveryNote[];
    },
  });

  const updateShipping = useMutation({
    mutationFn: async (update: { id: string; carrier_name?: string; tracking_number?: string; tracking_url?: string; shipping_method?: string; estimated_delivery?: string; shipping_cost?: number; weight_kg?: number; packages_count?: number; status?: string }) => {
      const { id, ...fields } = update;
      const { error } = await supabase.from("delivery_notes" as any).update({ ...fields, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["delivery-notes"] }); toast.success("Shipping details updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [editDN, setEditDN] = useState<DeliveryNote | null>(null);
  const [shipForm, setShipForm] = useState({ carrier_name: "", tracking_number: "", tracking_url: "", shipping_method: "standard", estimated_delivery: "", shipping_cost: "", weight_kg: "", packages_count: "1" });

  const openShippingDialog = (dn: DeliveryNote) => {
    setEditDN(dn);
    setShipForm({
      carrier_name: dn.carrier_name || "",
      tracking_number: dn.tracking_number || "",
      tracking_url: dn.tracking_url || "",
      shipping_method: dn.shipping_method || "standard",
      estimated_delivery: dn.estimated_delivery || "",
      shipping_cost: dn.shipping_cost ? String(dn.shipping_cost) : "",
      weight_kg: dn.weight_kg ? String(dn.weight_kg) : "",
      packages_count: String(dn.packages_count || 1),
    });
  };

  const handleSaveShipping = () => {
    if (!editDN) return;
    updateShipping.mutate({
      id: editDN.id,
      carrier_name: shipForm.carrier_name || null as any,
      tracking_number: shipForm.tracking_number || null as any,
      tracking_url: shipForm.tracking_url || null as any,
      shipping_method: shipForm.shipping_method,
      estimated_delivery: shipForm.estimated_delivery || null as any,
      shipping_cost: shipForm.shipping_cost ? Number(shipForm.shipping_cost) : 0,
      weight_kg: shipForm.weight_kg ? Number(shipForm.weight_kg) : null as any,
      packages_count: Number(shipForm.packages_count) || 1,
      status: shipForm.tracking_number ? "dispatched" : undefined,
    }, { onSuccess: () => setEditDN(null) });
  };

  const stats = {
    total: notes.length,
    in_transit: notes.filter(n => n.status === "in_transit" || n.status === "dispatched").length,
    delivered: notes.filter(n => n.status === "delivered").length,
    returned: notes.filter(n => n.status === "returned").length,
  };

  const columns: Column<DeliveryNote>[] = [
    { key: "dn_number", header: "DN #", render: r => <span className="font-mono font-semibold text-foreground">{r.dn_number}</span> },
    { key: "delivery_date", header: "Date", render: r => format(new Date(r.delivery_date), "dd MMM yyyy") },
    { key: "carrier_name", header: "Carrier", render: r => r.carrier_name ? <span className="text-foreground capitalize">{r.carrier_name.replace("_", " ")}</span> : <span className="text-muted-foreground">—</span> },
    { key: "tracking_number", header: "Tracking", render: r => r.tracking_number ? (
      <div className="flex items-center gap-1">
        <span className="font-mono text-xs text-foreground">{r.tracking_number}</span>
        {r.tracking_url && <a href={r.tracking_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3 text-primary" /></a>}
      </div>
    ) : <span className="text-muted-foreground">—</span> },
    { key: "estimated_delivery", header: "ETA", render: r => r.estimated_delivery ? format(new Date(r.estimated_delivery), "dd MMM") : <span className="text-muted-foreground">—</span> },
    { key: "status", header: "Status", render: r => <Badge className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Badge> },
    { key: "id" as any, header: "Actions", render: r => <Button variant="outline" size="sm" onClick={() => openShippingDialog(r)}><MapPin className="h-3 w-3 mr-1" />Shipping</Button> },
  ];

  return (
    <MainLayout title="Delivery Notes" subtitle="Track outbound shipments">
      <div className="space-y-6">
        <div></div>
          <p className="text-muted-foreground">Track outbound shipments with carrier & logistics details</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total DNs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Truck className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.in_transit}</p><p className="text-xs text-muted-foreground">In Transit</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PackageCheck className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.delivered}</p><p className="text-xs text-muted-foreground">Delivered</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><RotateCcw className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{stats.returned}</p><p className="text-xs text-muted-foreground">Returned</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={notes} isLoading={isLoading} emptyMessage="No delivery notes yet. Create one from a Sales Order." />

        {/* Shipping Details Dialog */}
        <Dialog open={!!editDN} onOpenChange={v => { if (!v) setEditDN(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Shipping & Logistics — {editDN?.dn_number}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Carrier</Label>
                  <Select value={shipForm.carrier_name} onValueChange={v => setShipForm(p => ({ ...p, carrier_name: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                    <SelectContent>{CARRIERS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Shipping Method</Label>
                  <Select value={shipForm.shipping_method} onValueChange={v => setShipForm(p => ({ ...p, shipping_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="express">Express</SelectItem>
                      <SelectItem value="overnight">Overnight</SelectItem>
                      <SelectItem value="freight">Freight</SelectItem>
                      <SelectItem value="pickup">Self Pickup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Tracking Number</Label><Input value={shipForm.tracking_number} onChange={e => setShipForm(p => ({ ...p, tracking_number: e.target.value }))} placeholder="e.g. DLVRY12345678" /></div>
              <div><Label>Tracking URL</Label><Input value={shipForm.tracking_url} onChange={e => setShipForm(p => ({ ...p, tracking_url: e.target.value }))} placeholder="https://..." /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Est. Delivery</Label><Input type="date" value={shipForm.estimated_delivery} onChange={e => setShipForm(p => ({ ...p, estimated_delivery: e.target.value }))} /></div>
                <div><Label>Shipping Cost</Label><Input type="number" value={shipForm.shipping_cost} onChange={e => setShipForm(p => ({ ...p, shipping_cost: e.target.value }))} /></div>
                <div><Label>Packages</Label><Input type="number" value={shipForm.packages_count} onChange={e => setShipForm(p => ({ ...p, packages_count: e.target.value }))} /></div>
              </div>
              <div><Label>Weight (kg)</Label><Input type="number" step="0.1" value={shipForm.weight_kg} onChange={e => setShipForm(p => ({ ...p, weight_kg: e.target.value }))} /></div>
              <Button onClick={handleSaveShipping} disabled={updateShipping.isPending} className="w-full">{updateShipping.isPending ? "Saving..." : "Save Shipping Details"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
