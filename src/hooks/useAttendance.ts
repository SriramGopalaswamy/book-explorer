import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { mockAttendanceRecords, mockAttendanceStats } from "@/lib/mock-data";
import { toast } from "sonner";

export interface AttendanceRecord {
  id: string;
  user_id: string;
  profile_id: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: "present" | "absent" | "late" | "leave" | "half_day";
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    department: string | null;
  };
}

export interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
}

export function useAttendance(date?: string) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const selectedDate = date || new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["attendance", selectedDate, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockAttendanceRecords;
      if (!orgId) return [];

      // Fetch attendance records, active profiles, and approved leaves in parallel
      const attendanceQuery = supabase
          .from("attendance_records")
          .select(`
            *,
            profiles!profile_id (
              full_name,
              department
            )
          `)
          .eq("date", selectedDate)
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

      const profilesQuery = supabase
          .from("profiles")
          .select("id, full_name, department")
          .eq("status", "active")
          .eq("organization_id", orgId);

      const leavesQuery = supabase
          .from("leave_requests")
          .select("profile_id, user_id")
          .eq("status", "approved")
          .lte("from_date", selectedDate)
          .gte("to_date", selectedDate)
          .eq("organization_id", orgId);

      const [attendanceRes, profilesRes, leavesRes] = await Promise.all([
        attendanceQuery,
        profilesQuery,
        leavesQuery,
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      const records = attendanceRes.data as AttendanceRecord[];
      const activeProfiles = profilesRes.data || [];
      const approvedLeaves = leavesRes.data || [];

      // Build sets of profile_ids that already have a record or are on approved leave
      const recordedProfileIds = new Set(records.map((r) => r.profile_id).filter(Boolean));
      const leaveProfileIds = new Set(approvedLeaves.map((l) => l.profile_id).filter(Boolean));

      // Generate inferred records for missing employees
      const inferredRecords: AttendanceRecord[] = activeProfiles
        .filter((p) => !recordedProfileIds.has(p.id))
        .map((p) => {
          const isOnLeave = leaveProfileIds.has(p.id);
          return {
            id: `inferred-${p.id}`,
            user_id: "",
            profile_id: p.id,
            date: selectedDate,
            check_in: null,
            check_out: null,
            status: isOnLeave ? "leave" as const : "absent" as const,
            notes: isOnLeave ? "Approved leave" : "No record found",
            created_at: "",
            updated_at: "",
            profiles: { full_name: p.full_name, department: p.department },
          };
        });

      return [...records, ...inferredRecords];
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useAttendanceStats(date?: string) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const selectedDate = date || new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["attendance-stats", selectedDate, orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockAttendanceStats;
      if (!orgId) return { present: 0, absent: 0, late: 0, leave: 0, total: 0 };

      const attQ = supabase
          .from("attendance_records")
          .select("status, user_id, profile_id")
          .eq("date", selectedDate)
          .eq("organization_id", orgId);

      const profQ = supabase
          .from("profiles")
          .select("id")
          .eq("status", "active")
          .eq("organization_id", orgId);

      const leaveQ = supabase
          .from("leave_requests")
          .select("user_id, profile_id")
          .eq("status", "approved")
          .lte("from_date", selectedDate)
          .gte("to_date", selectedDate)
          .eq("organization_id", orgId);

      const [attendanceRes, profilesRes, leaveRes] = await Promise.all([
        attQ, profQ, leaveQ,
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      const data = attendanceRes.data;
      const totalActive = profilesRes.data?.length || 0;
      const approvedLeaves = leaveRes.data || [];

      const stats: AttendanceStats = {
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        total: totalActive,
      };

      const recordedProfileIds = new Set<string>();
      const leaveProfileIds = new Set<string>();

      data.forEach((record) => {
        if (record.profile_id) recordedProfileIds.add(record.profile_id);

        if (record.status === "present" || record.status === "half_day" || record.status === "late") {
          stats.present++;
          if (record.status === "late") {
            stats.late++;
          }
        } else if (record.status === "absent") {
          stats.absent++;
        } else if (record.status === "leave") {
          stats.leave++;
          if (record.profile_id) leaveProfileIds.add(record.profile_id);
        }
      });

      // Add approved leaves without attendance records
      const leaveUserIds = new Set<string>();
      data.forEach((r) => { if (r.status === "leave" && r.user_id) leaveUserIds.add(r.user_id); });

      approvedLeaves.forEach((lr) => {
        const alreadyCounted =
          (lr.profile_id && leaveProfileIds.has(lr.profile_id)) ||
          (lr.user_id && leaveUserIds.has(lr.user_id));
        if (!alreadyCounted && (lr.profile_id || lr.user_id)) {
          stats.leave++;
          if (lr.profile_id) {
            recordedProfileIds.add(lr.profile_id);
            leaveProfileIds.add(lr.profile_id);
          }
        }
      });

      // Everyone not recorded and not on leave is absent
      const inferredAbsent = totalActive - recordedProfileIds.size;
      stats.absent += Math.max(0, inferredAbsent);

      return stats;
    },
    enabled: !!user || isDevMode,
  });
}

export function useWeeklyAttendanceStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["weekly-attendance-stats", orgId, isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        return [
          { day: "Mon", present: 10, absent: 1, late: 1, leave: 0 },
          { day: "Tue", present: 11, absent: 0, late: 1, leave: 0 },
          { day: "Wed", present: 9, absent: 2, late: 1, leave: 0 },
          { day: "Thu", present: 10, absent: 1, late: 0, leave: 1 },
          { day: "Fri", present: 8, absent: 2, late: 1, leave: 1 },
        ];
      }
      if (!orgId) return [];
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);

      const days = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date.toISOString().split("T")[0]);
      }

      // Fetch attendance records, approved leave requests, AND active profiles — org-scoped
      const [attendanceRes, leaveRes, profilesRes] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("date, status, profile_id, user_id")
          .eq("organization_id", orgId)
          .gte("date", days[0])
          .lte("date", days[4]),
        supabase
          .from("leave_requests")
          .select("from_date, to_date, profile_id, user_id")
          .eq("status", "approved")
          .eq("organization_id", orgId)
          .lte("from_date", days[4])
          .gte("to_date", days[0]),
        supabase
          .from("profiles")
          .select("id")
          .eq("status", "active")
          .eq("organization_id", orgId),
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      const data = attendanceRes.data;
      const leaveData = leaveRes.data || [];
      const totalActive = profilesRes.data?.length || 0;

      const weekData = days.map((day, idx) => {
        const dayRecords = data.filter((r) => r.date === day);
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];

        // Track which profile_ids have a record for this day
        const recordedProfileIds = new Set<string>();
        const attendanceLeaveProfileIds = new Set<string>();
        const attendanceLeaveUserIds = new Set<string>();
        let leaveCount = 0;
        let presentCount = 0;
        let lateCount = 0;
        let explicitAbsentCount = 0;

        dayRecords.forEach((r) => {
          if (r.profile_id) recordedProfileIds.add(r.profile_id);
          if (r.status === "present" || r.status === "half_day" || r.status === "late") {
            presentCount++;
            if (r.status === "late") lateCount++;
          } else if (r.status === "absent") {
            explicitAbsentCount++;
          } else if (r.status === "leave") {
            leaveCount++;
            if (r.profile_id) attendanceLeaveProfileIds.add(r.profile_id);
            if (r.user_id) attendanceLeaveUserIds.add(r.user_id);
          }
        });

        // Add approved leave requests covering this day (deduplicated)
        leaveData.forEach((lr) => {
          if (lr.from_date <= day && lr.to_date >= day) {
            const alreadyCounted =
              (lr.profile_id && attendanceLeaveProfileIds.has(lr.profile_id)) ||
              (lr.user_id && attendanceLeaveUserIds.has(lr.user_id));
            if (!alreadyCounted && (lr.profile_id || lr.user_id)) {
              leaveCount++;
              if (lr.profile_id) recordedProfileIds.add(lr.profile_id);
            }
          }
        });

        // Infer absent = total active employees minus those with any record or leave
        const inferredAbsent = Math.max(0, totalActive - recordedProfileIds.size);

        return {
          day: dayNames[idx],
          present: presentCount,
          absent: explicitAbsentCount + inferredAbsent,
          late: lateCount,
          leave: leaveCount,
        };
      });

      return weekData;
    },
    enabled: (!!user && !!orgId) || isDevMode,
  });
}

