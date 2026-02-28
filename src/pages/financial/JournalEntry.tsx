import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { useGLAccounts, useJournalEntries, usePostJournal, useReverseJournal, useFiscalPeriods } from "@/hooks/useLedger";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";
import { Plus, Trash2, AlertTriangle, CheckCircle, RotateCcw, Loader2, Search, Filter, Lock, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface JournalLineForm {
  gl_account_id: string;
  debit: string;
  credit: string;
  description: string;
  cost_center: string;
  department: string;
}

const emptyLine = (): JournalLineForm => ({
  gl_account_id: "", debit: "", credit: "", description: "", cost_center: "", department: "",
});

function formatAmount(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function JournalEntry() {
  const { data: hasAccess, isLoading: checkingRole } = useIsFinance();
  const { data: accounts = [] } = useGLAccounts();
  const { data: entries = [], isLoading } = useJournalEntries();
  const { data: periods = [] } = useFiscalPeriods();
  const postJournal = usePostJournal();
  const reverseJournal = useReverseJournal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [lines, setLines] = useState<JournalLineForm[]>([emptyLine(), emptyLine()]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailEntry, setDetailEntry] = useState<any>(null);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const controlAccountWarnings = lines.filter(l => {
    const acct = accounts.find(a => a.id === l.gl_account_id);
    return acct?.is_control_account;
  });

  const periodWarning = useMemo(() => {
    const period = periods.find(p => entryDate >= p.start_date && entryDate <= p.end_date);
    return period?.status !== "open" ? period : null;
  }, [entryDate, periods]);

  const addLine = () => setLines([...lines, emptyLine()]);
  const removeLine = (i: number) => { if (lines.length > 2) setLines(lines.filter((_, j) => j !== i)); };
  const updateLine = (i: number, field: keyof JournalLineForm, value: string) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    // If entering debit, clear credit and vice versa
    if (field === "debit" && value) updated[i].credit = "";
    if (field === "credit" && value) updated[i].debit = "";
    setLines(updated);
  };

  const handlePost = () => {
    if (!isBalanced) { toast.error("Journal must be balanced"); return; }
    if (!memo.trim()) { toast.error("Memo is required"); return; }
    if (controlAccountWarnings.length > 0) {
      toast.error("Cannot post manual journal to control accounts");
      return;
    }

    postJournal.mutate({
      date: entryDate,
      memo,
      lines: lines.filter(l => l.gl_account_id).map(l => ({
        gl_account_id: l.gl_account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || undefined,
        cost_center: l.cost_center || undefined,
        department: l.department || undefined,
      })),
    }, {
      onSuccess: () => {
        setDialogOpen(false);
        setLines([emptyLine(), emptyLine()]);
        setMemo("");
      },
    });
  };

  const filteredEntries = entries.filter(e => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || (e.memo || "").toLowerCase().includes(q) || (e.source_type || "").toLowerCase().includes(q) || (e.document_sequence_number || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pagination = usePagination(filteredEntries, 15);

  if (checkingRole) return <MainLayout title="Journal Entry"><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin" /></div></MainLayout>;
  if (!hasAccess) return <AccessDenied message="Finance Access Required" description="You need finance or admin role to access the Journal Entry module." />;

  const statusColor = (s: string) => {
    switch (s) {
      case "posted": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "locked": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "reversed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "draft": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <MainLayout title="Journal Entry" subtitle="Double-entry ledger management with integrity controls">
      <div className="space-y-6 animate-fade-in">
        <OnboardingBanner />

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">{entries.length}</div><p className="text-sm text-muted-foreground">Total Entries</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-emerald-600">{entries.filter(e => e.status === "posted").length}</div><p className="text-sm text-muted-foreground">Posted</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600">{entries.filter(e => e.status === "locked").length}</div><p className="text-sm text-muted-foreground">Locked</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-600">{entries.filter(e => e.status === "reversed").length}</div><p className="text-sm text-muted-foreground">Reversed</p></CardContent></Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search memo, sequence…" className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
              <SelectItem value="reversed">Reversed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-gradient-financial text-white ml-auto" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Journal Entry
          </Button>
        </div>

        {/* Journal entries table */}
        <div className="rounded-xl border bg-card shadow-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>No journal entries found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seq #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Memo</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((entry) => {
                    const total = entry.journal_lines.reduce((s, l) => s + l.debit, 0);
                    return (
                      <TableRow key={entry.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setDetailEntry(entry)}>
                        <TableCell className="font-mono text-xs">{entry.document_sequence_number || "—"}</TableCell>
                        <TableCell>{entry.entry_date}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{entry.memo || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{entry.source_type}</Badge></TableCell>
                        <TableCell><Badge className={statusColor(entry.status)}>{entry.status}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{formatAmount(total)}</TableCell>
                        <TableCell>
                          {entry.status === "posted" && !entry.is_reversal && (
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reverseJournal.mutate(entry.id); }}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status === "locked" && <Lock className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination {...pagination} />
            </>
          )}
        </div>

        {/* Detail dialog */}
        <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Journal Entry: {detailEntry?.document_sequence_number}</DialogTitle>
              <DialogDescription>{detailEntry?.memo}</DialogDescription>
            </DialogHeader>
            {detailEntry && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Date:</span> {detailEntry.entry_date}</div>
                  <div><span className="text-muted-foreground">Source:</span> {detailEntry.source_type}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColor(detailEntry.status)}>{detailEntry.status}</Badge></div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailEntry.journal_lines.map((line: any) => {
                      const acct = accounts.find(a => a.id === line.gl_account_id);
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs">{acct ? `${acct.code} - ${acct.name}` : line.gl_account_id}</TableCell>
                          <TableCell>{line.description || "—"}</TableCell>
                          <TableCell className="text-right">{line.debit > 0 ? formatAmount(line.debit) : ""}</TableCell>
                          <TableCell className="text-right">{line.credit > 0 ? formatAmount(line.credit) : ""}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-semibold border-t-2">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">{formatAmount(detailEntry.journal_lines.reduce((s: number, l: any) => s + l.debit, 0))}</TableCell>
                      <TableCell className="text-right">{formatAmount(detailEntry.journal_lines.reduce((s: number, l: any) => s + l.credit, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* New Journal Entry Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Journal Entry</DialogTitle>
              <DialogDescription>Create a balanced double-entry journal entry</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Warnings */}
              {controlAccountWarnings.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  <span>Control account(s) selected — manual journals to control accounts are blocked.</span>
                </div>
              )}
              {periodWarning && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                  <Lock className="h-4 w-4 flex-shrink-0" />
                  <span>Period "{periodWarning.period_name}" is {periodWarning.status}. Journal cannot be posted to a closed period.</span>
                </div>
              )}

              {/* Header fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Entry Date</Label>
                  <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                </div>
                <div>
                  <Label>Memo *</Label>
                  <Textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="Describe this journal entry" rows={1} />
                </div>
              </div>

              {/* Lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Journal Lines</Label>
                  <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add Line</Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Account</TableHead>
                      <TableHead className="w-[20%]">Description</TableHead>
                      <TableHead className="w-[15%] text-right">Debit</TableHead>
                      <TableHead className="w-[15%] text-right">Credit</TableHead>
                      <TableHead className="w-[10%]">Cost Center</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, i) => {
                      const selectedAcct = accounts.find(a => a.id === line.gl_account_id);
                      const isControl = selectedAcct?.is_control_account;
                      return (
                        <TableRow key={i} className={isControl ? "bg-destructive/5" : ""}>
                          <TableCell>
                            <Select value={line.gl_account_id} onValueChange={v => updateLine(i, "gl_account_id", v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts.map(a => (
                                  <SelectItem key={a.id} value={a.id}>
                                    <span className="font-mono">{a.code}</span> — {a.name}
                                    {a.is_control_account && <span className="text-destructive ml-1">⚠</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input className="h-8 text-xs" value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Line desc" /></TableCell>
                          <TableCell><Input className="h-8 text-xs text-right" type="number" min="0" step="0.01" value={line.debit} onChange={e => updateLine(i, "debit", e.target.value)} placeholder="0.00" /></TableCell>
                          <TableCell><Input className="h-8 text-xs text-right" type="number" min="0" step="0.01" value={line.credit} onChange={e => updateLine(i, "credit", e.target.value)} placeholder="0.00" /></TableCell>
                          <TableCell><Input className="h-8 text-xs" value={line.cost_center} onChange={e => updateLine(i, "cost_center", e.target.value)} placeholder="—" /></TableCell>
                          <TableCell>
                            {lines.length > 2 && (
                              <Button variant="ghost" size="sm" onClick={() => removeLine(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-semibold border-t-2">
                      <TableCell colSpan={2}>
                        <div className="flex items-center gap-2">
                          Total
                          {isBalanced ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                              <CheckCircle className="h-3 w-3 mr-1" /> Balanced
                            </Badge>
                          ) : totalDebit > 0 || totalCredit > 0 ? (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Unbalanced (Δ {formatAmount(Math.abs(totalDebit - totalCredit))})
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatAmount(totalDebit)}</TableCell>
                      <TableCell className="text-right">{formatAmount(totalCredit)}</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handlePost}
                disabled={!isBalanced || postJournal.isPending || controlAccountWarnings.length > 0 || !!periodWarning}
                className="bg-gradient-financial text-white"
              >
                {postJournal.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Post Journal Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
