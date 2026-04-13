import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export interface BulkUploadColumn {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
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
  errorKeys: string[]; // config column keys that failed validation
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
  if (!trimmed) return trimmed;

  // Already looks like a time (HH:mm or HH:mm:ss) — return as-is
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed;

  // Excel time serial: fractional number (e.g. 0.375 = 09:00, or datetime serial like 45689.375)
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed.includes(".")) {
    // Extract fractional part (time portion) from any Excel serial
    const fraction = num % 1;
    if (fraction > 0) {
      const totalMinutes = Math.round(fraction * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
    }
  }

  // Pure integer that could be Excel serial without time — skip
  if (!isNaN(num) && !trimmed.includes(".") && !trimmed.includes(":")) return trimmed;

  // DateTime string like "1899-12-30T09:00:00.000Z" or "2026-02-01 09:00:00" — extract time
  const dtMatch = trimmed.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  if (dtMatch) return dtMatch[1].length === 5 ? dtMatch[1] + ":00" : dtMatch[1];

  return trimmed;
}

/**
 * Safely convert any ExcelJS CellValue to a plain string.
 * Handles rich-text, hyperlink, formula-result, and error objects
 * that would otherwise stringify to "[object Object]".
 */
function extractCellValue(val: ExcelJS.CellValue): string {
  if (val == null) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "object") {
    // Rich text: { richText: [{ text: string }] }
    if ("richText" in val && Array.isArray((val as any).richText)) {
      return (val as any).richText.map((r: any) => r.text ?? "").join("");
    }
    // Hyperlink: { text: string, hyperlink: string }
    if ("text" in val) return String((val as any).text ?? "");
    // Formula / shared formula: { formula: string, result: value }
    if ("result" in val) {
      const res = (val as any).result;
      return res == null ? "" : String(res);
    }
    // Error cell value
    if ("error" in val) return "";
  }
  return String(val);
}

