import { useState, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, ArrowRightLeft, Globe, TrendingUp, TrendingDown, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { useCurrencies, useExchangeRates, useCreateExchangeRate } from "@/hooks/useCurrencyAndFiling";
import { useFinancialRecords } from "@/hooks/useFinancialData";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { format } from "date-fns";

interface UnrealizedFXLine {
  id: string;
  description: string;
  currency: string;
  originalAmount: number;
  bookRate: number;
  bookValueINR: number;
  currentRate: number;
  currentValueINR: number;
  unrealizedGainLoss: number;
}

export default function ExchangeRatesPage() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const queryClient = useQueryClient();
  const { data: currencies = [], isLoading: curLoading } = useCurrencies();
  // Load ALL currencies (including inactive) specifically for the currencies management tab
  const { data: allCurrencies = [], isLoading: allCurLoading } = useQuery({
    queryKey: ["currencies-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies" as any).select("*").order("code");
      if (error) throw error;
      return (data || []) as unknown as import("@/hooks/useCurrencyAndFiling").Currency[];
    },
  });
  const { data: rates = [], isLoading: rateLoading } = useExchangeRates();
  const { data: financialRecords = [] } = useFinancialRecords();
  const createRate = useCreateExchangeRate();

  const toggleCurrency = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("currencies" as any).update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] });
      queryClient.invalidateQueries({ queryKey: ["currencies-all"] });
    },
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_currency: "USD", to_currency: "INR", rate: "", effective_date: new Date().toISOString().split("T")[0] });

  const [fetchingLive, setFetchingLive] = useState(false);
  const [liveRateError, setLiveRateError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!form.rate) return;
    if (!orgId) { toast.error("Organization not found"); return; }
    createRate.mutate({ ...form, rate: Number(form.rate) }, { onSuccess: () => { setOpen(false); setForm({ from_currency: "USD", to_currency: "INR", rate: "", effective_date: new Date().toISOString().split("T")[0] }); } });
  };

  const fetchLiveRates = useCallback(async () => {
    if (!orgId) { toast.error("Organization not found"); return; }
    setFetchingLive(true);
    setLiveRateError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let res: Response;
      try {
        res = await fetch("https://api.frankfurter.app/latest?base=USD", { signal: controller.signal });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === "AbortError") throw new Error("Request timed out. Please check your internet connection and try again.");
        throw new Error("Network error: Unable to reach the exchange rate service. Please check your connection.");
      }
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Exchange rate service returned an error (HTTP ${res.status}). Please try again later.`);
      const json = await res.json();
      if (!json.rates) throw new Error("Invalid response from exchange rate service.");
      const today = new Date().toISOString().split("T")[0];
      const toCodes = Object.keys(json.rates);
      const interesting = toCodes.filter((c) => ["INR", "EUR", "GBP", "JPY", "AED", "SGD"].includes(c));
      if (interesting.length === 0) throw new Error("No relevant currencies found in the live rate response.");
      let saved = 0;
      for (const to of interesting) {
        try {
          await createRate.mutateAsync({ from_currency: "USD", to_currency: to, rate: json.rates[to], effective_date: today });
          saved++;
        } catch {
          // skip individual currency failures, continue with rest
        }
      }
      if (saved === 0) throw new Error("Failed to save any live rates. Please try again.");
      toast.success(`Fetched live rates for ${saved} currencies (USD base) as of today.`);
    } catch (e: any) {
      const msg = e.message || "Failed to fetch live rates. Please try again.";
      setLiveRateError(msg);
      toast.error(msg);
    } finally {
      setFetchingLive(false);
    }
  }, [createRate, orgId]);

  // IAS 21: Compute unrealized FX gain/loss for foreign-currency financial records
  const unrealizedLines = useMemo<UnrealizedFXLine[]>(() => {
    // Build a map of latest rates per currency pair → INR
    const latestRates: Record<string, number> = {};
    const sortedRates = [...rates].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    for (const r of sortedRates) {
      const key = `${r.from_currency}_${r.to_currency}`;
      if (!latestRates[key]) latestRates[key] = Number(r.rate);
    }

    // Filter financial records with foreign currency
    const foreignRecords = financialRecords.filter(
      (rec: any) => rec.currency_code && rec.currency_code !== "INR" && rec.exchange_rate
    );

    return foreignRecords.map((rec: any) => {
      const bookRate = Number(rec.exchange_rate) || 1;
      const amount = Number(rec.amount) || 0;
      const bookValueINR = amount * bookRate;
      const currentRate = latestRates[`${rec.currency_code}_INR`] || bookRate;
      const currentValueINR = amount * currentRate;
      const unrealizedGainLoss = currentValueINR - bookValueINR;

      return {
        id: rec.id,
        description: rec.description || rec.reference_number || "Transaction",
        currency: rec.currency_code,
        originalAmount: amount,
        bookRate,
        bookValueINR,
        currentRate,
        currentValueINR,
        unrealizedGainLoss,
      };
    });
  }, [financialRecords, rates]);

  const totalUnrealizedGL = unrealizedLines.reduce((sum, l) => sum + l.unrealizedGainLoss, 0);

  const isLoading = curLoading || rateLoading || allCurLoading;
  if (isLoading) return <MainLayout title="Exchange Rates"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Exchange Rates">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchLiveRates} disabled={fetchingLive}>
              <RefreshCw className={`h-4 w-4 mr-2 ${fetchingLive ? "animate-spin" : ""}`} />
              {fetchingLive ? "Fetching…" : "Fetch Live Rates"}
            </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Rate</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Exchange Rate</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>From Currency</Label>
                    <Select value={form.from_currency} onValueChange={v => setForm(p => ({ ...p, from_currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>To Currency</Label>
                    <Select value={form.to_currency} onValueChange={v => setForm(p => ({ ...p, to_currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Exchange Rate</Label><Input type="number" step="0.0001" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} placeholder="e.g. 83.50" /></div>
                  <div><Label>Effective Date</Label><Input type="date" value={form.effective_date} onChange={e => setForm(p => ({ ...p, effective_date: e.target.value }))} /></div>
                </div>
                <Button onClick={handleCreate} disabled={createRate.isPending} className="w-full">{createRate.isPending ? "Saving..." : "Save Rate"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
        {liveRateError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Live rate fetch failed: {liveRateError}
          </div>
        )}

        <Tabs defaultValue="rates">
          <TabsList>
            <TabsTrigger value="rates"><ArrowRightLeft className="h-4 w-4 mr-1" />Exchange Rates</TabsTrigger>
            <TabsTrigger value="unrealized"><TrendingUp className="h-4 w-4 mr-1" />Unrealized FX Gain/Loss</TabsTrigger>
            <TabsTrigger value="currencies"><Globe className="h-4 w-4 mr-1" />Currencies</TabsTrigger>
          </TabsList>

          <TabsContent value="rates">
            <Card>
              <CardHeader><CardTitle>Configured Exchange Rates</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-foreground">{r.from_currency}</TableCell>
                        <TableCell className="font-mono text-foreground">{r.to_currency}</TableCell>
                        <TableCell className="text-right font-medium text-foreground">{Number(r.rate).toFixed(4)}</TableCell>
                        <TableCell className="text-foreground">{format(new Date(r.effective_date), "dd MMM yyyy")}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{r.source}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {rates.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No exchange rates configured. Add rates for multi-currency transactions.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* IAS 21 Unrealized FX Gain/Loss */}
          <TabsContent value="unrealized">
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>IAS 21 — Effects of Changes in Foreign Exchange Rates</AlertTitle>
                <AlertDescription>
                  Open monetary items denominated in foreign currencies are revalued at the closing rate.
                  Unrealized gains/losses are recognized in profit or loss per IAS 21.28.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Foreign Currency Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{unrealizedLines.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Net Unrealized FX Gain/Loss</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold flex items-center gap-2 ${totalUnrealizedGL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {totalUnrealizedGL >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      ₹{Math.abs(totalUnrealizedGL).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{totalUnrealizedGL >= 0 ? "Gain" : "Loss"} (to be recognized in P&L)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Reporting Standard</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline" className="text-sm">IAS 21 / Ind AS 21</Badge>
                    <p className="text-xs text-muted-foreground mt-1">Closing rate method applied</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Open Foreign Currency Monetary Items</CardTitle>
                  <CardDescription>Revalued at the latest closing rate per IAS 21.23(a)</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">FC Amount</TableHead>
                        <TableHead className="text-right">Book Rate</TableHead>
                        <TableHead className="text-right">Book Value (₹)</TableHead>
                        <TableHead className="text-right">Closing Rate</TableHead>
                        <TableHead className="text-right">Revalued (₹)</TableHead>
                        <TableHead className="text-right">Unrealized G/L (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unrealizedLines.map(line => (
                        <TableRow key={line.id}>
                          <TableCell className="text-foreground max-w-48 truncate">{line.description}</TableCell>
                          <TableCell className="font-mono text-foreground">{line.currency}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">{line.originalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{line.bookRate.toFixed(4)}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">₹{line.bookValueINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{line.currentRate.toFixed(4)}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">₹{line.currentValueINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${line.unrealizedGainLoss >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {line.unrealizedGainLoss >= 0 ? "+" : ""}₹{line.unrealizedGainLoss.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                      {unrealizedLines.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No open foreign currency monetary items. Records appear here when financial transactions are created in the Accounting module with a non-INR currency and an exchange rate.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="currencies">
            <Card>
              <CardHeader><CardTitle>Supported Currencies</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Decimals</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCurrencies.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono font-semibold text-foreground">{c.code}</TableCell>
                        <TableCell className="text-foreground">{c.name}</TableCell>
                        <TableCell className="text-lg text-foreground">{c.symbol}</TableCell>
                        <TableCell className="text-foreground">{c.decimal_places}</TableCell>
                        <TableCell>
                          <Switch
                            checked={c.is_active}
                            onCheckedChange={() => toggleCurrency.mutate({ id: c.id, is_active: c.is_active })}
                            disabled={toggleCurrency.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
