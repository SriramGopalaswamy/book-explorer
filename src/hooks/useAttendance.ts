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
      const { data, error } = await supabase
        .from("attendance_records")
        .select("status")
        .eq("date", selectedDate);

      if (error) throw error;

      const stats: AttendanceStats = {
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        total: data.length,
      };

      data.forEach((record) => {
        if (record.status === "present" || record.status === "half_day") {
          stats.present++;
        } else if (record.status === "absent") {
          stats.absent++;
        } else if (record.status === "late") {
          stats.late++;
        } else if (record.status === "leave") {
          stats.leave++;
        }
      });

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

      const { data, error } = await supabase
        .from("attendance_records")
        .select("date, status")
        .gte("date", days[0])
        .lte("date", days[4]);

      if (error) throw error;

      const weekData = days.map((day, idx) => {
        const dayRecords = data.filter((r) => r.date === day);
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
        return {
          day: dayNames[idx],
          present: dayRecords.filter((r) => r.status === "present" || r.status === "half_day").length,
          absent: dayRecords.filter((r) => r.status === "absent").length,
          late: dayRecords.filter((r) => r.status === "late").length,
          leave: dayRecords.filter((r) => r.status === "leave").length,
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