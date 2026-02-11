import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PLDrillDownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  type: "revenue" | "expense";
}

const formatCurrency = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

export function PLDrillDownDialog({ open, onOpenChange, categoryName, type }: PLDrillDownDialogProps) {
  const { user } = useAuth();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["pl-drilldown", user?.id, categoryName, type],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("financial_records")
        .select("*")
        .eq("user_id", user.id)
        .eq("type", type)
        .order("record_date", { ascending: false });
      if (error) throw error;

      // Try exact match first, then fuzzy match on category name
      const lowerName = categoryName.toLowerCase();
      const exact = data.filter((r) => r.category.toLowerCase() === lowerName);
      if (exact.length > 0) return exact;

      // Fuzzy: check if category contains any word from account name (3+ chars)
      const words = lowerName.split(/\s+/).filter((w) => w.length >= 3);
      const fuzzy = data.filter((r) =>
        words.some((w) => r.category.toLowerCase().includes(w))
      );
      return fuzzy.length > 0 ? fuzzy : data;
    },
    enabled: open && !!user,
  });

  const total = transactions.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {categoryName}
            <Badge variant="outline" className={type === "revenue" ? "bg-green-500/10 text-green-600 border-green-500/30" : "bg-red-500/10 text-red-600 border-red-500/30"}>
              {type}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions found for this category.</p>
          ) : (
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
                    <TableCell className={`text-right text-sm font-medium ${type === "revenue" ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(Number(t.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {transactions.length > 0 && (
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-sm text-muted-foreground">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
            <span className={`font-semibold ${type === "revenue" ? "text-green-600" : "text-red-600"}`}>
              Total: {formatCurrency(total)}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
