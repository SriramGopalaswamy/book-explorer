import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { useStockLedger, useItems, useWarehouses } from "@/hooks/useInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function StockLedger() {
  const [itemFilter, setItemFilter] = useState<string>("");
  const [whFilter, setWhFilter] = useState<string>("");
  const { data: items } = useItems();
  const { data: warehouses } = useWarehouses();
  const { data: entries, isLoading, isError, error } = useStockLedger(itemFilter || undefined, whFilter || undefined);

  const txnBadge = (type: string) => {
    const inTypes = ["purchase", "transfer_in", "production_in", "opening", "return", "adjustment", "in"];
    return inTypes.includes(type) ? "default" : "destructive";
  };

  const itemName = (id: string) => items?.find((i: any) => i.id === id)?.name || id?.slice(0, 8);
  const whName = (id: string) => warehouses?.find((w: any) => w.id === id)?.name || id?.slice(0, 8);

  return (
    <MainLayout title="Stock Ledger" subtitle="View all stock movements across items and warehouses">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><BookOpen className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total Entries</p><p className="text-2xl font-bold text-foreground">{entries?.length || 0}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10"><ArrowUpRight className="h-6 w-6 text-emerald-500" /></div>
            <div><p className="text-sm text-muted-foreground">Stock In</p><p className="text-2xl font-bold text-foreground">
              {(entries || []).filter((e: any) => Number(e.quantity) > 0).reduce((s: number, e: any) => s + Number(e.quantity), 0)}
            </p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10"><ArrowDownRight className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Stock Out</p><p className="text-2xl font-bold text-foreground">
              {Math.abs((entries || []).filter((e: any) => Number(e.quantity) < 0).reduce((s: number, e: any) => s + Number(e.quantity), 0))}
            </p></div>
          </CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={itemFilter} onValueChange={setItemFilter}>
            <SelectTrigger className="w-full sm:w-60"><SelectValue placeholder="All Items" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Items</SelectItem>
              {(items || []).map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={whFilter} onValueChange={setWhFilter}>
            <SelectTrigger className="w-full sm:w-60"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Warehouses</SelectItem>
              {(warehouses || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-center text-destructive">
              Failed to load stock ledger: {(error as any)?.message || "Unknown error"}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Balance Qty</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entries || []).length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No stock movements recorded yet.</TableCell></TableRow>
                  ) : (entries || []).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{(() => { try { return format(new Date(e.posted_at), "dd MMM yyyy"); } catch { return e.posted_at ?? "—"; } })()}</TableCell>
                      <TableCell className="font-medium text-foreground">{itemName(e.item_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{whName(e.warehouse_id)}</TableCell>
                      <TableCell><Badge variant={txnBadge(e.entry_type || e.transaction_type) as any}>{(e.entry_type || e.transaction_type || "—")?.replace("_", " ")}</Badge></TableCell>
                      <TableCell className={`text-right font-medium ${Number(e.quantity) >= 0 ? "text-emerald-500" : "text-destructive"}`}>{Number(e.quantity) > 0 ? "+" : ""}{Number(e.quantity)}</TableCell>
                      <TableCell className="text-right text-foreground">₹{Number(e.rate).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right text-foreground">₹{Number(e.value ?? (Number(e.quantity) * Number(e.rate))).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right text-foreground">{e.balance_qty != null ? Number(e.balance_qty) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{e.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
