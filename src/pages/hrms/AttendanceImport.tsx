import { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2,
  ArrowLeft, ArrowRight, Search, Users, Calendar,
  Clock, AlertCircle, BarChart3, Link2, SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { EmployeeCombobox } from "@/components/payroll/EmployeeCombobox";
import {
  usePreviewBiometricAttendance,
  useUploadBiometricAttendance,
  useAttendanceUploadLogs,
  type PreviewResult,
  type PreviewEmployee,
  type PreviewRecord,
  type UploadParseResult,
} from "@/hooks/useAttendanceEngine";

// ─── Status badge helpers ─────────────────────────
const statusConfig: Record<string, { label: string; className: string }> = {
  P: { label: "Present", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400" },
  A: { label: "Absent", className: "bg-destructive/15 text-destructive border-destructive/30" },
  HD: { label: "Half Day", className: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400" },
  MIS: { label: "Missing", className: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400" },
  WO: { label: "Week Off", className: "bg-muted text-muted-foreground border-border" },
  WFH: { label: "WFH", className: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400" },
  NA: { label: "N/A", className: "bg-muted text-muted-foreground border-border" },
  AB: { label: "Absent", className: "bg-destructive/15 text-destructive border-destructive/30" },
  CL: { label: "CL", className: "bg-violet-500/15 text-violet-700 border-violet-500/30" },
  SL: { label: "SL", className: "bg-violet-500/15 text-violet-700 border-violet-500/30" },
};

const formatTime = (t: string | null | undefined) => t ? t.substring(0, 5) : "—";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Match types ──────────────────────────────────
type MatchType = "auto_code" | "auto_name" | "saved" | "manual" | "skipped" | "unmatched";

interface MatchEntry {
  employee_code: string;
  employee_name: string;
  department?: string;
  match_type: MatchType;
  profile_id?: string;
  profile_name?: string;
}

// ═══════════════════════════════════════════════════
// STEP TYPE
// ═══════════════════════════════════════════════════
type Step = "upload" | "preview" | "match" | "importing" | "summary";

export default function AttendanceImport() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [editedRecords, setEditedRecords] = useState<Map<string, PreviewRecord>>(new Map());
  const [importResult, setImportResult] = useState<UploadParseResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [matchEntries, setMatchEntries] = useState<MatchEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: org } = useUserOrganization();
  const previewMutation = usePreviewBiometricAttendance();
  const importMutation = useUploadBiometricAttendance();
  const { data: uploadLogs } = useAttendanceUploadLogs();

  // Fetch org employees for matching step
  const { data: orgProfiles = [] } = useQuery({
    queryKey: ["org-profiles-for-matching", org?.organizationId],
    queryFn: async () => {
      if (!org?.organizationId) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, department, job_title")
        .eq("organization_id", org.organizationId)
        .order("full_name");
      return (data ?? []) as { id: string; full_name: string | null; department: string | null; job_title: string | null }[];
    },
    enabled: !!org?.organizationId,
  });

  const { data: empDetails = [] } = useQuery({
    queryKey: ["emp-details-for-matching", org?.organizationId],
    queryFn: async () => {
      if (!org?.organizationId) return [];
      const { data } = await supabase
        .from("employee_details")
        .select("profile_id, employee_id_number")
        .eq("organization_id", org.organizationId);
      return (data ?? []) as { profile_id: string; employee_id_number: string | null }[];
    },
    enabled: !!org?.organizationId,
  });

  // Fetch saved code mappings from previous uploads
  const { data: savedMappings = [] } = useQuery({
    queryKey: ["saved-code-mappings", org?.organizationId],
    queryFn: async () => {
      if (!org?.organizationId) return [];
      const { data, error } = await supabase
        .from("employee_code_mappings")
        .select("employee_code, profile_id, employee_name_hint")
        .eq("organization_id", org.organizationId);
      if (error) {
        console.warn("Could not fetch saved mappings:", error.message);
        return [];
      }
      return (data ?? []) as unknown as { employee_code: string; profile_id: string; employee_name_hint: string | null }[];
    },
    enabled: !!org?.organizationId,
  });

  const reset = () => {
    setStep("upload");
    setFile(null);
    setFileData(null);
    setTextContent(null);
    setPreviewData(null);
    setEditedRecords(new Map());
    setImportResult(null);
    setSearchTerm("");
    setMatchEntries([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") {
      const b64 = await fileToBase64(f);
      setFileData(b64);
      setTextContent(null);
    } else {
      const text = await f.text();
      setTextContent(text);
      setFileData(null);
    }
  }, []);

  const handlePreview = async () => {
    if (!file) return;
    try {
      const result = await previewMutation.mutateAsync({
        fileData: fileData || undefined,
        textContent: textContent || undefined,
        fileName: file.name,
      });
      setPreviewData(result);
      if (result.success && result.employees?.length > 0) {
        setStep("preview");
      }
    } catch { /* handled by mutation */ }
  };

  // Build match entries from preview data
  const buildMatchEntries = useCallback(() => {
    if (!previewData?.employees) return;
    const entries: MatchEntry[] = [];
    for (const emp of previewData.employees) {
      // Priority 1: saved mapping from previous upload
      const savedMatch = savedMappings.find(m => m.employee_code === emp.employee_code);
      if (savedMatch) {
        const profile = orgProfiles.find(p => p.id === savedMatch.profile_id);
        entries.push({
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          match_type: "saved",
          profile_id: savedMatch.profile_id,
          profile_name: profile?.full_name || savedMatch.employee_name_hint || "Unknown",
        });
        continue;
      }
      // Priority 2: employee_details code match
      const codeMatch = empDetails.find(e => e.employee_id_number === emp.employee_code);
      if (codeMatch) {
        const profile = orgProfiles.find(p => p.id === codeMatch.profile_id);
        entries.push({
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          match_type: "auto_code",
          profile_id: codeMatch.profile_id,
          profile_name: profile?.full_name || "Unknown",
        });
        continue;
      }
      // Priority 3: name match
      const nameMatch = orgProfiles.find(p => p.full_name?.toLowerCase() === emp.employee_name?.toLowerCase());
      if (nameMatch) {
        entries.push({
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          department: emp.department,
          match_type: "auto_name",
          profile_id: nameMatch.id,
          profile_name: nameMatch.full_name || "Unknown",
        });
        continue;
      }
      entries.push({
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        department: emp.department,
        match_type: "unmatched",
      });
    }
    setMatchEntries(entries);
  }, [previewData, empDetails, orgProfiles, savedMappings]);

  const handleProceedToMatch = () => {
    buildMatchEntries();
    setStep("match");
  };

  const handleMatchSelect = (empCode: string, profileId: string) => {
    setMatchEntries(prev => prev.map(e => {
      if (e.employee_code !== empCode) return e;
      const profile = orgProfiles.find(p => p.id === profileId);
      return { ...e, match_type: "manual" as MatchType, profile_id: profileId, profile_name: profile?.full_name || "Unknown" };
    }));
  };

  const handleSkip = (empCode: string) => {
    setMatchEntries(prev => prev.map(e =>
      e.employee_code === empCode ? { ...e, match_type: "skipped" as MatchType, profile_id: undefined, profile_name: undefined } : e
    ));
  };

  const handleUnskip = (empCode: string) => {
    setMatchEntries(prev => prev.map(e =>
      e.employee_code === empCode ? { ...e, match_type: "unmatched" as MatchType } : e
    ));
  };

  const matchedCount = matchEntries.filter(e => e.profile_id && e.match_type !== "skipped").length;
  const unmatchedCount = matchEntries.filter(e => e.match_type === "unmatched").length;
  const skippedCount = matchEntries.filter(e => e.match_type === "skipped").length;

  const handleImport = async () => {
    if (!file) return;
    setStep("importing");
    try {
      // Build manual mappings from match entries (manual + auto_name + saved overrides)
      const manualMappings = matchEntries
        .filter(e => e.profile_id && (e.match_type === "manual" || e.match_type === "auto_name" || e.match_type === "auto_code" || e.match_type === "saved"))
        .map(e => ({ employee_code: e.employee_code, profile_id: e.profile_id! }));

      const result = await importMutation.mutateAsync({
        fileData: fileData || undefined,
        textContent: textContent || undefined,
        fileName: file.name,
        manualMappings: manualMappings.length > 0 ? manualMappings : undefined,
      });
      setImportResult(result);
      setStep("summary");
    } catch {
      setStep("match");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  // Flatten all employee records for the preview table
  const allRecords = previewData?.employees?.flatMap(emp =>
    emp.records.map(rec => ({ ...rec, employee_code: emp.employee_code, employee_name: emp.employee_name, department: emp.department }))
  ) || [];

  const filteredRecords = searchTerm
    ? allRecords.filter(r =>
        r.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.date?.includes(searchTerm)
      )
    : allRecords;

  const stepperSteps = [
    { key: "upload", label: "Upload" },
    { key: "preview", label: "Preview & Validate" },
    { key: "match", label: "Match Employees" },
    { key: "summary", label: "Import Summary" },
  ] as const;

  return (
    <div className="space-y-6 p-1">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {stepperSteps.map((s, i) => {
          const stepOrder = ["upload", "preview", "match", "importing", "summary"];
          const currentIdx = stepOrder.indexOf(step);
          const thisIdx = stepOrder.indexOf(s.key);
          const isActive = step === s.key || (s.key === "summary" && step === "importing");
          const isPast = currentIdx > thisIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-colors",
                isActive ? "bg-primary text-primary-foreground"
                  : isPast ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </div>
              <span className={cn(
                "text-sm font-medium hidden sm:inline",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                {s.label}
              </span>
              {i < stepperSteps.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      {/* ═══ STEP 1: UPLOAD ═══ */}
      {step === "upload" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="h-5 w-5 text-primary" />
                Upload Biometric Attendance Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "rounded-xl border-2 border-dashed p-12 transition-all text-center cursor-pointer",
                  isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.csv,.xlsx,.xls"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {isDragging ? "Drop your file here" : "Drag & drop or click to browse"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supports Secureye ONtime PDF, TXT, CSV, XLSX
                    </p>
                  </div>
                </div>
              </div>

              {file && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <Button
                    onClick={handlePreview}
                    disabled={previewMutation.isPending}
                    size="sm"
                  >
                    {previewMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Parsing PDF...</>
                    ) : (
                      <><ArrowRight className="h-4 w-4 mr-2" />Parse & Preview</>
                    )}
                  </Button>
                </div>
              )}

              {previewMutation.isPending && (
                <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-primary" />
                  <span className="text-sm text-foreground">Analyzing PDF with AI vision... This may take 15-30 seconds.</span>
                </div>
              )}

              {previewData && !previewData.success && (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="font-semibold text-sm text-destructive">Parse Failed</span>
                  </div>
                  {previewData.errors?.map((e, i) => (
                    <p key={i} className="text-sm text-muted-foreground">• {e}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Uploads */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Uploads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {uploadLogs && uploadLogs.length > 0 ? (
                  <div className="space-y-3">
                    {uploadLogs.slice(0, 10).map((log) => (
                      <div key={log.id} className="rounded-md border border-border p-3 text-xs space-y-1">
                        <p className="font-medium text-foreground truncate">{log.file_name}</p>
                        <div className="flex justify-between text-muted-foreground">
                          <span>{log.total_punches} punches</span>
                          <span>{log.matched_employees} matched</span>
                        </div>
                        <p className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">No uploads yet</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ STEP 2: PREVIEW & VALIDATE ═══ */}
      {step === "preview" && previewData && (
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{previewData.total_employees}</p>
              <p className="text-xs text-muted-foreground">Employees</p>
            </Card>
            <Card className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{previewData.total_records}</p>
              <p className="text-xs text-muted-foreground">Records</p>
            </Card>
            <Card className="p-4 text-center">
              <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{previewData.format}</p>
              <p className="text-xs text-muted-foreground">Format</p>
            </Card>
            <Card className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-sm font-bold text-foreground">{previewData.report_period || "—"}</p>
              <p className="text-xs text-muted-foreground">Period</p>
            </Card>
          </div>

          {/* Warnings */}
          {previewData.warnings && previewData.warnings.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                    {previewData.warnings.length} Validation Warning(s)
                  </span>
                </div>
                <ScrollArea className="max-h-32">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {previewData.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Preview Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Attendance Preview</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employee or date..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Emp Code</TableHead>
                      <TableHead className="w-40">Employee Name</TableHead>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-20">In Time</TableHead>
                      <TableHead className="w-20">Out Time</TableHead>
                      <TableHead className="w-24">Work Hours</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length > 0 ? filteredRecords.map((rec, i) => {
                      const st = statusConfig[rec.status || ""] || statusConfig.NA;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{rec.employee_code}</TableCell>
                          <TableCell className="text-sm">{rec.employee_name || "—"}</TableCell>
                          <TableCell className="text-sm">{rec.date}</TableCell>
                          <TableCell className="font-mono text-sm">{formatTime(rec.in_time)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatTime(rec.out_time)}</TableCell>
                          <TableCell className="text-sm">{rec.work_hours || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", st.className)}>
                              {st.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    }) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No records match your search
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={reset}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Upload
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {allRecords.length} records ready
              </span>
              <Button onClick={handleProceedToMatch} disabled={allRecords.length === 0}>
                <Link2 className="h-4 w-4 mr-2" />
                Match Employees
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: MATCH EMPLOYEES ═══ */}
      {step === "match" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 text-center border-emerald-500/30">
              <p className="text-2xl font-bold text-emerald-600">{matchedCount}</p>
              <p className="text-xs text-muted-foreground">Matched</p>
            </Card>
            <Card className="p-4 text-center border-destructive/30">
              <p className="text-2xl font-bold text-destructive">{unmatchedCount}</p>
              <p className="text-xs text-muted-foreground">Unmatched</p>
            </Card>
            <Card className="p-4 text-center border-border">
              <p className="text-2xl font-bold text-muted-foreground">{skippedCount}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </Card>
          </div>

          {unmatchedCount > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    {unmatchedCount} employee(s) could not be auto-matched. Please match them manually or skip to exclude their records.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Employee Matching
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Biometric Code</TableHead>
                      <TableHead className="w-40">PDF Name</TableHead>
                      <TableHead className="w-28">PDF Dept</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead>Map to Employee</TableHead>
                      <TableHead className="w-20">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchEntries.map((entry) => (
                      <TableRow key={entry.employee_code} className={cn(
                        entry.match_type === "skipped" && "opacity-50"
                      )}>
                        <TableCell className="font-mono text-xs">{entry.employee_code}</TableCell>
                        <TableCell className="text-sm font-medium">{entry.employee_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.department || "—"}</TableCell>
                        <TableCell>
                          {entry.match_type === "saved" && (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 text-xs">
                              Saved ✓
                            </Badge>
                          )}
                          {entry.match_type === "auto_code" && (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 text-xs">
                              Auto (Code)
                            </Badge>
                          )}
                          {entry.match_type === "auto_name" && (
                            <Badge variant="outline" className="bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400 text-xs">
                              Auto (Name)
                            </Badge>
                          )}
                          {entry.match_type === "manual" && (
                            <Badge variant="outline" className="bg-violet-500/15 text-violet-700 border-violet-500/30 text-xs">
                              Manual
                            </Badge>
                          )}
                          {entry.match_type === "unmatched" && (
                            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-xs">
                              Unmatched
                            </Badge>
                          )}
                          {entry.match_type === "skipped" && (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs">
                              Skipped
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.match_type === "skipped" ? (
                            <span className="text-sm text-muted-foreground italic">Skipped</span>
                          ) : (entry.match_type === "auto_code" || entry.match_type === "saved") ? (
                            <span className="text-sm text-foreground">{entry.profile_name}</span>
                          ) : (
                            <EmployeeCombobox
                              employees={orgProfiles}
                              value={entry.profile_id || ""}
                              onSelect={(id) => handleMatchSelect(entry.employee_code, id)}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.match_type === "skipped" ? (
                            <Button variant="ghost" size="sm" onClick={() => handleUnskip(entry.employee_code)}>
                              Undo
                            </Button>
                          ) : (entry.match_type !== "auto_code" && entry.match_type !== "saved") && (
                            <Button variant="ghost" size="sm" onClick={() => handleSkip(entry.employee_code)} title="Skip this employee">
                              <SkipForward className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep("preview")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Preview
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {matchedCount} of {matchEntries.length} matched
              </span>
              <Button onClick={handleImport} disabled={importMutation.isPending || matchedCount === 0}>
                {importMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" />Confirm & Import</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3.5: IMPORTING ═══ */}
      {step === "importing" && (
        <Card className="p-12 text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
          <p className="font-semibold text-lg text-foreground">Importing Attendance Records</p>
          <p className="text-sm text-muted-foreground mt-1">
            Matching employees and inserting punch data...
          </p>
        </Card>
      )}

      {/* ═══ STEP 4: IMPORT SUMMARY ═══ */}
      {step === "summary" && importResult && (
        <div className="space-y-6">
          <Card className={cn(
            "border-2",
            importResult.success ? "border-emerald-500/30" : "border-destructive/30"
          )}>
            <CardContent className="p-8 text-center">
              {importResult.success ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-4" />
              ) : (
                <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
              )}
              <h2 className="text-xl font-bold text-foreground mb-1">
                {importResult.success ? "Import Complete" : "Import Failed"}
              </h2>
              {importResult.report_period && (
                <p className="text-sm text-muted-foreground">Period: {importResult.report_period}</p>
              )}
            </CardContent>
          </Card>

          {importResult.success && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-foreground">{importResult.matched_employees}</p>
                <p className="text-xs text-muted-foreground mt-1">Employees Matched</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-primary">{importResult.inserted}</p>
                <p className="text-xs text-muted-foreground mt-1">Records Inserted</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-muted-foreground">{importResult.duplicates_skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">Duplicates Skipped</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-3xl font-bold text-foreground">{importResult.total_parsed}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Parsed</p>
              </Card>
            </div>
          )}

          {importResult.unmatched_codes?.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                    {importResult.unmatched_codes.length} Unmatched Employee Code(s)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  These employee codes from the PDF do not match any employees in your system:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {importResult.unmatched_codes.map(c => (
                    <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {importResult.warnings && importResult.warnings.length > 0 && (
            <Card className="border-amber-500/30">
              <CardContent className="p-4">
                <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Validation Warnings
                </p>
                <ScrollArea className="max-h-40">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {importResult.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {importResult.parse_errors?.length > 0 && (
            <Card className="border-destructive/30">
              <CardContent className="p-4">
                <p className="font-semibold text-sm text-destructive mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Errors
                </p>
                <ScrollArea className="max-h-40">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {importResult.parse_errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {importResult.error && !importResult.success && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4">
                <p className="text-sm text-destructive">{importResult.error}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center">
            <Button onClick={reset} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Upload Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
