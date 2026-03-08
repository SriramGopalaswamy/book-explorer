import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, ArrowRightLeft, Globe, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { useCurrencies, useExchangeRates, useCreateExchangeRate } from "@/hooks/useCurrencyAndFiling";
import { useFinancialData } from "@/hooks/useFinancialData";
import { format } from "date-fns";

export default function ExchangeRatesPage() {
  const { data: currencies = [], isLoading: curLoading } = useCurrencies();
  const { data: rates = [], isLoading: rateLoading } = useExchangeRates();
  const createRate = useCreateExchangeRate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_currency: "USD", to_currency: "INR", rate: "", effective_date: new Date().toISOString().split("T")[0] });

  const handleCreate = () => {
    if (!form.rate) return;
    createRate.mutate({ ...form, rate: Number(form.rate) }, { onSuccess: () => { setOpen(false); setForm({ from_currency: "USD", to_currency: "INR", rate: "", effective_date: new Date().toISOString().split("T")[0] }); } });
  };

  const isLoading = curLoading || rateLoading;
  if (isLoading) return <MainLayout title="Exchange Rates"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></MainLayout>;

  return (
    <MainLayout title="Exchange Rates">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Multi-Currency & Exchange Rates</h1>
            <p className="text-muted-foreground">Manage currencies and conversion rates for international transactions</p>
          </div>
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
                    {currencies.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono font-semibold text-foreground">{c.code}</TableCell>
                        <TableCell className="text-foreground">{c.name}</TableCell>
                        <TableCell className="text-lg text-foreground">{c.symbol}</TableCell>
                        <TableCell className="text-foreground">{c.decimal_places}</TableCell>
                        <TableCell><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge></TableCell>
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