export function useMyTodayAttendance() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["my-attendance-today", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();

      if (error) throw error;
      return data as AttendanceRecord | null;
    },
    enabled: !!user,
  });
}

export function useSelfCheckIn() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();
      const hour = new Date().getHours();
      const status = hour >= 10 ? "late" : "present";

      // Prevent double check-in
      const { data: existing } = await supabase
        .from("attendance_records")
        .select("id, check_in")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();
      if (existing?.check_in) {
        throw new Error("You have already checked in today");
      }

      // First get user's profile (includes org_id)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.organization_id) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("attendance_records")
        .insert({
          user_id: user.id,
          profile_id: profile?.id || null,
          date: today,
          check_in: now,
          status,
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-attendance-today"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      toast.success("Checked in successfully!");
    },
    onError: (error) => {
      toast.error("Failed to check in: " + error.message);
    },
  });
}

export function useSelfCheckOut() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (recordId: string) => {
      if (!user) throw new Error("Not authenticated");
      const now = new Date().toISOString();

      // Verify record belongs to user and has a check_in but no check_out
      const { data: record } = await supabase
        .from("attendance_records")
        .select("user_id, check_in, check_out")
        .eq("id", recordId)
        .single();
      if (!record) throw new Error("Attendance record not found");
      if (record.user_id !== user.id) throw new Error("You can only check out your own record");
      if (!record.check_in) throw new Error("Cannot check out without checking in first");
      if (record.check_out) throw new Error("You have already checked out today");

      const { data, error } = await supabase
        .from("attendance_records")
        .update({ check_out: now })
        .eq("id", recordId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-attendance-today"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Checked out successfully!");
    },
    onError: (error) => {
      toast.error("Failed to check out: " + error.message);
    },
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (profileId: string) => {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();
      const hour = new Date().getHours();
      const status = hour >= 10 ? "late" : "present";

      const { data, error } = await supabase
        .from("attendance_records")
        .upsert({
          user_id: user?.id,
          profile_id: profileId,
          date: today,
          check_in: now,
          status,
        }, {
          onConflict: "profile_id,date",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      toast.success("Checked in successfully");
    },
    onError: (error) => {
      toast.error("Failed to check in: " + error.message);
    },
  });
}

