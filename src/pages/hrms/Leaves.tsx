import { useState, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Check, X, Plus, Palmtree, Stethoscope, Baby, Briefcase, Home, Settings, Pencil, Paperclip, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { 
  useLeaveRequests, 
  useLeaveBalances, 
  useHolidays, 
  useCreateLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useLeaveTypes,
  useAllLeaveTypes,
  useCreateLeaveType,
  useUpdateLeaveType,
  type LeaveRequest,
  type LeaveType,
} from "@/hooks/useLeaves";
import { useIsAdminOrHR, useIsAdminHROrFinance } from "@/hooks/useEmployees";

const iconMap: Record<string, typeof Palmtree> = {
  Palmtree, Stethoscope, Baby, Briefcase, Home, Calendar,
};

function getIcon(iconName: string) {
  return iconMap[iconName] || Briefcase;
}

export default function Leaves() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [leaveType, setLeaveType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  // New leave type form
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("Briefcase");
  const [newColor, setNewColor] = useState("text-blue-600");
  const [newDefaultDays, setNewDefaultDays] = useState(12);

  const { data: leaveRequests = [], isLoading: isLoadingRequests } = useLeaveRequests(activeTab);
  const { data: leaveBalances = [], isLoading: isLoadingBalances } = useLeaveBalances();
  const { data: holidaysRaw = [] } = useHolidays();
  const { data: activeLeaveTypes = [] } = useLeaveTypes();
  const { data: allLeaveTypes = [] } = useAllLeaveTypes();
  const today = new Date().toISOString().split("T")[0];
  const holidays = holidaysRaw.filter((h) => h.date >= today);
  const { data: isAdminOrHR } = useIsAdminOrHR();
  const { data: isAdminHROrFinance } = useIsAdminHROrFinance();
  
  const createLeaveRequest = useCreateLeaveRequest();
  const approveRequest = useApproveLeaveRequest();
  const rejectRequest = useRejectLeaveRequest();
  const createLeaveType = useCreateLeaveType();
  const updateLeaveType = useUpdateLeaveType();

  const pagination = usePagination(leaveRequests, 10);

  // Build a lookup from active leave types
  const leaveTypeConfig = useMemo(() => {
    const config: Record<string, { icon: typeof Palmtree; color: string; label: string }> = {};
    for (const lt of activeLeaveTypes) {
      config[lt.key] = { icon: getIcon(lt.icon), color: lt.color, label: lt.label };
    }
    // Fallback defaults if DB hasn't loaded yet
    if (Object.keys(config).length === 0) {
      config.casual = { icon: Palmtree, color: "text-green-600", label: "Casual Leave" };
      config.sick = { icon: Stethoscope, color: "text-red-600", label: "Sick Leave" };
      config.earned = { icon: Briefcase, color: "text-blue-600", label: "Earned Leave" };
      config.maternity = { icon: Baby, color: "text-purple-600", label: "Maternity Leave" };
      config.paternity = { icon: Baby, color: "text-purple-600", label: "Paternity Leave" };
      config.wfh = { icon: Home, color: "text-orange-600", label: "Work From Home" };
    }
    return config;
  }, [activeLeaveTypes]);

  // Set default leave type when types load
  const defaultLeaveType = activeLeaveTypes.length > 0 ? activeLeaveTypes[0].key : "casual";

  const handleSubmitLeave = async () => {
    if (!fromDate || !toDate) return;

    const selectedType = leaveType || defaultLeaveType;

    const [fy, fm, fd] = fromDate.split("-").map(Number);
    const [ty, tm, td] = toDate.split("-").map(Number);
    const from = new Date(fy, fm - 1, fd);
    const to = new Date(ty, tm - 1, td);

    if (to < from) {
      toast.error("To date cannot be before From date.");
      return;
    }
    const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days > 365) {
      toast.error("Leave duration cannot exceed 365 days.");
      return;
    }

    await createLeaveRequest.mutateAsync({
      leave_type: selectedType,
      from_date: fromDate,
      to_date: toDate,
      reason,
      attachment,
    });
    
    setIsDialogOpen(false);
    setFromDate("");
    setToDate("");
    setReason("");
    setLeaveType("");
    setAttachment(null);
  };

  const handleCreateLeaveType = async () => {
    if (!newKey || !newLabel) {
      toast.error("Key and Label are required");
      return;
    }
    await createLeaveType.mutateAsync({
      key: newKey.toLowerCase().replace(/\s+/g, "_"),
      label: newLabel,
      icon: newIcon,
      color: newColor,
      default_days: newDefaultDays,
      sort_order: allLeaveTypes.length + 1,
    });
    setNewKey("");
    setNewLabel("");
    setNewIcon("Briefcase");
    setNewColor("text-blue-600");
    setNewDefaultDays(12);
  };

  const handleUpdateLeaveType = async () => {
    if (!editingType) return;
    await updateLeaveType.mutateAsync({
      id: editingType.id,
      label: editingType.label,
      icon: editingType.icon,
      color: editingType.color,
      default_days: editingType.default_days,
      is_active: editingType.is_active,
    });
    setIsEditOpen(false);
    setEditingType(null);
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
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 mb-6">
        {isLoadingBalances ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : (
          leaveBalances.map((leave) => {
            const config = leaveTypeConfig[leave.leave_type] || { icon: Briefcase, color: "text-muted-foreground", label: leave.leave_type };
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
            <div className="flex gap-2">
              {isAdminHROrFinance && (
                <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Manage Types
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Manage Leave Types</DialogTitle>
                      <DialogDescription>Create or modify leave types available to employees</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {/* Existing types */}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Existing Types</Label>
                        {allLeaveTypes.map((lt) => {
                          const Icon = getIcon(lt.icon);
                          return (
                            <div key={lt.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <Icon className={`h-4 w-4 ${lt.color}`} />
                                <div>
                                  <p className="text-sm font-medium">{lt.label}</p>
                                  <p className="text-xs text-muted-foreground">Key: {lt.key} · {lt.default_days} days</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={lt.is_active ? "default" : "secondary"}>
                                  {lt.is_active ? "Active" : "Inactive"}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingType({ ...lt }); setIsEditOpen(true); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add new type */}
                      <div className="border-t pt-4 space-y-3">
                        <Label className="text-sm font-semibold">Add New Leave Type</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Key (unique)</Label>
                            <Input placeholder="e.g. comp_off" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Display Label</Label>
                            <Input placeholder="e.g. Compensatory Off" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Icon</Label>
                            <Select value={newIcon} onValueChange={setNewIcon}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Palmtree">🌴 Palmtree</SelectItem>
                                <SelectItem value="Stethoscope">🩺 Stethoscope</SelectItem>
                                <SelectItem value="Baby">👶 Baby</SelectItem>
                                <SelectItem value="Briefcase">💼 Briefcase</SelectItem>
                                <SelectItem value="Home">🏠 Home</SelectItem>
                                <SelectItem value="Calendar">📅 Calendar</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Color</Label>
                            <Select value={newColor} onValueChange={setNewColor}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text-green-600">Green</SelectItem>
                                <SelectItem value="text-red-600">Red</SelectItem>
                                <SelectItem value="text-blue-600">Blue</SelectItem>
                                <SelectItem value="text-purple-600">Purple</SelectItem>
                                <SelectItem value="text-orange-600">Orange</SelectItem>
                                <SelectItem value="text-pink-600">Pink</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Default Days</Label>
                            <Input type="number" min={0} value={newDefaultDays} onChange={(e) => setNewDefaultDays(Number(e.target.value))} />
                          </div>
                        </div>
                        <Button onClick={handleCreateLeaveType} disabled={createLeaveType.isPending || !newKey || !newLabel} className="w-full">
                          <Plus className="h-4 w-4 mr-2" />
                          {createLeaveType.isPending ? "Creating..." : "Add Leave Type"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Edit Leave Type Dialog */}
              <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Leave Type</DialogTitle>
                  </DialogHeader>
                  {editingType && (
                    <div className="space-y-4 py-4">
                      <div className="space-y-1">
                        <Label>Label</Label>
                        <Input value={editingType.label} onChange={(e) => setEditingType({ ...editingType, label: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Icon</Label>
                          <Select value={editingType.icon} onValueChange={(v) => setEditingType({ ...editingType, icon: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Palmtree">🌴 Palmtree</SelectItem>
                              <SelectItem value="Stethoscope">🩺 Stethoscope</SelectItem>
                              <SelectItem value="Baby">👶 Baby</SelectItem>
                              <SelectItem value="Briefcase">💼 Briefcase</SelectItem>
                              <SelectItem value="Home">🏠 Home</SelectItem>
                              <SelectItem value="Calendar">📅 Calendar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Color</Label>
                          <Select value={editingType.color} onValueChange={(v) => setEditingType({ ...editingType, color: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text-green-600">Green</SelectItem>
                              <SelectItem value="text-red-600">Red</SelectItem>
                              <SelectItem value="text-blue-600">Blue</SelectItem>
                              <SelectItem value="text-purple-600">Purple</SelectItem>
                              <SelectItem value="text-orange-600">Orange</SelectItem>
                              <SelectItem value="text-pink-600">Pink</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Default Days</Label>
                        <Input type="number" min={0} value={editingType.default_days} onChange={(e) => setEditingType({ ...editingType, default_days: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>Active</Label>
                        <Switch checked={editingType.is_active} onCheckedChange={(v) => setEditingType({ ...editingType, is_active: v })} />
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateLeaveType} disabled={updateLeaveType.isPending}>
                      {updateLeaveType.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

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
                      <Select value={leaveType || defaultLeaveType} onValueChange={(v) => setLeaveType(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select leave type" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeLeaveTypes.map((lt) => (
                            <SelectItem key={lt.key} value={lt.key}>{lt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>From Date</Label>
                        <Input 
                          type="date" 
                          value={fromDate}
                          min="2020-01-01"
                          max="2099-12-31"
                          onChange={(e) => setFromDate(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>To Date</Label>
                        <Input 
                          type="date" 
                          value={toDate}
                          min={fromDate || "2020-01-01"}
                          max="2099-12-31"
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
                    <div className="grid gap-2">
                      <Label className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Attach Document
                        <span className="text-xs text-muted-foreground font-normal">(optional — PDF or image)</span>
                      </Label>
                      <div className="relative">
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                          className="cursor-pointer"
                        />
                      </div>
                      {attachment && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                          {attachment.type.startsWith("image/") ? (
                            <Image className="h-4 w-4 shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate">{attachment.name}</span>
                          <span className="text-xs">({(attachment.size / 1024).toFixed(0)} KB)</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-auto shrink-0"
                            onClick={() => setAttachment(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
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
            </div>
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
                  <div className="w-full overflow-x-auto">
                    <div className="min-w-[580px]">
                      <div className={`grid border-b border-border/50 bg-muted/30 rounded-t-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 ${isAdminOrHR ? "grid-cols-[minmax(100px,1.2fr)_minmax(90px,1fr)_minmax(140px,1.5fr)_60px_minmax(100px,1.2fr)_90px_80px]" : "grid-cols-[minmax(100px,1.2fr)_minmax(90px,1fr)_minmax(140px,1.5fr)_60px_minmax(100px,1.2fr)_90px]"}`}>
                        <span>Employee</span>
                        <span>Type</span>
                        <span>Duration</span>
                        <span>Days</span>
                        <span>Reason</span>
                        <span>Status</span>
                        {isAdminOrHR && <span>Actions</span>}
                      </div>
                      {pagination.paginatedItems.map((request, idx) => (
                        <div
                          key={request.id}
                          className={`grid items-center border-b border-border/50 px-4 py-3 text-sm ${isAdminOrHR ? "grid-cols-[minmax(100px,1.2fr)_minmax(90px,1fr)_minmax(140px,1.5fr)_60px_minmax(100px,1.2fr)_90px_80px]" : "grid-cols-[minmax(100px,1.2fr)_minmax(90px,1fr)_minmax(140px,1.5fr)_60px_minmax(100px,1.2fr)_90px]"} ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                        >
                          <span className="font-medium truncate pr-2">{request.profiles?.full_name ?? "You"}</span>
                          <span className="truncate pr-2">{leaveTypeConfig[request.leave_type]?.label || request.leave_type}</span>
                          <span className="text-xs text-muted-foreground pr-2">
                            {(() => {
                              const [fy, fm, fd] = request.from_date.split("-").map(Number);
                              const [ty, tm, td] = request.to_date.split("-").map(Number);
                              const from = new Date(fy, fm - 1, fd);
                              const to = new Date(ty, tm - 1, td);
                              return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
                            })()}
                          </span>
                          <span>{request.days}</span>
                          <span className="text-xs text-muted-foreground truncate pr-2" title={request.reason || "—"}>
                            {request.reason || "—"}
                          </span>
                          <span>
                            <Badge variant="outline" className={getStatusBadge(request.status)}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                          </span>
                          {isAdminOrHR && (
                            <span>
                              {request.status === "pending" && (
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => approveRequest.mutate(request.id)} disabled={approveRequest.isPending}><Check className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => rejectRequest.mutate(request.id)} disabled={rejectRequest.isPending}><X className="h-4 w-4" /></Button>
                                </div>
                              )}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
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
