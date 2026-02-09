import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, ChevronRight, ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { useChartOfAccounts, useDeleteAccount, type ChartAccount } from "@/hooks/useAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountFormDialog } from "./AccountFormDialog";
import { toast } from "sonner";

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

const typeStyles: Record<string, string> = {
  asset: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  liability: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  equity: "bg-green-500/10 text-green-600 border-green-500/30",
  revenue: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  expense: "bg-red-500/10 text-red-600 border-red-500/30",
};

const typeLabels: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

export function ChartOfAccountsTable() {
  const { data: accounts = [], isLoading } = useChartOfAccounts();
  const deleteMutation = useDeleteAccount();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(["asset", "liability", "equity", "revenue", "expense"]));
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleEdit = (account: ChartAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAccount(account);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingAccount(null);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.account_name}"`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
    }
    setDeleteTarget(null);
  };

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      const matchSearch = !search || a.account_name.toLowerCase().includes(search.toLowerCase()) || a.account_code.includes(search);
      const matchType = typeFilter === "all" || a.account_type === typeFilter;
      return matchSearch && matchType;
    });
  }, [accounts, search, typeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, ChartAccount[]> = {};
    const order = ["asset", "liability", "equity", "revenue", "expense"];
    order.forEach((t) => { groups[t] = []; });
    filtered.forEach((a) => {
      if (groups[a.account_type]) groups[a.account_type].push(a);
    });
    return groups;
  }, [filtered]);

  if (isLoading) return <Card><CardContent className="p-6"><Skeleton className="h-[400px]" /></CardContent></Card>;

  return (
    <>
      <Card className="col-span-full">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Chart of Accounts</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                className="pl-9 w-48"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="asset">Assets</SelectItem>
                <SelectItem value="liability">Liabilities</SelectItem>
                <SelectItem value="equity">Equity</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="expense">Expenses</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grouped).map(([type, accs]) => {
                if (accs.length === 0) return null;
                const isExpanded = expandedTypes.has(type);
                const parentAccount = accs.find((a) => a.account_code.endsWith("000"));
                const childAccounts = accs.filter((a) => !a.account_code.endsWith("000"));
                const total = childAccounts.reduce((s, a) => s + Number(a.current_balance), 0);

                return [
                  <TableRow
                    key={`header-${type}`}
                    className="cursor-pointer hover:bg-muted/50 bg-muted/30"
                    onClick={() => toggleType(type)}
                  >
                    <TableCell className="font-mono font-semibold">{parentAccount?.account_code || type.toUpperCase()}</TableCell>
                    <TableCell className="font-semibold flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {typeLabels[type]}s
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeStyles[type]}>
                        {typeLabels[type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{childAccounts.length} accounts</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(total)}</TableCell>
                    <TableCell />
                  </TableRow>,
                  ...(isExpanded
                    ? childAccounts.map((a) => (
                        <TableRow key={a.id} className="hover:bg-muted/30 group">
                          <TableCell className="font-mono text-muted-foreground pl-8">{a.account_code}</TableCell>
                          <TableCell className="pl-10">{a.account_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={typeStyles[a.account_type]}>
                              {typeLabels[a.account_type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{a.description || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(a.current_balance))}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleEdit(a, e)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    : []),
                ];
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No accounts found. Click "Add Account" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editingAccount}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.account_name}" ({deleteTarget?.account_code})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
