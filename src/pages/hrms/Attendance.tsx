import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Clock, 
  UserCheck, 
  UserX, 
  Search, 
   
  ChevronLeft, 
  ChevronRight,
  LogIn,
  LogOut,
  Timer
} from "lucide-react";
import { 
  useAttendance, 
  useAttendanceStats, 
  useWeeklyAttendanceStats,
  useMyTodayAttendance,
  useSelfCheckIn,
  useSelfCheckOut
} from "@/hooks/useAttendance";
import { format, addDays, subDays } from "date-fns";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useAttendanceBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";

export default function Attendance() {
  const bulkUploadConfig = useAttendanceBulkUpload();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  const { data: attendance = [], isLoading } = useAttendance(selectedDate);
  const { data: stats } = useAttendanceStats(selectedDate);
  const { data: weekData = [] } = useWeeklyAttendanceStats();
  const { data: myAttendance, isLoading: isLoadingMyAttendance } = useMyTodayAttendance();
  
  const checkIn = useSelfCheckIn();
  const checkOut = useSelfCheckOut();

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredAttendance = attendance.filter((record) => {
    const matchesStatus = statusFilter === "all" || record.status === statusFilter;
    const matchesSearch = !searchTerm || 
      record.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.profiles?.department?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pagination = usePagination(filteredAttendance, 10);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      present: "bg-success/20 text-success border-success/30",
      late: "bg-warning/20 text-warning border-warning/30",
      absent: "bg-destructive/20 text-destructive border-destructive/30",
      leave: "bg-primary/20 text-primary border-primary/30",
      half_day: "bg-secondary text-secondary-foreground border-secondary",
    };
    return styles[status] || "";
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "-";
    return format(new Date(timestamp), "hh:mm a");
  };

  const calculateHours = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn) return "-";
    if (!checkOut) return "Working";
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handlePrevDay = () => {
    const prev = subDays(new Date(selectedDate), 1);
    setSelectedDate(prev.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const next = addDays(new Date(selectedDate), 1);
    setSelectedDate(next.toISOString().split("T")[0]);
  };

  const handleCheckIn = () => {
    checkIn.mutate();
  };

  const handleCheckOut = () => {
    if (myAttendance?.id) {
      checkOut.mutate(myAttendance.id);
    }
  };

  const getWorkingDuration = () => {
    if (!myAttendance?.check_in) return null;
    const start = new Date(myAttendance.check_in);
    const end = myAttendance.check_out ? new Date(myAttendance.check_out) : currentTime;
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    return { hours, minutes, seconds };
  };

  const workingDuration = getWorkingDuration();

  return (
    <MainLayout title="Attendance" subtitle="Track employee attendance and work hours">
      {/* Self Check-in/Check-out Card */}
      <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-primary" />
                My Attendance - {format(currentTime, "EEEE, MMMM d, yyyy")}
              </CardTitle>
              <CardDescription>
                Current time: {format(currentTime, "hh:mm:ss a")}
              </CardDescription>
            </div>
            {myAttendance?.status && (
              <Badge 
                variant="outline" 
                className={getStatusBadge(myAttendance.status)}
              >
                {myAttendance.status.charAt(0).toUpperCase() + myAttendance.status.slice(1)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMyAttendance ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex items-center gap-6">
              {/* Check-in/Check-out Status */}
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-background border">
                  <p className="text-xs text-muted-foreground mb-1">Check In</p>
                  <p className="text-lg font-semibold">
                    {myAttendance?.check_in ? format(new Date(myAttendance.check_in), "hh:mm a") : "--:--"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-background border">
                  <p className="text-xs text-muted-foreground mb-1">Check Out</p>
                  <p className="text-lg font-semibold">
                    {myAttendance?.check_out ? format(new Date(myAttendance.check_out), "hh:mm a") : "--:--"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-background border">
                  <p className="text-xs text-muted-foreground mb-1">Working Hours</p>
                  <p className="text-lg font-semibold">
                    {workingDuration 
                      ? `${workingDuration.hours}h ${workingDuration.minutes}m ${!myAttendance?.check_out ? `${workingDuration.seconds}s` : ''}`
                      : "--:--"
                    }
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {!myAttendance?.check_in ? (
                  <Button 
                    onClick={handleCheckIn}
                    disabled={checkIn.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                  >
                    <LogIn className="mr-2 h-5 w-5" />
                    {checkIn.isPending ? "Checking in..." : "Check In"}
                  </Button>
                ) : !myAttendance?.check_out ? (
                  <Button 
                    onClick={handleCheckOut}
                    disabled={checkOut.isPending}
                    variant="destructive"
                    size="lg"
                  >
                    <LogOut className="mr-2 h-5 w-5" />
                    {checkOut.isPending ? "Checking out..." : "Check Out"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserCheck className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Attendance recorded for today</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Present Today</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.present || 0}</div>
            <p className="text-xs text-muted-foreground">Out of {stats?.total || 0} employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Absent</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.absent || 0}</div>
            <p className="text-xs text-muted-foreground">Unplanned absences</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Late Arrivals</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.late || 0}</div>
            <p className="text-xs text-muted-foreground">After 9:30 AM</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On Leave</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.leave || 0}</div>
            <p className="text-xs text-muted-foreground">Approved leaves</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Overview */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Weekly Overview</CardTitle>
          <CardDescription>Attendance summary for the current week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {weekData.length > 0 ? weekData.map((day, idx) => (
              <div key={day.day} className={`p-4 rounded-lg border ${idx === 0 ? "border-primary bg-primary/5" : ""}`}>
                <p className="text-sm font-medium text-center mb-3">{day.day}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Present</span>
                    <span className="font-medium">{day.present}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-red-600">Absent</span>
                    <span className="font-medium">{day.absent}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-600">Late</span>
                    <span className="font-medium">{day.late}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-blue-600">Leave</span>
                    <span className="font-medium">{day.leave}</span>
                  </div>
                </div>
              </div>
            )) : (
              Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-32" />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daily Attendance</CardTitle>
                <CardDescription>Employee check-in and check-out records</CardDescription>
              </div>
              <BulkUploadDialog config={bulkUploadConfig} />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={handlePrevDay}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-36"
                />
                <Button variant="outline" size="icon" onClick={handleNextDay}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search employee..." 
                  className="pl-9 w-44" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredAttendance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground p-6">
              No attendance records found for this date
            </div>
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm text-card-foreground">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="h-11 px-6 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 w-48">Employee</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 w-36">Department</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 w-28">Check In</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 w-28">Check Out</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 w-32">Working Hours</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedItems.map((record, idx) => (
                      <tr key={record.id} className={`border-b border-border/30 transition-colors hover:bg-muted/30 ${idx % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <td className="px-6 py-3 align-middle font-semibold w-48 text-card-foreground">{record.profiles?.full_name || "Unknown"}</td>
                        <td className="px-4 py-3 align-middle w-36 text-muted-foreground">{record.profiles?.department || "-"}</td>
                        <td className="px-4 py-3 align-middle w-28 text-card-foreground">{formatTime(record.check_in)}</td>
                        <td className="px-4 py-3 align-middle w-28 text-card-foreground">{formatTime(record.check_out)}</td>
                        <td className="px-4 py-3 align-middle w-32 text-card-foreground">{calculateHours(record.check_in, record.check_out)}</td>
                        <td className="px-4 py-3 align-middle w-28">
                          <Badge variant="outline" className={getStatusBadge(record.status)}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1).replace("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t border-border/40">
                <TablePagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  from={pagination.from}
                  to={pagination.to}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk Upload History */}
      <BulkUploadHistory module="attendance" />
    </MainLayout>
  );
}