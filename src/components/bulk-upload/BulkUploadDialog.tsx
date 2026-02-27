import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export interface BulkUploadColumn {
  key: string;
  label: string;
  required?: boolean;
}

export interface BulkUploadConfig {
  title: string;
  description: string;
  module: string;
  columns: BulkUploadColumn[];
  templateFileName: string;
  templateContent: string;
  onUpload: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[]; created?: number; updated?: number }>;
}

interface ParsedRow {
  data: Record<string, string>;
  errors: string[];
  rowIndex: number;
}

function parseCSV(text: string): string[][] {
  // Handle all line ending formats: \r\n (Windows), \n (Unix), \r (old Mac)
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim());
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  });
}

/**
 * Safety fallback: convert Excel date serial numbers (e.g. 46023) to YYYY-MM-DD strings.
 * Excel stores dates as days since 1900-01-01 (with the erroneous 1900 leap-year offset).
 * This handles edge cases where cellDates/raw:false don't fully resolve the conversion.
 */
function maybeConvertExcelSerial(value: string): string {
  const num = Number(value);
  // Excel date serials for years 2000-2100 fall roughly in 36526–73050
  if (!isNaN(num) && num > 36526 && num < 73050 && String(num) === value.trim()) {
    const utcDays = num - 25569; // offset from Excel epoch (1900-01-01) to Unix epoch (1970-01-01)
    const date = new Date(utcDays * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0]; // → YYYY-MM-DD
    }
  }
  return value;
}

/**
 * Convert Excel time serial (fractional day, e.g. 0.375 = 09:00) to HH:mm:ss string.
 * Also normalizes datetime strings to extract just the time portion.
 */
function maybeConvertExcelTime(value: string): string {
  const trimmed = value.trim();

  // Already looks like a time (HH:mm or HH:mm:ss) — return as-is
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed;

  // Excel time serial: fractional number between 0 and 1 (e.g. 0.375 = 09:00)
  const num = Number(trimmed);
  if (!isNaN(num) && num >= 0 && num < 1 && trimmed.includes(".")) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  }

  // DateTime string like "1899-12-30T09:00:00.000Z" or "2026-02-01 09:00:00" — extract time
  const dtMatch = trimmed.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  if (dtMatch) return dtMatch[1].length === 5 ? dtMatch[1] + ":00" : dtMatch[1];

  return trimmed;
}

