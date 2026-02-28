import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { useGLAccounts, useJournalEntries, type GLAccount, type JournalEntryWithLines } from "@/hooks/useLedger";
import { useIsFinance } from "@/hooks/useRoles";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";
import { Search, Loader2, BookOpen, ArrowRight, ShieldAlert, Lock } from "lucide-react";

function formatAmount(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function LedgerExplorer() {
  const { data: hasAccess, isLoading: checkingRole } = useIsFinance();
  const { data: accounts = [], isLoading: loadingAccounts } = useGLAccounts();
  const { data: entries = [], isLoading: loadingEntries } = useJournalEntries();

  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryWithLines | null>(null);

  // Compute running balance per account
  const accountLedger = useMemo(() => {
    if (selectedAccount === "all" || !entries.length) return [];

    const acct = accounts.find(a => a.id === selectedAccount);
    if (!acct) return [];

    const relevantEntries = entries
      .filter(e => e.journal_lines.some(l => l.gl_account_id === selectedAccount))
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));

    let runningBalance = 0;
    return relevantEntries.map(entry => {
      const lines = entry.journal_lines.filter(l => l.gl_account_id === selectedAccount);
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

      // Normal balance: debit accounts increase with debits, credit accounts increase with credits
      if (acct.normal_balance === "debit") {
        runningBalance += totalDebit - totalCredit;
      } else {
        runningBalance += totalCredit - totalDebit;
      }

      return {
        entry,
        debit: totalDebit,
        credit: totalCredit,
        runningBalance,
        description: lines.map(l => l.description).filter(Boolean).join("; ") || entry.memo,
      };
    });
  }, [selectedAccount, entries, accounts]);

  // Account summary for "all" view
  const accountSummaries = useMemo(() => {
    return accounts.map(acct => {
      const relatedLines = entries.flatMap(e => e.journal_lines.filter(l => l.gl_account_id === acct.id));
      const totalDebit = relatedLines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = relatedLines.reduce((s, l) => s + l.credit, 0);
      const balance = acct.normal_balance === "debit" ? totalDebit - totalCredit : totalCredit - totalDebit;
      return { ...acct, totalDebit, totalCredit, balance, txCount: relatedLines.length };
    }).filter(a => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      const matchType = typeFilter === "all" || a.account_type === typeFilter;
      return matchSearch && matchType;
    });
  }, [accounts, entries, searchQuery, typeFilter]);

  const summaryPagination = usePagination(accountSummaries, 20);
  const ledgerPagination = usePagination(accountLedger, 20);

  if (checkingRole) return <MainLayout title="Ledger Explorer"><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin" /></div></MainLayout>;
  if (!hasAccess) return <AccessDenied message="Finance Access Required" description="You need finance or admin role to access the Ledger Explorer." />;

  const accountTypes = [...new Set(accounts.map(a => a.account_type))].sort();

  return (
    <MainLayout title="Ledger Explorer" subtitle="Drill down from GL accounts to journal entries and source documents">
      <div className="space-y-6 animate-fade-in">
        <OnboardingBanner />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedAccount} onValueChange={v => { setSelectedAccount(v); pagination.setPage(1); }}>
            <SelectTrigger className="w-[300px]"><SelectValue placeholder="Select GL Account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts (Summary)</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-mono">{a.code}</span> — {a.name}
                  {a.is_control_account && " ⚠"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedAccount === "all" && (
            <>
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search accounts…" className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); pagination.setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {accountTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* Content */}
        <div className="rounded-xl border bg-card shadow-card">
          {(loadingAccounts || loadingEntries) ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : selectedAccount === "all" ? (
            /* Account Summary Table */
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Txns</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pagination.paginatedItems as typeof accountSummaries).map(a => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => { setSelectedAccount(a.id); pagination.setPage(1); }}>
                      <TableCell className="font-mono text-xs">{a.code}</TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{a.account_type}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{a.totalDebit > 0 ? formatAmount(a.totalDebit) : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{a.totalCredit > 0 ? formatAmount(a.totalCredit) : "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatAmount(a.balance)}</TableCell>
                      <TableCell className="text-center">{a.txCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {a.is_control_account && <Badge variant="outline" className="text-xs text-amber-600"><ShieldAlert className="h-3 w-3 mr-1" />Control</Badge>}
                          {a.is_locked && <Badge variant="outline" className="text-xs"><Lock className="h-3 w-3 mr-1" />Locked</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination {...pagination} />
            </>
          ) : (
            /* Account Ledger Detail */
            <>
              {accountLedger.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BookOpen className="h-10 w-10 mb-2 opacity-40" />
                  <p>No transactions in this account</p>
                </div>
              ) : (
                <>
                  <div className="px-6 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedAccount("all")}>← All Accounts</Button>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{accounts.find(a => a.id === selectedAccount)?.code} — {accounts.find(a => a.id === selectedAccount)?.name}</span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Seq #</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(pagination.paginatedItems as typeof accountLedger).map((item, i) => (
                        <TableRow key={item.entry.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setSelectedEntry(item.entry)}>
                          <TableCell>{item.entry.entry_date}</TableCell>
                          <TableCell className="font-mono text-xs">{item.entry.document_sequence_number || "—"}</TableCell>
                          <TableCell className="max-w-[250px] truncate">{item.description || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{item.entry.source_type}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{item.debit > 0 ? formatAmount(item.debit) : ""}</TableCell>
                          <TableCell className="text-right font-mono">{item.credit > 0 ? formatAmount(item.credit) : ""}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{formatAmount(item.runningBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination {...pagination} />
                </>
              )}
            </>
          )}
        </div>

        {/* Entry detail drill-down */}
        <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Journal Entry: {selectedEntry?.document_sequence_number}</DialogTitle>
              <DialogDescription>{selectedEntry?.memo}</DialogDescription>
            </DialogHeader>
            {selectedEntry && (
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
                  {selectedEntry.journal_lines.map(line => {
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
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
