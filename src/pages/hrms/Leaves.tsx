import { useState } from "react";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Check, X, Plus, Palmtree, Stethoscope, Baby, Briefcase, Home } from "lucide-react";
import { format } from "date-fns";
import { 
  useLeaveRequests, 
  useLeaveBalances, 
  useHolidays, 
  useCreateLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  type LeaveRequest,
} from "@/hooks/useLeaves";
import { useIsAdminOrHR } from "@/hooks/useEmployees";

const leaveTypeConfig: Record<string, { icon: typeof Palmtree; color: string; label: string }> = {
  casual: { icon: Palmtree, color: "text-green-600", label: "Casual Leave" },
  sick: { icon: Stethoscope, color: "text-red-600", label: "Sick Leave" },
  earned: { icon: Briefcase, color: "text-blue-600", label: "Earned Leave" },
  maternity: { icon: Baby, color: "text-purple-600", label: "Maternity/Paternity" },
  paternity: { icon: Baby, color: "text-purple-600", label: "Maternity/Paternity" },
  wfh: { icon: Home, color: "text-orange-600", label: "Work From Home" },
};

export default function Leaves() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [leaveType, setLeaveType] = useState<LeaveRequest["leave_type"]>("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: leaveRequests = [], isLoading: isLoadingRequests } = useLeaveRequests(activeTab);
  const { data: leaveBalances = [], isLoading: isLoadingBalances } = useLeaveBalances();
  const { data: holidays = [] } = useHolidays();
  const { data: isAdminOrHR } = useIsAdminOrHR();
  
  const createLeaveRequest = useCreateLeaveRequest();
  const approveRequest = useApproveLeaveRequest();
  const rejectRequest = useRejectLeaveRequest();

  const pagination = usePagination(leaveRequests, 10);

  const handleSubmitLeave = async () => {
    if (!fromDate || !toDate) return;
    
    await createLeaveRequest.mutateAsync({
      leave_type: leaveType,
      from_date: fromDate,
      to_date: toDate,
      reason,
    });
    
    setIsDialogOpen(false);
    setFromDate("");
    setToDate("");
    setReason("");
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      approved: "bg-green-100 text-green-700 border-green-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
    };
    return styles[status] || "";
  };

  return (
    <MainLayout title="Leave Management" subtitle="Apply for leaves and track balances">
      {/* Leave Balance Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {isLoadingBalances ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : (
          leaveBalances.slice(0, 4).map((leave) => {
            const config = leaveTypeConfig[leave.leave_type] || leaveTypeConfig.casual;
            const Icon = config.icon;
            const remaining = leave.total_days - leave.used_days;
            
            return (
              <Card key={leave.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {config.label}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{remaining}</span>
                    <span className="text-sm text-muted-foreground">/ {leave.total_days} days</span>
                  </div>
                  <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(leave.used_days / leave.total_days) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{leave.used_days} days used</p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Leave Requests */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Leave Requests</CardTitle>
              <CardDescription>View and manage leave applications</CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Apply Leave
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Apply for Leave</DialogTitle>
                  <DialogDescription>Submit a new leave request for approval</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Leave Type</Label>
                    <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveRequest["leave_type"])}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select leave type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="casual">Casual Leave</SelectItem>
                        <SelectItem value="sick">Sick Leave</SelectItem>
                        <SelectItem value="earned">Earned Leave</SelectItem>
                        <SelectItem value="wfh">Work From Home</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>From Date</Label>
                      <Input 
                        type="date" 
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>To Date</Label>
                      <Input 
                        type="date" 
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Reason</Label>
                    <Textarea 
                      placeholder="Please provide a reason for your leave request"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmitLeave}
                    disabled={createLeaveRequest.isPending || !fromDate || !toDate}
                  >
                    {createLeaveRequest.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); pagination.setPage(1); }}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab}>
                {isLoadingRequests ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : leaveRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No leave requests found
                  </div>
                ) : (
                  <>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Status</TableHead>
                        {isAdminOrHR && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.paginatedItems.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            {request.profiles?.full_name || "You"}
                          </TableCell>
                          <TableCell>
                            {leaveTypeConfig[request.leave_type]?.label || request.leave_type}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {format(new Date(request.from_date), "MMM d")} - {format(new Date(request.to_date), "MMM d, yyyy")}
                            </span>
                          </TableCell>
                          <TableCell>{request.days}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusBadge(request.status)}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                          </TableCell>
                          {isAdminOrHR && (
                            <TableCell>
                              {request.status === "pending" && (
                                <div className="flex gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-success"
                                    onClick={() => approveRequest.mutate(request.id)}
                                    disabled={approveRequest.isPending}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => rejectRequest.mutate(request.id)}
                                    disabled={rejectRequest.isPending}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  <div className="mt-2">
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Upcoming Holidays */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Holidays</CardTitle>
            <CardDescription>Company holidays for this year</CardDescription>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No holidays configured yet
              </div>
            ) : (
              <div className="space-y-4">
                {holidays.map((holiday) => {
                  const date = new Date(holiday.date);
                  const dayName = format(date, "EEEE");
                  
                  return (
                    <div key={holiday.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-secondary/50 transition-colors">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{holiday.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(date, "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge variant="outline">{dayName}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}