export function BulkUploadDialog({ config }: { config: BulkUploadConfig }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; header: string } | null>(null);
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

  const downloadTemplate = async () => {
    const rows = parseCSV(config.templateContent);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Template");
    ws.addRows(rows);
    const xlsxName = config.templateFileName.replace(/\.csv$/, ".xlsx");
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = xlsxName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const validateRow = useCallback((row: Record<string, string>, idx: number): ParsedRow => {
    const errors: string[] = [];
    const errorKeys: string[] = [];
    for (const col of config.columns) {
      if (col.required && !row[col.key]?.trim()) {
        errors.push(`${col.label} is required`);
        errorKeys.push(col.key);
      }
    }
    return { data: row, errors, errorKeys, rowIndex: idx + 1 };
  }, [config.columns]);

  const handleCellEdit = useCallback((rowIndex: number, header: string, value: string) => {
    setParsedRows(prev => prev.map(row => {
      if (row.rowIndex !== rowIndex) return row;
      const newData = { ...row.data, [header]: value };
      // If editing an aliased column, also update the primary config key
      for (const col of config.columns) {
        if (col.aliases?.includes(header)) newData[col.key] = value;
      }
      return validateRow(newData, row.rowIndex - 1);
    }));
    setEditingCell(null);
  }, [config.columns, validateRow]);

  const processRows = useCallback((rawRows: string[][]) => {
    // Filter out completely empty rows (all cells empty)
    const nonEmptyRows = rawRows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
    
    if (nonEmptyRows.length < 2) {
      toast.error("File must have a header row and at least one data row");
      return;
    }
    const fileHeaders = nonEmptyRows[0].map((h) =>
      String(h ?? "")
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
    );
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
      // Remap aliased column names to primary config keys
      for (const col of config.columns) {
        if (!row[col.key] && col.aliases) {
          for (const alias of col.aliases) {
            if (row[alias]) {
              row[col.key] = row[alias];
              break;
            }
          }
        }
      }
      return validateRow(row, idx);
    });
    setParsedRows(dataRows);
  }, [validateRow, config.columns]);

  const processFile = useCallback((file: File) => {
    // Allowlist both extension and MIME type to prevent polyglot file attacks
    const ext = file.name.split(".").pop()?.toLowerCase();
    const ALLOWED_EXTENSIONS = ["csv", "xlsx", "xls"];
    const ALLOWED_MIME_TYPES = [
      "text/csv",
      "text/plain",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/csv",
      "application/octet-stream", // some browsers report xlsx as this
    ];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    if (!ALLOWED_EXTENSIONS.includes(ext || "")) {
      toast.error("Please upload a CSV or Excel (.xlsx/.xls) file");
      return;
    }
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error("File type not allowed. Please upload a CSV or Excel file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum allowed size is 5 MB.");
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
      reader.onload = async (ev) => {
        const data = ev.target?.result as ArrayBuffer;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(data);
        const ws = wb.worksheets[0];
        const rows: string[][] = [];
        const colCount = ws.columnCount || 1;
        ws.eachRow((row) => {
          const cells: string[] = [];
          for (let i = 1; i <= colCount; i++) {
            cells.push(extractCellValue(row.getCell(i).value));
          }
          // Skip rows where every cell is empty (e.g. trailing blank rows)
          if (cells.some((c) => c.trim() !== "")) rows.push(cells);
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
      let result: { success: number; errors: string[]; created?: number; updated?: number };
      
      try {
        result = await config.onUpload(validRows);
      } catch (uploadErr: any) {
        console.error("[BulkUpload] onUpload threw:", uploadErr);
        result = { success: 0, errors: [uploadErr.message || "Upload failed"] };
      }

      // Always log to bulk_upload_history, even on partial/full failure
      if (user) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", user.id)
            .maybeSingle();

          const orgId = profile?.organization_id || "00000000-0000-0000-0000-000000000001";

          const { error: historyErr } = await supabase.from("bulk_upload_history").insert({
            module: config.module,
            file_name: fileName,
            total_rows: parsedRows.length,
            successful_rows: result.success,
            failed_rows: result.errors.length + errorCount,
            errors: result.errors.slice(0, 50),
            uploaded_by: user.id,
            organization_id: orgId,
          });
          if (historyErr) {
            console.error("[BulkUpload] Failed to log upload history:", historyErr.message, historyErr);
            toast.warning("Upload succeeded but history logging failed. Check permissions.");
          }
        } catch (histErr: any) {
          console.error("[BulkUpload] History insert exception:", histErr);
          toast.warning("Upload succeeded but history logging failed.");
        }
        qc.invalidateQueries({ queryKey: ["bulk-upload-history"] });
      }

      setUploadSummary(result);

      if (result.success === 0 && result.errors.length > 0) {
        toast.error(`Upload failed: ${result.errors.length} error(s)`);
      } else if (result.errors.length > 0) {
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
                  <p className="text-xs text-muted-foreground">Click any cell to edit its value inline.</p>
                  <div className="h-[220px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8 sticky left-0 bg-background z-10">#</TableHead>
                          {headers.map((h) => (
                            <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                          ))}
                          <TableHead className="text-xs whitespace-nowrap min-w-[160px]">Status / Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.map((row) => (
                          <TableRow key={row.rowIndex} className={row.errors.length > 0 ? "bg-destructive/5" : ""}>
                            <TableCell className="text-xs text-muted-foreground sticky left-0 bg-inherit">{row.rowIndex}</TableCell>
                            {headers.map((h) => {
                              const configCol = config.columns.find(c => c.key === h || c.aliases?.includes(h));
                              const isErrorCell = !!configCol && row.errorKeys.includes(configCol.key);
                              const isEditing = editingCell?.rowIndex === row.rowIndex && editingCell?.header === h;
                              return (
                                <TableCell
                                  key={h}
                                  className={cn("text-xs p-1 cursor-pointer", isErrorCell ? "bg-destructive/15" : "")}
                                  onClick={() => { if (!isEditing) setEditingCell({ rowIndex: row.rowIndex, header: h }); }}
                                >
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      defaultValue={row.data[h] ?? ""}
                                      className="w-full min-w-[80px] px-1 py-0.5 rounded border border-primary bg-background text-xs outline-none"
                                      onBlur={(e) => handleCellEdit(row.rowIndex, h, e.target.value.trim())}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleCellEdit(row.rowIndex, h, (e.target as HTMLInputElement).value.trim());
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className={cn("block max-w-[120px] truncate", isErrorCell ? "text-destructive font-medium italic" : "")}
                                      title={isErrorCell ? `${configCol?.label} is required — click to edit` : (row.data[h] || "")}
                                    >
                                      {row.data[h] || (isErrorCell ? "missing" : "-")}
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-xs min-w-[160px]">
                              {row.errors.length > 0 ? (
                                <div className="space-y-0.5">
                                  {row.errors.map((e, i) => (
                                    <div key={i} className="flex items-start gap-1 text-destructive leading-tight">
                                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                      <span>{e}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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
