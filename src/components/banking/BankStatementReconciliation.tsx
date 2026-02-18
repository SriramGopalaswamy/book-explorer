import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  Upload, FileText, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Sparkles, Check, X, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { BankAccount } from "@/hooks/useBanking";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = [
  "Salary", "Payroll", "Rent", "Utilities", "Software", "Marketing",
  "Travel", "Meals & Entertainment", "Office Supplies", "Professional Services",
  "Insurance", "Tax Payment", "Loan Repayment", "Equipment", "Subscription",
  "Client Payment", "Vendor Payment", "Transfer", "Refund", "Other",
];

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  transaction_type: "credit" | "debit";
  // AI-enriched
  ai_suggested_category?: string;
  is_duplicate_flag?: boolean;
  confidence?: string;
  // User decisions
  approved: boolean;
  rejected: boolean;
  category: string;
  _id: string; // local unique id
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function inferColumns(headers: string[]): { date: number; desc: number; amount: number; type: number | null } {
  const h = headers.map((h) => h.toLowerCase());
  const date = h.findIndex((c) => c.includes("date"));
  const desc = h.findIndex((c) => c.includes("desc") || c.includes("narration") || c.includes("particular") || c.includes("remark") || c.includes("detail"));
  const amount = h.findIndex((c) => c.includes("amount") || c.includes("debit") || c.includes("credit") || c.includes("withdrawal") || c.includes("deposit"));
  const type = h.findIndex((c) => c === "type" || c === "dr/cr" || c.includes("transaction type"));
  return { date, desc, amount, type };
}

interface Props {
  accounts: BankAccount[];
}

