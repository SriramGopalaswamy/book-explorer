import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInvoices } from "@/hooks/useInvoices";
import {
  useBackgroundJobs,
  useDispatchJob,
  type BackgroundJob,
  type JobStatus,
} from "@/hooks/useBackgroundJobs";
import { DataLoadingBar } from "@/components/ui/DataLoadingBar";
import { CheckCircle2, Clock, FileText, Loader2, Play, Receipt, RefreshCw, XCircle } from "lucide-react";

const statusMeta: Record<JobStatus, { label: string; className: string; icon: any }> = {
  queued: { label: "Queued", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  running: { label: "Running", className: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Loader2 },
  completed: { label: "Completed", className: "bg-green-500/10 text-green-600 border-green-500/30", icon: CheckCircle2 },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-600 border-red-500/30", icon: XCircle },
};

const moduleLabel: Record<string, string> = {
  invoice_pdf_batch: "Invoice PDF Batch",
  gst_recon_summary: "GST Recon Summary",
  noop: "No-op",
  ping: "Ping",
};

function StatusBadge({ status }: { status: JobStatus }) {
  const meta = statusMeta[status] ?? statusMeta.queued;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={meta.className}>
      <Icon className={`h-3 w-3 mr-1 ${status === "running" ? "animate-spin" : ""}`} />
      {meta.label}
    </Badge>
  );
}

function InvoicePdfBatchDialog() {
  const { data: invoices = [] } = useInvoices();
  const dispatch = useDispatchJob();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const candidates = useMemo(
    () =>
      invoices
        .filter((i: any) => i.status !== "draft")
        .slice(0, 100),
    [invoices],
  );

  const ids = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);

  const submit = async () => {
    if (ids.length === 0) return;
    await dispatch.mutateAsync({
      module: "invoice_pdf_batch",
      payload: { invoice_ids: ids },
    });
    setOpen(false);
    setSelected({});
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText className="h-4 w-4" /> Generate Invoice PDFs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invoice PDF Batch</DialogTitle>
          <DialogDescription>
            Pick invoices to render in the background. You'll see progress in the jobs list below.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={!!selected[inv.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [inv.id]: e.target.checked }))}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.customer_name ?? "—"}</TableCell>
                  <TableCell>{inv.invoice_date}</TableCell>
                  <TableCell><Badge variant="outline">{inv.status}</Badge></TableCell>
                </TableRow>
              ))}
              {candidates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                    No invoices available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <p className="mr-auto text-sm text-muted-foreground self-center">
            {ids.length} selected
          </p>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={ids.length === 0 || dispatch.isPending} className="gap-2">
            {dispatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Queue job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GstReconDialog() {
  const dispatch = useDispatchJob();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
  );

  const submit = async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) return;
    await dispatch.mutateAsync({
      module: "gst_recon_summary",
      payload: { period },
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Receipt className="h-4 w-4" /> GST Recon Summary
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>GST Reconciliation Summary</DialogTitle>
          <DialogDescription>
            Aggregate output and input GST for a given month. Results appear inline once the job completes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Period (YYYY-MM)</Label>
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-04" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!/^\d{4}-\d{2}$/.test(period) || dispatch.isPending}
            className="gap-2"
          >
            {dispatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Queue job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobResultPreview({ job }: { job: BackgroundJob }) {
  if (job.status === "failed") {
    return <span className="text-xs text-destructive">{job.error ?? "Failed"}</span>;
  }
  if (job.status !== "completed" || !job.result) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const r = job.result;
  if (job.module === "invoice_pdf_batch") {
    return (
      <span className="text-xs">
        <span className="text-green-600">{r.generated ?? 0} ok</span>
        {(r.failed ?? 0) > 0 && <span className="text-destructive ml-2">{r.failed} failed</span>}
      </span>
    );
  }
  if (job.module === "gst_recon_summary") {
    const out = r.output_tax ?? {};
    const inp = r.input_tax ?? {};
    return (
      <span className="text-xs">
        Out ₹{Number(out.gross ?? 0).toLocaleString("en-IN")} ({out.count ?? 0}) ·
        In ₹{Number(inp.gross ?? 0).toLocaleString("en-IN")} ({inp.count ?? 0})
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Done</span>;
}

export default function BackgroundJobs() {
  const { data: jobs = [], isLoading, refetch, isFetching } = useBackgroundJobs(100);
  const [detailJob, setDetailJob] = useState<BackgroundJob | null>(null);

  const counts = useMemo(() => {
    const c = { queued: 0, running: 0, completed: 0, failed: 0 } as Record<JobStatus, number>;
    jobs.forEach((j) => { c[j.status] = (c[j.status] ?? 0) + 1; });
    return c;
  }, [jobs]);

  return (
    <MainLayout
      title="Background Jobs"
      subtitle="Dispatch long-running tasks and watch their progress in real time"
    >
      <div className="space-y-6">
        {/* Dispatch toolbar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dispatch a job</CardTitle>
            <CardDescription>
              Workers pick up queued jobs immediately. Progress updates stream in live.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <InvoicePdfBatchDialog />
            <GstReconDialog />
            <Button
              variant="ghost"
              className="gap-2 ml-auto"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardContent>
        </Card>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["queued", "running", "completed", "failed"] as JobStatus[]).map((s) => {
            const meta = statusMeta[s];
            const Icon = meta.icon;
            return (
              <Card key={s}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-md ${meta.className}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{meta.label}</p>
                    <p className="text-lg font-semibold">{counts[s] ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Job table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent jobs</CardTitle>
            <CardDescription>Last 100 jobs for your organization</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataLoadingBar
              isLoading={isLoading}
              loaded={jobs.length}
              label="Loading jobs"
              className="m-4"
            />
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-48">Progress</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                        No jobs yet — dispatch one above to get started.
                      </TableCell>
                    </TableRow>
                  )}
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {moduleLabel[job.module] ?? job.module}
                      </TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={job.progress ?? 0} className="h-1.5" />
                          <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">
                            {job.progress ?? 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell><JobResultPreview job={job} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(job.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.finished_at ? format(new Date(job.finished_at), "MMM d, HH:mm:ss") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetailJob(job)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailJob} onOpenChange={(o) => !o && setDetailJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detailJob ? moduleLabel[detailJob.module] ?? detailJob.module : ""}
            </DialogTitle>
            <DialogDescription>Job details</DialogDescription>
          </DialogHeader>
          {detailJob && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={detailJob.status} />
                <span className="text-muted-foreground tabular-nums">{detailJob.progress ?? 0}%</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Payload</p>
                <Textarea
                  readOnly
                  value={JSON.stringify(detailJob.payload ?? {}, null, 2)}
                  className="font-mono text-xs h-32"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Result</p>
                <Textarea
                  readOnly
                  value={
                    detailJob.error
                      ? detailJob.error
                      : JSON.stringify(detailJob.result ?? {}, null, 2)
                  }
                  className="font-mono text-xs h-40"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
