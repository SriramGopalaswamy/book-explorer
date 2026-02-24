import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, FileText, Zap, AlertTriangle, CheckCircle2, Loader2,
  Calendar, RefreshCw, Clock, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAttendanceDaily,
  useAttendanceUploadLogs,
  useUploadBiometricAttendance,
  useRecalculateAttendance,
  type UploadParseResult,
  type AttendanceDaily,
  type AttendanceUploadLog,
} from "@/hooks/useAttendanceEngine";

// ─── Status helpers ────────────────────────────────
const statusLabel: Record<string, string> = {
  P: "Present", A: "Absent", HD: "Half Day", MIS: "Missing Punch", NA: "N/A",
};
const statusStyle: Record<string, string> = {
  P: "bg-success/20 text-success border-success/30",
  A: "bg-destructive/20 text-destructive border-destructive/30",
  HD: "bg-warning/20 text-warning border-warning/30",
  MIS: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  NA: "bg-muted text-muted-foreground border-border",
};

const formatTime = (t: string | null) => t ? t.substring(0, 5) : "—";
const formatMins = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

// ─── Biometric Upload Dialog ───────────────────────
function BiometricUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const upload = useUploadBiometricAttendance();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<UploadParseResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const processFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "txt", "csv"].includes(ext || "")) {
      // For now we accept text-based files; PDF binary parsing would need more work
      // We'll read as text which works for text-based PDFs
    }
    setFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    const text = await file.text();
    const data = await upload.mutateAsync({ textContent: text, fileName: file.name });
    setResult(data);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Biometric Attendance
          </DialogTitle>
          <DialogDescription>
            Upload a biometric attendance file (PDF/TXT/CSV). Punches will be parsed and stored.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              <p className="font-semibold text-sm">
                {result.success ? "Upload Complete" : "Parse Failed"}
              </p>
            </div>

            {result.success && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/40 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.total_parsed}</p>
                  <p className="text-xs text-muted-foreground">Total Parsed</p>
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{result.inserted}</p>
                  <p className="text-xs text-muted-foreground">Inserted</p>
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{result.duplicates_skipped}</p>
                  <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.matched_employees}</p>
                  <p className="text-xs text-muted-foreground">Employees Matched</p>
                </div>
              </div>
            )}

            {result.unmatched_codes?.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-medium text-warning flex items-center gap-1 mb-1">
                  <AlertTriangle className="h-3 w-3" />
                  {result.unmatched_codes.length} unmatched employee code(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.unmatched_codes.join(", ")}
                </p>
              </div>
            )}

            {result.parse_errors?.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {result.parse_errors.length} parse error(s)
                </p>
                <ul className="text-xs text-muted-foreground mt-1 max-h-20 overflow-y-auto">
                  {result.parse_errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.error && (
              <p className="text-sm text-destructive">{result.error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-8 transition-colors text-center",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                }}
                className="hidden"
              />
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium text-sm mb-1">
                {isDragging ? "Drop your file here" : "Drag & drop or choose a file"}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Supports PDF, TXT, CSV biometric reports
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose File
                </Button>
                {file && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-[150px]">{file.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || upload.isPending}
              >
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload & Parse
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recalculate Dialog ────────────────────────────
function RecalculateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const recalc = useRecalculateAttendance();
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recalculate Attendance</AlertDialogTitle>
          <AlertDialogDescription>
            Recalculate daily attendance from raw punches. Locked days and locked
            payroll periods will be skipped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              recalc.mutate(
                { startDate, endDate },
                { onSuccess: () => onOpenChange(false) }
              )
            }
            disabled={recalc.isPending}
          >
            {recalc.isPending ? "Recalculating..." : "Recalculate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Upload History ────────────────────────────────
function UploadHistory() {
  const { data: logs = [], isLoading } = useAttendanceUploadLogs();

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (logs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Biometric Upload History</CardTitle>
        <CardDescription className="text-xs">
          Recent file uploads and parse results
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Punches</TableHead>
                <TableHead className="text-right">Matched</TableHead>
                <TableHead className="text-right">Duplicates</TableHead>
                <TableHead>Unmatched</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate max-w-[150px]">{log.file_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{log.total_punches}</TableCell>
                  <TableCell className="text-right">{log.matched_employees}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {log.duplicate_punches}
                  </TableCell>
                  <TableCell>
                    {log.unmatched_codes?.length > 0 ? (
                      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                        {log.unmatched_codes.length} unmatched
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                        All matched
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(log.created_at).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Calculated Attendance Table ───────────────────
function CalculatedAttendanceTable({
  dateRange,
}: {
  dateRange: { from: string; to: string };
}) {
  const { data: records = [], isLoading } = useAttendanceDaily(dateRange);

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="mx-auto h-8 w-8 mb-2" />
        <p className="text-sm">No calculated attendance records for this range</p>
        <p className="text-xs mt-1">Upload biometric data and run recalculation</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>In</TableHead>
            <TableHead>Out</TableHead>
            <TableHead className="text-right">Work Time</TableHead>
            <TableHead className="text-right">Late</TableHead>
            <TableHead className="text-right">OT</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Lock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div>
                  <p className="font-medium text-sm text-foreground">
                    {r.profiles?.full_name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.profiles?.department || ""}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-sm">
                {new Date(r.attendance_date).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                })}
              </TableCell>
              <TableCell className="text-sm">{formatTime(r.first_in_time)}</TableCell>
              <TableCell className="text-sm">{formatTime(r.last_out_time)}</TableCell>
              <TableCell className="text-right text-sm">
                {r.total_work_minutes > 0 ? formatMins(r.total_work_minutes) : "—"}
              </TableCell>
              <TableCell className="text-right text-sm">
                {r.late_minutes > 0 ? (
                  <span className="text-warning">{r.late_minutes}m</span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right text-sm">
                {r.ot_minutes > 0 ? (
                  <span className="text-primary">{r.ot_minutes}m</span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={statusStyle[r.status] || statusStyle.NA}
                >
                  {statusLabel[r.status] || r.status}
                </Badge>
              </TableCell>
              <TableCell>
                {r.locked && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                    Locked
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Component (exported for Attendance page) ─
export function AttendanceEnginePanel() {
  const [showUpload, setShowUpload] = useState(false);
  const [showRecalc, setShowRecalc] = useState(false);
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().split("T")[0]
  );

  return (
    <div className="space-y-4">
      {/* Engine Controls */}
      <Card className="glass-card">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-gradient-primary flex items-center gap-2">
              <Zap className="h-5 w-5" /> Attendance Engine
            </CardTitle>
            <CardDescription>
              Upload biometric data, recalculate attendance from punches
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4 mr-1" /> Upload Biometric
            </Button>
            <Button onClick={() => setShowRecalc(true)}>
              <RefreshCw className="h-4 w-4 mr-1" /> Recalculate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 w-36"
              />
            </div>
          </div>
          <CalculatedAttendanceTable dateRange={{ from: dateFrom, to: dateTo }} />
        </CardContent>
      </Card>

      {/* Upload History */}
      <UploadHistory />

      {/* Dialogs */}
      <BiometricUploadDialog open={showUpload} onOpenChange={setShowUpload} />
      <RecalculateDialog open={showRecalc} onOpenChange={setShowRecalc} />
    </div>
  );
}
