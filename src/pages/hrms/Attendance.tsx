import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, UserCheck, UserX, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";

const attendanceData = [
  { id: 1, name: "Rahul Sharma", department: "Engineering", date: "2024-01-15", checkIn: "09:02 AM", checkOut: "06:15 PM", hours: "9h 13m", status: "present" },
  { id: 2, name: "Priya Patel", department: "Design", date: "2024-01-15", checkIn: "09:30 AM", checkOut: "06:45 PM", hours: "9h 15m", status: "present" },
  { id: 3, name: "Amit Kumar", department: "Sales", date: "2024-01-15", checkIn: "10:15 AM", checkOut: "07:00 PM", hours: "8h 45m", status: "late" },
  { id: 4, name: "Sneha Reddy", department: "HR", date: "2024-01-15", checkIn: "-", checkOut: "-", hours: "-", status: "absent" },
  { id: 5, name: "Vikram Singh", department: "Engineering", date: "2024-01-15", checkIn: "08:45 AM", checkOut: "05:30 PM", hours: "8h 45m", status: "present" },
  { id: 6, name: "Ananya Gupta", department: "Marketing", date: "2024-01-15", checkIn: "09:00 AM", checkOut: "-", hours: "Working", status: "present" },
  { id: 7, name: "Karthik Nair", department: "Finance", date: "2024-01-15", checkIn: "-", checkOut: "-", hours: "-", status: "leave" },
];

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekData = [
  { day: "Mon", present: 42, absent: 3, late: 2, leave: 1 },
  { day: "Tue", present: 44, absent: 1, late: 3, leave: 0 },
  { day: "Wed", present: 40, absent: 4, late: 1, leave: 3 },
  { day: "Thu", present: 43, absent: 2, late: 2, leave: 1 },
  { day: "Fri", present: 41, absent: 3, late: 3, leave: 1 },
];

export default function Attendance() {
  const [selectedDate, setSelectedDate] = useState("2024-01-15");

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      present: "bg-green-100 text-green-700 border-green-200",
      late: "bg-amber-100 text-amber-700 border-amber-200",
      absent: "bg-red-100 text-red-700 border-red-200",
      leave: "bg-blue-100 text-blue-700 border-blue-200",
    };
    return styles[status] || "";
  };

  return (
    <MainLayout title="Attendance" subtitle="Track employee attendance and work hours">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Present Today</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">42</div>
            <p className="text-xs text-muted-foreground">Out of 48 employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Absent</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">3</div>
            <p className="text-xs text-muted-foreground">Unplanned absences</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Late Arrivals</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">2</div>
            <p className="text-xs text-muted-foreground">After 9:30 AM</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On Leave</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">1</div>
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
            {weekData.map((day, idx) => (
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
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Daily Attendance</CardTitle>
            <CardDescription>Employee check-in and check-out records</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
            <Button variant="outline" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="relative ml-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employee..." className="pl-9 w-48" />
            </div>
            <Select defaultValue="all">
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
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Working Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceData.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.name}</TableCell>
                  <TableCell>{record.department}</TableCell>
                  <TableCell>{record.checkIn}</TableCell>
                  <TableCell>{record.checkOut}</TableCell>
                  <TableCell>{record.hours}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusBadge(record.status)}>
                      {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
