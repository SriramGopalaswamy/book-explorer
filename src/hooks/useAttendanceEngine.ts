import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────
export interface AttendancePunch {
  id: string;
  profile_id: string;
  employee_code: string;
  card_no: string | null;
  punch_datetime: string;
  punch_source: string;
  raw_status: string | null;
  upload_batch_id: string | null;
  created_at: string;
}

export interface AttendanceDaily {
  id: string;
  profile_id: string;
  attendance_date: string;
  first_in_time: string | null;
  last_out_time: string | null;
  total_work_minutes: number;
  ot_minutes: number;
  late_minutes: number;
  early_exit_minutes: number;
  status: string;
  locked: boolean;
  calculated_from: string | null;
  profiles?: {
    full_name: string | null;
    department: string | null;
    job_title: string | null;
  } | null;
}

export interface AttendanceUploadLog {
  id: string;
  file_name: string;
  file_type: string;
  total_punches: number;
  matched_employees: number;
  unmatched_codes: string[];
  duplicate_punches: number;
  parse_errors: string[];
  status: string;
  created_at: string;
}

export interface PreviewRecord {
  date: string;
  in_time: string | null;
  out_time: string | null;
  late_minutes: number | null;
  early_departure: number | null;
  work_hours: string | null;
  status: string | undefined;
}

export interface PreviewEmployee {
  employee_code: string;
  employee_name: string;
  department?: string;
  records: PreviewRecord[];
}

export interface PreviewResult {
  success: boolean;
  preview: boolean;
  employees: PreviewEmployee[];
  total_records: number;
  total_employees: number;
  format: string;
  warnings: string[];
  errors: string[];
  extraction_method: string;
  report_period?: string;
  organization?: string;
}

export interface UploadParseResult {
  success: boolean;
  format: string;
  batch_id?: string;
  total_parsed: number;
  inserted: number;
  duplicates_skipped: number;
  matched_employees: number;
  matched_employee_codes?: string[];
  unmatched_codes: string[];
  parse_errors: string[];
  warnings?: string[];
  extraction_method?: string;
  report_period?: string;
  error?: string;
}

// ─── Hooks ─────────────────────────────────────────

export function useAttendanceDaily(dateRange?: { from: string; to: string }) {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const from = dateRange?.from || today;
  const to = dateRange?.to || today;

  return useQuery({
    queryKey: ["attendance-daily", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_daily")
        .select("*, profiles!profile_id(full_name, department, job_title)")
        .gte("attendance_date", from)
        .lte("attendance_date", to)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceDaily[];
    },
    enabled: !!user,
  });
}

export function useAttendancePunches(date?: string) {
  const { user } = useAuth();
  const today = date || new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["attendance-punches", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("*")
        .gte("punch_datetime", `${today}T00:00:00`)
        .lte("punch_datetime", `${today}T23:59:59`)
        .order("punch_datetime", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttendancePunch[];
    },
    enabled: !!user,
  });
}

export function useAttendanceUploadLogs() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["attendance-upload-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_upload_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AttendanceUploadLog[];
    },
    enabled: !!user,
  });
}

/** Preview-only parse — does NOT insert into DB */
export function usePreviewBiometricAttendance() {
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      textContent,
      fileData,
      fileName,
    }: {
      textContent?: string;
      fileData?: string;
      fileName: string;
    }): Promise<PreviewResult> => {
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      const body: Record<string, any> = {
        organization_id: orgId,
        file_name: fileName,
        preview_only: true,
      };
      if (fileData) body.file_data = fileData;
      else if (textContent) body.text_content = textContent;
      else throw new Error("No file content provided");

      const { data, error } = await supabase.functions.invoke("parse-attendance", { body });
      if (error) throw error;
      return data as PreviewResult;
    },
    onError: (err: any) => {
      toast.error("Preview failed: " + err.message);
    },
  });
}

/** Final import — inserts parsed data into DB */
export function useUploadBiometricAttendance() {
  const queryClient = useQueryClient();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      textContent,
      fileData,
      fileName,
      manualMappings,
    }: {
      textContent?: string;
      fileData?: string;
      fileName: string;
      manualMappings?: { employee_code: string; profile_id: string }[];
    }): Promise<UploadParseResult> => {
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      const body: Record<string, any> = {
        organization_id: orgId,
        file_name: fileName,
      };
      if (fileData) body.file_data = fileData;
      else if (textContent) body.text_content = textContent;
      else throw new Error("No file content provided");
      if (manualMappings && manualMappings.length > 0) body.manual_mappings = manualMappings;

      const { data, error } = await supabase.functions.invoke("parse-attendance", { body });
      if (error) throw error;
      return data as UploadParseResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-punches"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-daily"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-upload-logs"] });
      if (data.success) {
        toast.success(
          `Imported ${data.inserted} punches (${data.duplicates_skipped} duplicates skipped)`
        );
      }
    },
    onError: (err: any) => {
      toast.error("Upload failed: " + err.message);
    },
  });
}

export function useRecalculateAttendance() {
  const queryClient = useQueryClient();
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");
      if (startDate > endDate) throw new Error("Start date must be before end date");
      const daySpan = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
      if (daySpan > 90) throw new Error("Range cannot exceed 90 days");

      const { data, error } = await supabase.rpc("recalculate_attendance", {
        _org_id: orgId, _start_date: startDate, _end_date: endDate,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-daily"] });
      if (data?.success) toast.success(`Recalculated: ${data.processed} days processed`);
      else toast.error(data?.error || "Recalculation failed");
    },
    onError: (err: any) => {
      toast.error("Recalculation failed: " + err.message);
    },
  });
}

export function usePayrollAttendanceSummary(month?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["payroll-attendance-summary", month],
    queryFn: async () => {
      if (!month) return [];
      const monthDate = `${month}-01`;
      const { data, error } = await supabase
        .from("payroll_attendance_summary" as any)
        .select("*")
        .eq("month", monthDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!month,
  });
}
