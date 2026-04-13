import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Database, Loader2, RefreshCw, Search, ArrowUpDown, ArrowDown, ArrowUp,
  Download, Activity, Link2, AlertTriangle, CheckCircle2, HardDrive, Columns3, FileCode2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TableInfo {
  table_name: string;
  schema_name: string;
  row_count: number;
  estimated_size: string;
  estimated_size_bytes: number;
  column_count: number;
  index_count: number;
  columns: { name: string; data_type: string; is_nullable: string; column_default: string | null; ordinal_position: number }[];
  primary_keys: string[] | null;
  indexes: { index_name: string; index_def: string }[] | null;
}

interface Relation {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}

interface HealthData {
  total_tables: number;
  large_tables: { table_name: string; row_count: number }[] | null;
  tables_without_indexes: string[] | null;
  total_size: string;
  total_size_bytes: number;
}

type SortKey = "table_name" | "row_count" | "column_count" | "index_count" | "estimated_size_bytes";
type SortDir = "asc" | "desc";

export default function PlatformDbInspector() {
  const [loading, setLoading] = useState(false);
  const [dumpLoading, setDumpLoading] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [inspectedAt, setInspectedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("row_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  const fetchData = async (action = "full") => {
    setLoading(true);
    try {
      const resp = await supabase.functions.invoke("db-inspector?action=" + action);

      if (resp.error) throw new Error(resp.error.message || "Failed to fetch");
      const result = resp.data;

      if (action === "full" || action === "report") {
        setTables(result.tables || []);
        setRelations(result.relations || []);
        setHealth(result.health || null);
        setInspectedAt(result.inspected_at);
        if (result.report_html) setReportHtml(result.report_html);
      }
      toast.success("Database inspection complete");
    } catch (err) {
      toast.error(`Inspection failed: ${(err as Error).message}`);
    }
    setLoading(false);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const filteredTables = useMemo(() => {
    let list = [...tables];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.table_name.toLowerCase().includes(s));
    }
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (Number(av) - Number(bv)) : (Number(bv) - Number(av));
    });
    return list;
  }, [tables, search, sortKey, sortDir]);

  const totalRows = tables.reduce((s, t) => s + (t.row_count || 0), 0);

  const downloadReport = async () => {
    setLoading(true);
    try {
      const resp = await supabase.functions.invoke("db-inspector?action=report");
      if (resp.error) throw new Error(resp.error.message);
      const html = resp.data.report_html;
      if (html) {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `db-report-${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Report downloaded");
      }

      // Also download JSON
      const jsonBlob = new Blob([JSON.stringify(resp.data, null, 2)], { type: "application/json" });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const a2 = document.createElement("a");
      a2.href = jsonUrl;
      a2.download = `db-report-${new Date().toISOString().slice(0, 10)}.json`;
      a2.click();
      URL.revokeObjectURL(jsonUrl);
    } catch (err) {
      toast.error(`Report generation failed: ${(err as Error).message}`);
    }
    setLoading(false);
  };

  const downloadSqlDump = async () => {
    setDumpLoading(true);
    try {
      const resp = await supabase.functions.invoke("db-inspector?action=dump");
      if (resp.error) throw new Error(resp.error.message);

      // The response data is the raw SQL string
      const sqlContent = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
      const blob = new Blob([sqlContent], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grx10-dump-${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("SQL dump downloaded successfully");
    } catch (err) {
      toast.error(`SQL dump failed: ${(err as Error).message}`);
    }
    setDumpLoading(false);
  };

  // Group relations by source table for the relationship view
  const relationsBySource = useMemo(() => {
    const map: Record<string, Relation[]> = {};
    relations.forEach(r => {
      (map[r.source_table] ??= []).push(r);
    });
    return map;
  }, [relations]);

  return (
    <MainLayout title="Database Structure & Statistics" subtitle="Read-only database observability dashboard">
      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <Database className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold text-foreground">{tables.length || "—"}</div>
            <p className="text-xs text-muted-foreground">Tables</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <HardDrive className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold text-foreground">{totalRows ? totalRows.toLocaleString() : "—"}</div>
            <p className="text-xs text-muted-foreground">Total Rows</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Columns3 className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold text-foreground">{tables.length ? tables.reduce((s, t) => s + t.column_count, 0) : "—"}</div>
            <p className="text-xs text-muted-foreground">Total Columns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Link2 className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold text-foreground">{relations.length || "—"}</div>
            <p className="text-xs text-muted-foreground">Foreign Keys</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Activity className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold text-foreground">{health?.total_size || "—"}</div>
            <p className="text-xs text-muted-foreground">Total Size</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mb-6">
        <Button onClick={() => fetchData("full")} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {loading ? "Inspecting…" : "Inspect Database"}
        </Button>
        <Button variant="outline" onClick={downloadReport} disabled={loading || tables.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
        <Button variant="outline" onClick={downloadSqlDump} disabled={dumpLoading}>
          {dumpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileCode2 className="h-4 w-4 mr-2" />}
          {dumpLoading ? "Generating Dump…" : "Download SQL Dump"}
        </Button>
        {inspectedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Last inspected: {new Date(inspectedAt).toLocaleString()}
          </span>
        )}
      </div>

      {tables.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Click "Inspect Database" to load the full database structure</p>
            <p className="text-xs mt-1">Read-only · No data is modified</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="tables" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="relations">Relationships</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          {/* TABLES TAB */}
          <TabsContent value="tables" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Filter tables…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <span className="text-sm text-muted-foreground">{filteredTables.length} tables</span>
            </div>

            <Card className="overflow-hidden">
              <div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("table_name")}>
                        <span className="flex items-center">Table <SortIcon col="table_name" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("row_count")}>
                        <span className="flex items-center justify-end">Rows <SortIcon col="row_count" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("column_count")}>
                        <span className="flex items-center justify-end">Columns <SortIcon col="column_count" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("index_count")}>
                        <span className="flex items-center justify-end">Indexes <SortIcon col="index_count" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("estimated_size_bytes")}>
                        <span className="flex items-center justify-end">Size <SortIcon col="estimated_size_bytes" /></span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTables.map(t => (
                      <TableRow
                        key={t.table_name}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedTable(t)}
                      >
                        <TableCell className="font-mono text-sm text-foreground">{t.table_name}</TableCell>
                        <TableCell className="text-right text-foreground">
                          {(t.row_count || 0).toLocaleString()}
                          {t.row_count > 100000 && <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-500" />}
                        </TableCell>
                        <TableCell className="text-right text-foreground">{t.column_count}</TableCell>
                        <TableCell className="text-right text-foreground">
                          {t.index_count}
                          {t.index_count === 0 && <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />}
                        </TableCell>
                        <TableCell className="text-right text-foreground">{t.estimated_size}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* RELATIONSHIPS TAB */}
          <TabsContent value="relations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Foreign Key Dependencies ({relations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {Object.entries(relationsBySource)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([source, rels]) => (
                      <div key={source} className="border border-border rounded-lg p-3">
                        <div className="font-mono text-sm font-semibold text-foreground mb-2">{source}</div>
                        <div className="space-y-1 pl-4">
                          {rels.map(r => (
                            <div key={r.constraint_name} className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground font-mono">{r.source_column}</span>
                              <span className="text-primary">→</span>
                              <span className="font-mono text-foreground">{r.target_table}</span>
                              <span className="text-muted-foreground font-mono">({r.target_column})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HEALTH TAB */}
          <TabsContent value="health" className="space-y-4">
            {health && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Large Tables (&gt;100k rows)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {health.large_tables && health.large_tables.length > 0 ? (
                      <div className="space-y-2">
                        {health.large_tables.map(t => (
                          <div key={t.table_name} className="flex justify-between items-center p-2 rounded bg-muted/30">
                            <span className="font-mono text-sm text-foreground">{t.table_name}</span>
                            <Badge variant="destructive">{t.row_count.toLocaleString()} rows</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" />
                        No tables exceed 100k rows
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Tables Without Indexes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {health.tables_without_indexes && health.tables_without_indexes.length > 0 ? (
                      <div className="space-y-2">
                        {health.tables_without_indexes.map(name => (
                          <div key={name} className="p-2 rounded bg-muted/30 font-mono text-sm text-foreground">
                            {name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" />
                        All tables have indexes
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm">Top 10 Tables by Size</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[...tables]
                        .sort((a, b) => (b.estimated_size_bytes || 0) - (a.estimated_size_bytes || 0))
                        .slice(0, 10)
                        .map(t => {
                          const maxSize = tables[0]?.estimated_size_bytes || 1;
                          const pct = Math.max(5, ((t.estimated_size_bytes || 0) / (maxSize || 1)) * 100);
                          return (
                            <div key={t.table_name} className="flex items-center gap-3">
                              <span className="font-mono text-xs text-foreground w-48 truncate">{t.table_name}</span>
                              <div className="flex-1 h-4 rounded bg-muted/30 overflow-hidden">
                                <div className="h-full bg-primary/60 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-20 text-right">{t.estimated_size}</span>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Table Detail Dialog */}
      <Dialog open={!!selectedTable} onOpenChange={() => setSelectedTable(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedTable && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{selectedTable.table_name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-foreground">{(selectedTable.row_count || 0).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Rows</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-foreground">{selectedTable.column_count}</div>
                    <div className="text-xs text-muted-foreground">Columns</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-foreground">{selectedTable.index_count}</div>
                    <div className="text-xs text-muted-foreground">Indexes</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-foreground">{selectedTable.estimated_size}</div>
                    <div className="text-xs text-muted-foreground">Size</div>
                  </div>
                </div>

                {/* Primary Keys */}
                {selectedTable.primary_keys && selectedTable.primary_keys.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-1">Primary Keys</h4>
                    <div className="flex gap-1 flex-wrap">
                      {selectedTable.primary_keys.map(pk => (
                        <Badge key={pk} variant="secondary" className="font-mono text-xs">{pk}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Columns */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Columns</h4>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Nullable</TableHead>
                          <TableHead className="text-xs">Default</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(selectedTable.columns || []).map(col => (
                          <TableRow key={col.name}>
                            <TableCell className="text-xs text-muted-foreground">{col.ordinal_position}</TableCell>
                            <TableCell className="font-mono text-xs text-foreground">{col.name}</TableCell>
                            <TableCell className="text-xs text-primary">{col.data_type}</TableCell>
                            <TableCell className="text-xs text-foreground">{col.is_nullable}</TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[150px]">{col.column_default || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Foreign Keys */}
                {relations.filter(r => r.source_table === selectedTable.table_name).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Foreign Keys</h4>
                    <div className="space-y-1">
                      {relations.filter(r => r.source_table === selectedTable.table_name).map(r => (
                        <div key={r.constraint_name} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/20">
                          <span className="font-mono text-foreground">{r.source_column}</span>
                          <span className="text-primary">→</span>
                          <span className="font-mono text-foreground">{r.target_table}.{r.target_column}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Referenced By */}
                {relations.filter(r => r.target_table === selectedTable.table_name).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Referenced By</h4>
                    <div className="space-y-1">
                      {relations.filter(r => r.target_table === selectedTable.table_name).map(r => (
                        <div key={r.constraint_name} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/20">
                          <span className="font-mono text-foreground">{r.source_table}.{r.source_column}</span>
                          <span className="text-primary">→</span>
                          <span className="font-mono text-foreground">{r.target_column}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Indexes */}
                {selectedTable.indexes && selectedTable.indexes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Indexes</h4>
                    <div className="space-y-1">
                      {selectedTable.indexes.map(idx => (
                        <div key={idx.index_name} className="p-2 rounded bg-muted/20">
                          <div className="font-mono text-xs text-foreground">{idx.index_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground mt-0.5 break-all">{idx.index_def}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
