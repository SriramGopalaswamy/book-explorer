import { useState } from "react";
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
import { Calendar, Clock, Check, X, Plus, Palmtree, Stethoscope, Baby, Briefcase } from "lucide-react";

const leaveRequests = [
  { id: 1, employee: "Rahul Sharma", type: "Casual Leave", from: "2024-01-20", to: "2024-01-22", days: 3, reason: "Family function", status: "pending" },
  { id: 2, employee: "Priya Patel", type: "Sick Leave", from: "2024-01-18", to: "2024-01-19", days: 2, reason: "Medical appointment", status: "approved" },
  { id: 3, employee: "Amit Kumar", type: "Work From Home", from: "2024-01-17", to: "2024-01-17", days: 1, reason: "Internet installation at home", status: "approved" },
  { id: 4, employee: "Sneha Reddy", type: "Casual Leave", from: "2024-01-25", to: "2024-01-26", days: 2, reason: "Personal work", status: "pending" },
  { id: 5, employee: "Vikram Singh", type: "Sick Leave", from: "2024-01-15", to: "2024-01-16", days: 2, reason: "Fever", status: "rejected" },
];

const leaveBalances = [
  { type: "Casual Leave", icon: Palmtree, total: 12, used: 4, remaining: 8, color: "text-green-600" },
  { type: "Sick Leave", icon: Stethoscope, total: 10, used: 2, remaining: 8, color: "text-red-600" },
  { type: "Earned Leave", icon: Briefcase, total: 15, used: 5, remaining: 10, color: "text-blue-600" },
  { type: "Maternity/Paternity", icon: Baby, total: 180, used: 0, remaining: 180, color: "text-purple-600" },
];

const holidays = [
  { date: "Jan 26, 2024", name: "Republic Day", day: "Friday" },
  { date: "Mar 8, 2024", name: "Maha Shivaratri", day: "Friday" },
  { date: "Mar 25, 2024", name: "Holi", day: "Monday" },
  { date: "Apr 14, 2024", name: "Ambedkar Jayanti", day: "Sunday" },
  { date: "May 1, 2024", name: "May Day", day: "Wednesday" },
];

export default function Leaves() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
        {leaveBalances.map((leave) => (
          <Card key={leave.type}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{leave.type}</CardTitle>
              <leave.icon className={`h-4 w-4 ${leave.color}`} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{leave.remaining}</span>
                <span className="text-sm text-muted-foreground">/ {leave.total} days</span>
              </div>
              <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${((leave.total - leave.remaining) / leave.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{leave.used} days used</p>
            </CardContent>
          </Card>
        ))}
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
                    <Select>
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
                      <Input type="date" />
                    </div>
                    <div className="grid gap-2">
                      <Label>To Date</Label>
                      <Input type="date" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Reason</Label>
                    <Textarea placeholder="Please provide a reason for your leave request" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => setIsDialogOpen(false)}>Submit Request</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
              <TabsContent value="all">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.employee}</TableCell>
                        <TableCell>{request.type}</TableCell>
                        <TableCell>
                          <span className="text-sm">{request.from} - {request.to}</span>
                        </TableCell>
                        <TableCell>{request.days}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusBadge(request.status)}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {request.status === "pending" && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600">
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
            <div className="space-y-4">
              {holidays.map((holiday, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-secondary/50 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{holiday.name}</p>
                    <p className="text-sm text-muted-foreground">{holiday.date}</p>
                  </div>
                  <Badge variant="outline">{holiday.day}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
