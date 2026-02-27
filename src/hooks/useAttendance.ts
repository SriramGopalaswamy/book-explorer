import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
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
  const selectedDate = date || new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["attendance", selectedDate, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockAttendanceRecords;
      const { data, error } = await supabase
        .from("attendance_records")
        .select(`
          *,
          profiles!profile_id (
            full_name,
            department
          )
        `)
        .eq("date", selectedDate)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: !!user || isDevMode,
  });
}

export function useAttendanceStats(date?: string) {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();
  const selectedDate = date || new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["attendance-stats", selectedDate, isDevMode],
    queryFn: async () => {
      if (isDevMode) return mockAttendanceStats;

      // Fetch attendance records and approved leave requests in parallel
      const [attendanceRes, leaveRes] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("status, user_id, profile_id")
          .eq("date", selectedDate),
        supabase
          .from("leave_requests")
          .select("user_id, profile_id")
          .eq("status", "approved")
          .lte("from_date", selectedDate)
          .gte("to_date", selectedDate),
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      const data = attendanceRes.data;

      const stats: AttendanceStats = {
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        total: data.length,
      };

      // Track profile_ids already marked as leave in attendance_records
      // (profile_id is the reliable employee identifier; user_id may be the admin who created the record)
      const leaveProfileIds = new Set<string>();

      data.forEach((record) => {
        if (record.status === "present" || record.status === "half_day") {
          stats.present++;
        } else if (record.status === "absent") {
          stats.absent++;
        } else if (record.status === "late") {
          stats.late++;
        } else if (record.status === "leave") {
          stats.leave++;
          if (record.profile_id) leaveProfileIds.add(record.profile_id);
        }
      });

      // Add approved leaves that don't already have an attendance record with status 'leave'
      // Use both profile_id and user_id for deduplication to handle data with either identifier
      if (leaveRes.data) {
        const leaveUserIds = new Set<string>();
        data.forEach((record) => {
          if (record.status === "leave" && record.user_id) leaveUserIds.add(record.user_id);
        });

        const extraLeaves = leaveRes.data.filter((lr) => {
          // Skip if already counted via profile_id match
          if (lr.profile_id && leaveProfileIds.has(lr.profile_id)) return false;
          // Skip if already counted via user_id match
          if (lr.user_id && leaveUserIds.has(lr.user_id)) return false;
          // Only count if the leave request has at least one identifier
          return !!(lr.profile_id || lr.user_id);
        });
        stats.leave += extraLeaves.length;
        stats.total += extraLeaves.length;
      }

      return stats;
    },
    enabled: !!user || isDevMode,
  });
}

export function useWeeklyAttendanceStats() {
  const { user } = useAuth();
  const isDevMode = useIsDevModeWithoutAuth();

  return useQuery({
    queryKey: ["weekly-attendance-stats", isDevMode],
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
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);

      const days = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date.toISOString().split("T")[0]);
      }

      // Fetch attendance records AND approved leave requests for the week
      const [attendanceRes, leaveRes] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("date, status, profile_id, user_id")
          .gte("date", days[0])
          .lte("date", days[4]),
        supabase
          .from("leave_requests")
          .select("from_date, to_date, profile_id, user_id")
          .eq("status", "approved")
          .lte("from_date", days[4])
          .gte("to_date", days[0]),
      ]);

      if (attendanceRes.error) throw attendanceRes.error;
      const data = attendanceRes.data;
      const leaveData = leaveRes.data || [];

      const weekData = days.map((day, idx) => {
        const dayRecords = data.filter((r) => r.date === day);
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];

        // Count leaves from attendance_records
        const attendanceLeaveProfileIds = new Set<string>();
        const attendanceLeaveUserIds = new Set<string>();
        let leaveCount = 0;

        dayRecords.forEach((r) => {
          if (r.status === "leave") {
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
            }
          }
        });

        return {
          day: dayNames[idx],
          present: dayRecords.filter((r) => r.status === "present" || r.status === "half_day").length,
          absent: dayRecords.filter((r) => r.status === "absent").length,
          late: dayRecords.filter((r) => r.status === "late").length,
          leave: leaveCount,
        };
      });

      return weekData;
    },
    enabled: !!user || isDevMode,
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

      // First get user's profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const { data, error } = await supabase
        .from("attendance_records")
        .insert({
          user_id: user.id,
          profile_id: profile?.id || null,
          date: today,
          check_in: now,
          status,
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

  return useMutation({
    mutationFn: async (recordId: string) => {
      const now = new Date().toISOString();

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

  return useMutation({
    mutationFn: async (recordId: string) => {
      const now = new Date().toISOString();

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
      const { data, error } = await supabase
        .from("attendance_records")
        .upsert({
          ...record,
          user_id: user?.id,
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