export function BankStatementReconciliation({ accounts }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  // ── CSV parsing ──────────────────────────────────────────────────────────
  const processFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Invalid file", description: "Please upload a CSV file.", variant: "destructive" });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const matrix = parseCSV(text);
      if (matrix.length < 2) {
        toast({ title: "Empty file", description: "The CSV has no data rows.", variant: "destructive" });
        return;
      }
      const headers = matrix[0];
      const { date, desc, amount, type } = inferColumns(headers);
      if (date < 0 || desc < 0 || amount < 0) {
        toast({
          title: "Column detection failed",
          description: "Could not find Date, Description, or Amount columns. Ensure your CSV has these headers.",
          variant: "destructive",
        });
        return;
      }
      const parsed: ParsedRow[] = [];
      for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i];
        const rawDate = row[date] ?? "";
        const rawDesc = row[desc] ?? "";
        const rawAmount = row[amount] ?? "";
        if (!rawDate || !rawDesc || !rawAmount) continue;

        // Parse date
        let parsedDate = "";
        const parts = rawDate.replace(/\//g, "-").split("-");
        if (parts.length === 3) {
          // dd-mm-yyyy or yyyy-mm-dd
          if (parts[0].length === 4) {
            parsedDate = rawDate.replace(/\//g, "-");
          } else {
            parsedDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        }
        if (!parsedDate) continue;

        const amt = Math.abs(parseFloat(rawAmount.replace(/[^0-9.-]/g, "")));
        if (isNaN(amt) || amt === 0) continue;

        // Determine transaction type
        let txType: "credit" | "debit" = "credit";
        if (type >= 0) {
          const t = (row[type] ?? "").toLowerCase();
          txType = t.includes("dr") || t.includes("debit") || t.includes("withdrawal") ? "debit" : "credit";
        } else {
          // Heuristic: negative = debit
          const raw = parseFloat(rawAmount.replace(/[^0-9.-]/g, ""));
          if (raw < 0) txType = "debit";
        }

        parsed.push({
          date: parsedDate,
          description: rawDesc,
          amount: amt,
          transaction_type: txType,
          approved: false,
          rejected: false,
          category: "",
          _id: `${i}-${Math.random()}`,
        });
      }

      if (parsed.length === 0) {
        toast({ title: "No valid rows", description: "No parseable rows found in the CSV.", variant: "destructive" });
        return;
      }

      toast({ title: `${parsed.length} rows parsed`, description: "Running AI categorisation…" });
      setRows(parsed);
      runAI(parsed);
    };
    reader.readAsText(f);
  }, []);

  // ── AI categorisation ────────────────────────────────────────────────────
  const runAI = async (parsed: ParsedRow[]) => {
    setIsAnalysing(true);
    setStep("review");
    try {
      const payload = parsed.map((r) => ({
        description: r.description,
        amount: r.amount,
        transaction_type: r.transaction_type,
        transaction_date: r.date,
      }));

      const { data: fnData, error: fnError } = await supabase.functions.invoke("categorise-transactions", {
        body: { transactions: payload },
      });

      if (fnError) throw fnError;
      if (fnData?.error) {
        toast({ title: "AI Error", description: fnData.error, variant: "destructive" });
        // Still go to review without AI cats
        setRows((prev) => prev.map((r) => ({ ...r, category: "Other", approved: false })));
        return;
      }

      const categorised: typeof fnData.categorised = fnData.categorised ?? [];
      setRows((prev) =>
        prev.map((r, idx) => {
          const ai = categorised[idx];
          return {
            ...r,
            ai_suggested_category: ai?.ai_suggested_category ?? "Other",
            is_duplicate_flag: ai?.is_duplicate_flag ?? false,
            confidence: ai?.confidence ?? "low",
            category: ai?.ai_suggested_category ?? "Other",
          };
        })
      );
      toast({ title: "AI categorisation complete", description: "Review and approve each transaction." });
    } catch (err: unknown) {
      console.error(err);
      toast({ title: "AI failed", description: "Proceeding without AI suggestions.", variant: "destructive" });
      setRows((prev) => prev.map((r) => ({ ...r, category: "Other" })));
    } finally {
      setIsAnalysing(false);
    }
  };

  // ── Approve / Reject helpers ─────────────────────────────────────────────
  const approveRow = (id: string) =>
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, approved: true, rejected: false } : r));
  const rejectRow = (id: string) =>
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, rejected: true, approved: false } : r));
  const setCategory = (id: string, cat: string) =>
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, category: cat } : r));
  const approveAll = () => setRows((prev) => prev.map((r) => ({ ...r, approved: true, rejected: false })));
  const rejectAll = () => setRows((prev) => prev.map((r) => ({ ...r, rejected: true, approved: false })));

  const pendingCount = rows.filter((r) => !r.approved && !r.rejected).length;
  const approvedCount = rows.filter((r) => r.approved).length;
  const duplicateCount = rows.filter((r) => r.is_duplicate_flag).length;

  // ── Import to DB ─────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!user) return;
    const toImport = rows.filter((r) => r.approved);
    if (toImport.length === 0) {
      toast({ title: "Nothing to import", description: "Approve at least one transaction.", variant: "destructive" });
      return;
    }
    setIsImporting(true);
    try {
      const inserts = toImport.map((r) => ({
        user_id: user.id,
        account_id: selectedAccountId || null,
        transaction_type: r.transaction_type,
        amount: r.amount,
        description: r.description,
        category: r.category,
        transaction_date: r.date,
        ai_suggested_category: r.ai_suggested_category ?? null,
        is_duplicate_flag: r.is_duplicate_flag ?? false,
        reconcile_status: "categorised",
      }));

      const { error } = await supabase.from("bank_transactions").insert(inserts);
      if (error) throw error;

      // Update account balance if linked
      if (selectedAccountId) {
        const { data: acc } = await supabase
          .from("bank_accounts")
          .select("balance")
          .eq("id", selectedAccountId)
          .single();
        if (acc) {
          let balance = Number(acc.balance);
          for (const r of toImport) {
            if (r.transaction_type === "credit") balance += r.amount;
            else balance -= r.amount;
          }
          await supabase.from("bank_accounts").update({ balance }).eq("id", selectedAccountId);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-transaction-stats"] });

      setImportResult({ imported: toImport.length, skipped: rows.length - toImport.length });
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setRows([]);
    setStep("upload");
    setImportResult(null);
    setShowDuplicates(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Download template ────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const csv = "Date,Description,Amount,Type\n01-01-2025,Sample Credit,50000,Credit\n02-01-2025,Vendor Payment,12000,Debit";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bank_statement_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const confidenceColor = (c?: string) =>
    c === "high" ? "text-success" : c === "medium" ? "text-warning" : "text-muted-foreground";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gradient-primary">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Bank Statement Reconciliation
            </CardTitle>
            <CardDescription>
              Upload a CSV bank statement — AI will auto-categorise every transaction. You review and approve before import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Account selector */}
            <div className="grid gap-2">
              <Label>Link to Bank Account (optional)</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Select account…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — ****{a.account_number.slice(-4)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">Drop CSV file here or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports: Date, Description, Amount, Type columns
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <p className="text-xs text-muted-foreground">
                Need the exact CSV format? Download our template.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Review ── */}
      {step === "review" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{file?.name}</span>
                  </div>
                  <Badge variant="outline">{rows.length} rows</Badge>
                  {isAnalysing ? (
                    <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      AI Analysing…
                    </Badge>
                  ) : (
                    <Badge className="bg-success/10 text-success border-success/20 gap-1">
                      <Sparkles className="h-3 w-3" />
                      AI Done
                    </Badge>
                  )}
                  {duplicateCount > 0 && (
                    <button
                      className="flex items-center gap-1 text-warning hover:underline"
                      onClick={() => setShowDuplicates((s) => !s)}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {duplicateCount} possible duplicates
                      {showDuplicates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {approvedCount} approved · {pendingCount} pending
                  </span>
                  <Button size="sm" variant="outline" onClick={approveAll}>Approve All</Button>
                  <Button size="sm" variant="outline" onClick={rejectAll}>Reject All</Button>
                  <Button size="sm" variant="outline" onClick={reset}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={isImporting || approvedCount === 0 || isAnalysing}
                  >
                    {isImporting ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
                    ) : (
                      `Import ${approvedCount} Transactions`
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="glass-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-28 text-right">Amount</TableHead>
                      <TableHead className="w-20">Type</TableHead>
                      <TableHead className="w-48">Category</TableHead>
                      <TableHead className="w-24">AI Confidence</TableHead>
                      <TableHead className="w-28 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {rows.map((row) => {
                        const isDupe = row.is_duplicate_flag && showDuplicates;
                        return (
                          <motion.tr
                            key={row._id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`border-b transition-colors ${
                              row.approved
                                ? "bg-success/5"
                                : row.rejected
                                ? "bg-destructive/5 opacity-50"
                                : isDupe
                                ? "bg-warning/5"
                                : ""
                            }`}
                          >
                            <TableCell className="text-xs font-mono">{row.date}</TableCell>
                            <TableCell className="max-w-[260px]">
                              <p className="truncate text-sm">{row.description}</p>
                              {row.is_duplicate_flag && (
                                <Badge variant="outline" className="text-warning border-warning/30 text-[10px] mt-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />possible duplicate
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              ₹{row.amount.toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  row.transaction_type === "credit"
                                    ? "text-success border-success/30 bg-success/10"
                                    : "text-destructive border-destructive/30 bg-destructive/10"
                                }
                              >
                                {row.transaction_type === "credit" ? "Credit" : "Debit"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={row.category}
                                onValueChange={(v) => setCategory(row._id, v)}
                                disabled={row.rejected}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {isAnalysing ? (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              ) : (
                                <span className={`text-xs font-medium capitalize ${confidenceColor(row.confidence)}`}>
                                  {row.confidence ?? "—"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant={row.approved ? "default" : "outline"}
                                  className={`h-7 w-7 ${row.approved ? "bg-success hover:bg-success/80 border-success" : ""}`}
                                  onClick={() => approveRow(row._id)}
                                  disabled={isAnalysing}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant={row.rejected ? "destructive" : "outline"}
                                  className="h-7 w-7"
                                  onClick={() => rejectRow(row._id)}
                                  disabled={isAnalysing}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 3: Done ── */}
      {step === "done" && importResult && (
        <Card className="glass-card">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-14 w-14 text-success" />
            <h3 className="text-xl font-bold">Import Complete</h3>
            <p className="text-muted-foreground">
              <span className="text-success font-semibold">{importResult.imported} transactions</span> imported successfully.
              {importResult.skipped > 0 && (
                <> <span className="text-muted-foreground">{importResult.skipped} were skipped.</span></>
              )}
            </p>
            <Button onClick={reset}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Another Statement
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