export function BulkUploadDialog({ config }: { config: BulkUploadConfig }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<{
    success: number; errors: string[]; created?: number; updated?: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsedRows([]);
    setHeaders([]);
    setFileName("");
    setUploadSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () => {
    const rows = parseCSV(config.templateContent);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    const xlsxName = config.templateFileName.replace(/\.csv$/, ".xlsx");
    XLSX.writeFile(wb, xlsxName);
    toast.success("Template downloaded");
  };

  const validateRow = useCallback((row: Record<string, string>, idx: number): ParsedRow => {
    const errors: string[] = [];
    for (const col of config.columns) {
      if (col.required && !row[col.key]?.trim()) {
        errors.push(`${col.label} is required`);
      }
    }
    return { data: row, errors, rowIndex: idx + 1 };
  }, [config.columns]);

  const processRows = useCallback((rawRows: string[][]) => {
    // Filter out completely empty rows (all cells empty)
    const nonEmptyRows = rawRows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
    
    if (nonEmptyRows.length < 2) {
      toast.error("File must have a header row and at least one data row");
      return;
    }
    const fileHeaders = nonEmptyRows[0].map((h) => String(h ?? "").toLowerCase().replace(/\s+/g, "_"));
    setHeaders(fileHeaders);
    const dataRows = nonEmptyRows.slice(1).map((cells, idx) => {
      const row: Record<string, string> = {};
      fileHeaders.forEach((h, i) => {
        const val = String(cells[i] ?? "").trim();
        // Apply appropriate conversion based on column type
        const isDateColumn = /date|dob|birth|expiry|joining|leaving|start|end/.test(h);
        const isTimeColumn = /check_in|check_out|time_in|time_out|clock_in|clock_out|in_time|out_time/.test(h);
        if (isTimeColumn) {
          row[h] = maybeConvertExcelTime(val);
        } else if (isDateColumn) {
          row[h] = maybeConvertExcelSerial(val);
        } else {
          row[h] = val;
        }
      });
      return validateRow(row, idx);
    });
    setParsedRows(dataRows);
  }, [validateRow]);

  const processFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast.error("Please upload a CSV or Excel (.xlsx/.xls) file");
      return;
    }
    setFileName(file.name);
    if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        processRows(parseCSV(text));
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        // cellDates: true → Excel date cells become JS Date objects
        // dateNF + raw: false → dates are serialised as "yyyy-mm-dd" strings
        const workbook = XLSX.read(data, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
          dateNF: "yyyy-mm-dd",
        });
        processRows(rows);
      };
      reader.readAsArrayBuffer(file);
    }
  }, [processRows]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const errorCount = parsedRows.filter((r) => r.errors.length > 0).length;
  const validCount = parsedRows.length - errorCount;

  const handleUpload = async () => {
    if (validCount === 0) {
      toast.error("No valid rows to upload");
      return;
    }

    setUploading(true);
    try {
      const validRows = parsedRows.filter((r) => r.errors.length === 0).map((r) => r.data);
      const result = await config.onUpload(validRows);

      // Log to bulk_upload_history
      if (user) {
        await supabase.from("bulk_upload_history" as any).insert({
          module: config.module,
          file_name: fileName,
          total_rows: parsedRows.length,
          successful_rows: result.success,
          failed_rows: result.errors.length + errorCount,
          errors: result.errors.slice(0, 50),
          uploaded_by: user.id,
        });
        qc.invalidateQueries({ queryKey: ["bulk-upload-history"] });
      }

      setUploadSummary(result);

      if (result.errors.length > 0) {
        toast.warning(`Uploaded ${result.success} rows with ${result.errors.length} errors`);
      } else {
        toast.success(`Successfully uploaded ${result.success} rows`);
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Upload summary — shown after upload completes */}
          {uploadSummary && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <p className="font-semibold text-sm">Upload Complete</p>
              </div>
              <div className={cn("grid gap-3", (uploadSummary.created !== undefined || uploadSummary.updated !== undefined) ? "grid-cols-3" : "grid-cols-1")}>
                <div className="rounded-md border border-border bg-background p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{uploadSummary.success}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Processed</p>
                </div>
                {uploadSummary.created !== undefined && (
                  <div className="rounded-md border border-border bg-background p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <UserPlus className="h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold text-foreground">{uploadSummary.created}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">New Users Created</p>
                  </div>
                )}
                {uploadSummary.updated !== undefined && (
                  <div className="rounded-md border border-border bg-background p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <RefreshCw className="h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold text-foreground">{uploadSummary.updated}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Existing Updated</p>
                  </div>
                )}
              </div>
              {uploadSummary.errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {uploadSummary.errors.length} row{uploadSummary.errors.length > 1 ? "s" : ""} failed
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                    {uploadSummary.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Upload form — hidden after upload */}
          {!uploadSummary && (
            <>
              {/* Step 1: Download template */}
              <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
                <div>
                  <p className="font-medium text-sm">Step 1: Download the Excel template</p>
                  <p className="text-xs text-muted-foreground">Fill in the template with your data, then upload it below</p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              {/* Step 2: Upload file */}
              <div
                className={cn(
                  "rounded-lg border-2 border-dashed p-6 transition-colors text-center",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium text-sm mb-1">
                  {isDragging ? "Drop your file here" : "Step 2: Drag & drop or choose a file"}
                </p>
                <p className="text-xs text-muted-foreground mb-3">Supports CSV, Excel (.xlsx, .xls)</p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    Choose File
                  </Button>
                  {fileName && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <span>{fileName}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={reset}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-sm">Preview ({parsedRows.length} rows)</p>
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {validCount} valid
                    </Badge>
                    {errorCount > 0 && (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {errorCount} errors
                      </Badge>
                    )}
                  </div>
                  <ScrollArea className="h-[200px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          {headers.map((h) => (
                            <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                          ))}
                          <TableHead className="w-20">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.map((row) => (
                          <TableRow key={row.rowIndex} className={row.errors.length > 0 ? "bg-destructive/5" : ""}>
                            <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                            {headers.map((h) => (
                              <TableCell key={h} className="text-xs max-w-[120px] truncate">{row.data[h] || "-"}</TableCell>
                            ))}
                            <TableCell>
                              {row.errors.length > 0 ? (
                                <span className="text-xs text-destructive" title={row.errors.join("; ")}>
                                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                                  {row.errors.length} error{row.errors.length > 1 ? "s" : ""}
                                </span>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {uploadSummary ? (
            <Button onClick={() => { reset(); setOpen(false); }}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || validCount === 0}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Upload {validCount} Rows</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
