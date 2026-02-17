import { motion } from "framer-motion";
import { Users, Clock, CalendarOff, UserCheck, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDirectReports,
  useDirectReportsAttendance,
  useDirectReportsLeaves,
  useIsManager,
} from "@/hooks/useManagerTeam";
import { format } from "date-fns";

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  on_leave: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

export function ManagerTeamSection() {
  const { data: isManager, isLoading: roleLoading } = useIsManager();
  const { data: reports = [], isLoading: reportsLoading } = useDirectReports();
  const { data: attendance = [] } = useDirectReportsAttendance();
  const { data: pendingLeaves = [] } = useDirectReportsLeaves();

  if (roleLoading) return null;
  if (!isManager || reports.length === 0) return null;

  const presentToday = attendance.length;
  const onLeave = reports.filter((r) => r.status === "on_leave").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-hrms" />
        <h3 className="text-lg font-bold text-foreground">My Team</h3>
        <Badge variant="secondary" className="ml-1">
          {reports.length} direct report{reports.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Team Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card/80 backdrop-blur-sm border-emerald-500/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <UserCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{presentToday}</p>
              <p className="text-xs text-muted-foreground">Present Today</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur-sm border-amber-500/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <CalendarOff className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{onLeave}</p>
              <p className="text-xs text-muted-foreground">On Leave</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur-sm border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <AlertCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingLeaves.length}</p>
              <p className="text-xs text-muted-foreground">Pending Leave Requests</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Direct Reports List */}
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Direct Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => {
                const todayRecord = attendance.find(
                  (a) => a.profile_id === report.id
                );
                return (
                  <div
                    key={report.id}
                    className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 p-3 transition-colors hover:bg-muted/30"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={report.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-muted">
                        {getInitials(report.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {report.full_name || "Unnamed"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {report.job_title || report.department || "—"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusColors[report.status || "active"]}`}
                    >
                      {report.status === "on_leave"
                        ? "On Leave"
                        : report.status === "inactive"
                        ? "Inactive"
                        : "Active"}
                    </Badge>
                    {todayRecord && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {todayRecord.check_in
                          ? format(new Date(todayRecord.check_in), "HH:mm")
                          : "—"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Leave Requests */}
      {pendingLeaves.length > 0 && (
        <Card className="bg-card/80 backdrop-blur-sm border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-amber-400" />
              Pending Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingLeaves.slice(0, 5).map((leave) => {
                const employee = reports.find((r) => r.id === leave.profile_id);
                return (
                  <div
                    key={leave.id}
                    className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-amber-500/10 text-amber-400">
                        {getInitials(employee?.full_name || null)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {employee?.full_name || "Employee"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {leave.leave_type} · {format(new Date(leave.from_date), "MMM d")} –{" "}
                        {format(new Date(leave.to_date), "MMM d")} ({leave.days} day
                        {leave.days !== 1 ? "s" : ""})
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                      Pending
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
