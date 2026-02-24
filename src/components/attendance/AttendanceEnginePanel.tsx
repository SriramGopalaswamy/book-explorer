import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Calendar, RefreshCw, Clock, Download, Search, Bug,
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
import { useDiagnosticUpload, type DiagnosticReport } from "@/hooks/useDiagnosticUpload";

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

// Convert a File to base64 string (for sending PDF binary to edge function)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Convert a Uint8Array to base64 string (for ZIP-extracted PDF entries)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  return btoa(chunks.join(""));
}

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
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [aggregatedResult, setAggregatedResult] = useState<UploadParseResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setZipProgress(null);
    setAggregatedResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const processFile = useCallback(async (f: File) => {
    setFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "zip") {
      await handleZipUpload(file);
    } else if (ext === "pdf") {
      // PDF: send as base64 binary for proper server-side extraction
      const base64 = await fileToBase64(file);
      const data = await upload.mutateAsync({ fileData: base64, fileName: file.name });
      setResult(data);
    } else {
      // TXT/CSV: send as plain text
      const text = await file.text();
      const data = await upload.mutateAsync({ textContent: text, fileName: file.name });
      setResult(data);
    }
  };

  const handleZipUpload = async (zipFile: File) => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(zipFile);

    // Collect supported files from the ZIP
    const supportedFiles: { name: string; file: any }[] = [];
    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      const fileExt = relativePath.split(".").pop()?.toLowerCase();
      if (["pdf", "txt", "csv"].includes(fileExt || "")) {
        supportedFiles.push({ name: relativePath, file: zipEntry });
      }
    });

    if (supportedFiles.length === 0) {
      setResult({
        success: false,
        error: "No supported files (PDF/TXT/CSV) found in ZIP archive",
        parse_errors: ["ZIP contained no parseable attendance files"],
        total_parsed: 0,
        inserted: 0,
        duplicates_skipped: 0,
        matched_employees: 0,
        unmatched_codes: [],
      } as UploadParseResult);
      return;
    }

    // Process each file and aggregate results
    const agg: UploadParseResult = {
      success: true,
      total_parsed: 0,
      inserted: 0,
      duplicates_skipped: 0,
      matched_employees: 0,
      unmatched_codes: [],
      parse_errors: [],
    } as any;

    let allUnmatched = new Set<string>();

    for (let i = 0; i < supportedFiles.length; i++) {
      const entry = supportedFiles[i];
      setZipProgress({ current: i + 1, total: supportedFiles.length, fileName: entry.name.split("/").pop() || entry.name });

      try {
        const entryExt = entry.name.split(".").pop()?.toLowerCase();
        if (entryExt === "pdf") {
          // PDF in ZIP: extract as binary, send as base64
          const pdfBytes = await entry.file.async("uint8array");
          const base64 = uint8ArrayToBase64(pdfBytes);
          const data = await upload.mutateAsync({
            fileData: base64,
            fileName: `${zipFile.name}/${entry.name}`,
          });

          if (data.success) {
            agg.total_parsed += data.total_parsed || 0;
            agg.inserted += data.inserted || 0;
            agg.duplicates_skipped += data.duplicates_skipped || 0;
            agg.matched_employees = Math.max(agg.matched_employees, data.matched_employees || 0);
            data.unmatched_codes?.forEach((c: string) => allUnmatched.add(c));
          } else {
            agg.parse_errors.push(`${entry.name}: ${data.error || "Parse failed"}`);
          }
        } else {
          // TXT/CSV in ZIP: extract as text
          const text = await entry.file.async("string");
          const data = await upload.mutateAsync({
            textContent: text,
            fileName: `${zipFile.name}/${entry.name}`,
          });

          if (data.success) {
            agg.total_parsed += data.total_parsed || 0;
            agg.inserted += data.inserted || 0;
            agg.duplicates_skipped += data.duplicates_skipped || 0;
            agg.matched_employees = Math.max(agg.matched_employees, data.matched_employees || 0);
            data.unmatched_codes?.forEach((c: string) => allUnmatched.add(c));
          } else {
            agg.parse_errors.push(`${entry.name}: ${data.error || "Parse failed"}`);
          }
        }
      } catch (err: any) {
        agg.parse_errors.push(`${entry.name}: ${err.message}`);
      }
    }

    agg.unmatched_codes = Array.from(allUnmatched);
    agg.success = agg.inserted > 0 || agg.total_parsed > 0;
    setZipProgress(null);
    setResult(agg);
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

  const isProcessing = upload.isPending || zipProgress !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isProcessing) return; // prevent closing during processing
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
            Upload a biometric attendance file (PDF/TXT/CSV) or a ZIP containing multiple files. Punches will be parsed and stored.
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
                accept=".pdf,.txt,.csv,.zip"
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
                Supports PDF, TXT, CSV, or ZIP (containing multiple PDF/TXT/CSV files)
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

            {zipProgress && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-center">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                <span className="text-xs">
                  Processing file {zipProgress.current} of {zipProgress.total}: <strong>{zipProgress.fileName}</strong>
                </span>
              </div>
            )}
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
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {zipProgress ? "Processing ZIP..." : "Parsing..."}
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

