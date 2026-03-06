import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PackageCheck, ClipboardList, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

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
};

export default function GoodsReceipts() {
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("goods_receipts" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GoodsReceipt[];
    },
  });

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
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Goods Receipts</h1>
          <p className="text-muted-foreground">Track incoming material from purchase orders</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total GRNs</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><PackageCheck className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold text-foreground">{stats.inspecting}</p><p className="text-xs text-muted-foreground">Inspecting</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold text-foreground">{stats.accepted}</p><p className="text-xs text-muted-foreground">Accepted</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold text-foreground">{stats.rejected}</p><p className="text-xs text-muted-foreground">Rejected</p></div></div></CardContent></Card>
        </div>

        <DataTable columns={columns} data={receipts} isLoading={isLoading} emptyMessage="No goods receipts yet. Create one from a Purchase Order." />
      </div>
    </MainLayout>
  );
}
