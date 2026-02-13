import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface BSDrillDownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountCode: string;
  accountType: "asset" | "liability" | "equity";
  balance: number;
}

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

const typeConfig = {
  asset: { label: "asset", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  liability: { label: "liability", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  equity: { label: "equity", className: "bg-green-500/10 text-green-600 border-green-500/30" },
};

export function BSDrillDownDialog({ open, onOpenChange, accountName, accountCode, accountType, balance }: BSDrillDownDialogProps) {
  const { user } = useAuth();
  const config = typeConfig[accountType];

  // Fetch the full account details and any child accounts
  const { data, isLoading } = useQuery({
    queryKey: ["bs-drilldown", user?.id, accountCode],
    queryFn: async () => {
      if (!user) return { account: null, children: [], transactions: [] };

      // Get the account and its children
      const { data: accounts, error: accErr } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("account_code");
      if (accErr) throw accErr;

      const account = accounts.find((a) => a.account_code === accountCode);
      const children = account
        ? accounts.filter((a) => a.parent_id === account.id && a.id !== account.id)
        : [];

      // Fetch related financial records using fuzzy matching on account name
      const lowerName = accountName.toLowerCase();
      const words = lowerName.split(/\s+/).filter((w) => w.length >= 3);

      const { data: records, error: recErr } = await supabase
        .from("financial_records")
        .select("*")
        .eq("user_id", user.id)
        .order("record_date", { ascending: false });
      if (recErr) throw recErr;

      const transactions = records.filter((r) =>
        words.some((w) => r.category.toLowerCase().includes(w) || r.description?.toLowerCase().includes(w))
      );

      return { account, children, transactions };
    },
    enabled: open && !!user,
  });

  const { account, children = [], transactions = [] } = data || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-sm">{accountCode}</span>
            {accountName}
            <Badge variant="outline" className={config.className}>
              {config.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-auto flex-1 space-y-4">
          {isLoading ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Account Details */}
              {account && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 border">
                  <div>
                    <p className="text-xs text-muted-foreground">Opening Balance</p>
                    <p className="text-sm font-medium">{formatCurrency(Number(account.opening_balance))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Balance</p>
                    <p className="text-sm font-bold">{formatCurrency(Number(account.current_balance))}</p>
                  </div>
                  {account.description && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-sm">{account.description}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={account.is_active ? "default" : "secondary"} className="text-xs mt-0.5">
                      {account.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Sub-accounts */}
              {children.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Sub-accounts</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {children.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.account_code}</TableCell>
                          <TableCell className="text-sm">{c.account_name}</TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {formatCurrency(Number(c.current_balance))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Related Transactions */}
              {transactions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Related Transactions</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {new Date(t.record_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{t.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.description || "—"}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${t.type === "revenue" ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(Number(t.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {children.length === 0 && transactions.length === 0 && account && (
                <p className="text-sm text-muted-foreground text-center py-4">No sub-accounts or related transactions found.</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-between items-center pt-3 border-t">
          <span className="text-sm text-muted-foreground">
            {children.length > 0 ? `${children.length} sub-account${children.length !== 1 ? "s" : ""}` : ""}
            {children.length > 0 && transactions.length > 0 ? " · " : ""}
            {transactions.length > 0 ? `${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}` : ""}
          </span>
          <span className={`font-semibold ${config.className.split(" ").find((c) => c.startsWith("text-"))}`}>
            Balance: {formatCurrency(balance)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