// ─── Diagnostic Analysis Dialog ───────────────────
function DiagnosticDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const diagnostic = useDiagnosticUpload();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [allReports, setAllReports] = useState<DiagnosticReport[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setReport(null);
    setAllReports([]);
    setZipProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleAnalyze = async () => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "zip") {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      const supported: { name: string; entry: any }[] = [];
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        const e = path.split(".").pop()?.toLowerCase();
        if (["pdf", "txt", "csv"].includes(e || "")) supported.push({ name: path, entry });
      });

      if (supported.length === 0) {
        setReport(null);
        return;
      }

      const reports: DiagnosticReport[] = [];
      for (let i = 0; i < supported.length; i++) {
        const s = supported[i];
        setZipProgress({ current: i + 1, total: supported.length, fileName: s.name.split("/").pop() || s.name });
        try {
          const entryExt = s.name.split(".").pop()?.toLowerCase();
          if (entryExt === "pdf") {
            const pdfBytes = await s.entry.async("uint8array");
            const base64 = uint8ArrayToBase64(pdfBytes);
            const result = await diagnostic.mutateAsync({ fileData: base64, fileName: `${file.name}/${s.name}` });
            if (result.diagnostic) reports.push(result.diagnostic);
          } else {
            const text = await s.entry.async("string");
            const result = await diagnostic.mutateAsync({ textContent: text, fileName: `${file.name}/${s.name}` });
            if (result.diagnostic) reports.push(result.diagnostic);
          }
        } catch { /* skip */ }
      }
      setZipProgress(null);
      setAllReports(reports);
      if (reports.length > 0) setReport(reports[0]);
    } else {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") {
        const base64 = await fileToBase64(file);
        const result = await diagnostic.mutateAsync({ fileData: base64, fileName: file.name });
        if (result.diagnostic) {
          setReport(result.diagnostic);
          setAllReports([result.diagnostic]);
        }
      } else {
        const text = await file.text();
        const result = await diagnostic.mutateAsync({ textContent: text, fileName: file.name });
        if (result.diagnostic) {
          setReport(result.diagnostic);
          setAllReports([result.diagnostic]);
        }
      }
    }
  };

  const isProcessing = diagnostic.isPending || zipProgress !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isProcessing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-warning" />
            Attendance Parse Diagnostic
          </DialogTitle>
          <DialogDescription>
            Analyze PDF extraction quality without modifying any data. Read-only diagnostic mode.
          </DialogDescription>
        </DialogHeader>

        {!report ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.zip" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium mb-1">Select file to diagnose</p>
              <p className="text-xs text-muted-foreground mb-3">PDF, TXT, CSV, or ZIP — no data will be inserted</p>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Choose File</Button>
              {file && <p className="text-xs text-muted-foreground mt-2">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
            </div>
            {zipProgress && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-center">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                <span className="text-xs">Analyzing {zipProgress.current}/{zipProgress.total}: <strong>{zipProgress.fileName}</strong></span>
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {/* File selector for multi-file ZIP */}
              {allReports.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {allReports.map((r, i) => (
                    <Button
                      key={i}
                      variant={report.file_name === r.file_name ? "default" : "outline"}
                      size="sm"
                      className="text-xs"
                      onClick={() => setReport(r)}
                    >
                      {r.file_name.split("/").pop()}
                    </Button>
                  ))}
                </div>
              )}

              {/* Header metrics */}
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Characters" value={report.extraction.total_characters.toLocaleString()} />
                <MetricCard label="Lines" value={report.extraction.line_count.toLocaleString()} />
                <MetricCard label="Classification" value={report.classification.guess.replace("likely_", "").toUpperCase()} variant={report.classification.guess === "unknown" ? "destructive" : "default"} />
              </div>

              {/* Pattern density */}
              <DiagSection title="Pattern Density">
                <div className="grid grid-cols-4 gap-2">
                  <MetricCard label="Dates" value={report.patterns.date_count} small />
                  <MetricCard label="Times" value={report.patterns.time_count} small />
                  <MetricCard label="Emp Codes" value={report.patterns.employee_code_count} small />
                  <MetricCard label="Status (P/A)" value={report.patterns.status_count} small />
                </div>
                {report.patterns.date_samples.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Date samples: {report.patterns.date_samples.slice(0, 5).join(", ")}</p>
                )}
              </DiagSection>

              {/* Fragmentation */}
              <DiagSection title="Column Fragmentation">
                <div className="grid grid-cols-3 gap-2">
                  <MetricCard label="Single-token lines" value={report.fragmentation.single_token_lines} small />
                  <MetricCard label="Numeric-only" value={report.fragmentation.numeric_only_lines} small />
                  <MetricCard label="Time-only" value={report.fragmentation.time_only_lines} small />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <MetricCard label="Avg line length" value={report.fragmentation.avg_line_length} small />
                  <MetricCard label="Max line length" value={report.fragmentation.max_line_length} small />
                  <MetricCard label="Empty lines" value={report.fragmentation.empty_line_count} small />
                </div>
                {report.fragmentation.single_token_lines > report.extraction.line_count * 0.3 && (
                  <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                    ⚠️ HIGH FRAGMENTATION: {((report.fragmentation.single_token_lines / report.extraction.line_count) * 100).toFixed(0)}% of lines are single-token — PDF extraction is column-fragmented
                  </div>
                )}
              </DiagSection>

              {/* Classification signals */}
              <DiagSection title="Classification Signals">
                {report.classification.confidence_signals.length > 0 ? (
                  <ul className="space-y-1">
                    {report.classification.confidence_signals.map((s, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                        <span className="text-primary mt-0.5">→</span> {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No strong classification signals detected</p>
                )}
              </DiagSection>

              {/* First 20 lines preview */}
              <DiagSection title="First 20 Lines Preview">
                <div className="bg-muted/50 rounded-md p-3 font-mono text-[11px] leading-relaxed max-h-60 overflow-auto whitespace-pre-wrap break-all">
                  {report.extraction.first_50_lines.slice(0, 20).map((line, i) => (
                    <div key={i} className="flex">
                      <span className="text-muted-foreground w-8 flex-shrink-0 text-right mr-2 select-none">{i + 1}</span>
                      <span className={cn(
                        "flex-1",
                        line.trim().length === 0 && "text-muted-foreground/50 italic"
                      )}>
                        {line || "(empty)"}
                      </span>
                    </div>
                  ))}
                </div>
              </DiagSection>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {report ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Analyze Another</Button>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>Cancel</Button>
              <Button onClick={handleAnalyze} disabled={!file || isProcessing}>
                {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : <><Search className="h-4 w-4 mr-2" />Run Diagnostic</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ label, value, small, variant }: { label: string; value: string | number; small?: boolean; variant?: "default" | "destructive" }) {
  return (
    <div className={cn("rounded-md border border-border bg-muted/40 p-2 text-center", small && "p-1.5")}>
      <p className={cn("font-bold text-foreground", small ? "text-sm" : "text-lg", variant === "destructive" && "text-destructive")}>{value}</p>
      <p className={cn("text-muted-foreground", small ? "text-[10px]" : "text-xs")}>{label}</p>
    </div>
  );
}

function DiagSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

// ─── Main Component (exported for Attendance page) ─
export function AttendanceEnginePanel() {
  const [showUpload, setShowUpload] = useState(false);
  const [showRecalc, setShowRecalc] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
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
            <Button variant="outline" size="sm" onClick={() => setShowDiagnostic(true)}>
              <Bug className="h-4 w-4 mr-1" /> Diagnose
            </Button>
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
      <DiagnosticDialog open={showDiagnostic} onOpenChange={setShowDiagnostic} />
    </div>
  );
}