export function useCheckOut() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (recordId: string) => {
      if (!user) throw new Error("Not authenticated");
      const now = new Date().toISOString();

      // Resolve caller org for tenant isolation
      const { data: callerProfile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (!callerProfile?.organization_id) throw new Error("Organization not found");

      const { data, error } = await supabase
        .from("attendance_records")
        .update({ check_out: now })
        .eq("id", recordId)
        .eq("organization_id", callerProfile.organization_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Checked out successfully");
    },
    onError: (error) => {
      toast.error("Failed to check out: " + error.message);
    },
  });
}

export function useCreateAttendance() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (record: {
      profile_id: string;
      date: string;
      status: "present" | "absent" | "late" | "leave" | "half_day";
      check_in?: string;
      check_out?: string;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate date is not in the future
      const today = new Date().toISOString().split("T")[0];
      if (record.date > today) throw new Error("Cannot create attendance records for future dates");

      // Validate check_out is after check_in
      if (record.check_in && record.check_out && record.check_out <= record.check_in) {
        throw new Error("Check-out time must be after check-in time");
      }

      // Validate status whitelist
      const validStatuses = ["present", "absent", "late", "leave", "half_day"];
      if (!validStatuses.includes(record.status)) {
        throw new Error("Invalid attendance status");
      }

      const { data, error } = await supabase
        .from("attendance_records")
        .upsert({
          ...record,
          user_id: user.id,
        }, {
          onConflict: "profile_id,date",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      toast.success("Attendance record saved");
    },
    onError: (error) => {
      toast.error("Failed to save attendance: " + error.message);
    },
  });
}