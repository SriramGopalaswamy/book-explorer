import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Clock } from "lucide-react";
import { useUserOrganization } from "@/hooks/useUserOrganization";

/**
 * GBC-9 / GBC-77 — Surfaces attendance records the new
 * `attendance_pending_review` view flags as needing manager
 * follow-up (absent_unconfirmed / check_out_missing).
 */
export function PendingReviewPanel() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  const { data = [], isLoading } = useQuery({
    queryKey: ["attendance-pending-review", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from("attendance_pending_review")
        .select("*")
        .eq("organization_id", orgId)
        .order("work_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Pending Review
            </CardTitle>
            <CardDescription>
              Attendance records flagged by the daily summary engine — last 30 days.
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
            {data.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No attendance records require manager review.
          </div>
        ) : (
          <div className="overflow-auto max-h-[40vh]">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 bg-muted/30 border-b border-border/40">
                <tr>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Employee</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Issue</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Check In</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">Check Out</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row: any) => (
                  <tr key={`${row.profile_id}-${row.work_date}`} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{row.full_name || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.work_date}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        <Clock className="h-3 w-3 mr-1" />
                        {row.record_status === "absent_unconfirmed" ? "Absent — Unconfirmed" : "Missing Check-out"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.first_check_in ? new Date(row.first_check_in).toLocaleTimeString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.last_check_out ? new Date(row.last_check_out).toLocaleTimeString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
