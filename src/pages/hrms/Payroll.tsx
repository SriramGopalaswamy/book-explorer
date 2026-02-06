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
import { Wallet, Users, Calendar, TrendingUp, Download, Search, FileText, CheckCircle, Clock } from "lucide-react";

const payrollData = [
  { id: 1, name: "Rahul Sharma", department: "Engineering", designation: "Senior Developer", basic: 80000, allowances: 25000, deductions: 12000, netPay: 93000, status: "processed" },
  { id: 2, name: "Priya Patel", department: "Design", designation: "UI/UX Lead", basic: 75000, allowances: 22000, deductions: 11000, netPay: 86000, status: "processed" },
  { id: 3, name: "Amit Kumar", department: "Sales", designation: "Sales Manager", basic: 70000, allowances: 30000, deductions: 10500, netPay: 89500, status: "pending" },
  { id: 4, name: "Sneha Reddy", department: "HR", designation: "HR Manager", basic: 65000, allowances: 18000, deductions: 9500, netPay: 73500, status: "processed" },
  { id: 5, name: "Vikram Singh", department: "Engineering", designation: "Tech Lead", basic: 95000, allowances: 30000, deductions: 15000, netPay: 110000, status: "pending" },
  { id: 6, name: "Ananya Gupta", department: "Marketing", designation: "Marketing Specialist", basic: 55000, allowances: 15000, deductions: 8000, netPay: 62000, status: "processed" },
];

const payrollStats = {
  totalPayroll: 514000,
  employees: 48,
  processed: 42,
  pending: 6,
};

const formatCurrency = (value: number) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
};

export default function Payroll() {
  const [selectedMonth, setSelectedMonth] = useState("january-2024");

  return (
    <MainLayout title="Payroll" subtitle="Manage salaries and compensation">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payroll</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(payrollStats.totalPayroll)}</div>
            <p className="text-xs text-muted-foreground">For January 2024</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payrollStats.employees}</div>
            <p className="text-xs text-green-600">+2 from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Processed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{payrollStats.processed}</div>
            <p className="text-xs text-muted-foreground">{Math.round((payrollStats.processed / payrollStats.employees) * 100)}% complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{payrollStats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-dashed border-2 hover:border-primary cursor-pointer transition-colors">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">Run Payroll</h3>
            <p className="text-sm text-muted-foreground">Process this month's salaries</p>
          </CardContent>
        </Card>
        <Card className="border-dashed border-2 hover:border-primary cursor-pointer transition-colors">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <Download className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-semibold mb-1">Download Payslips</h3>
            <p className="text-sm text-muted-foreground">Generate bulk payslips PDF</p>
          </CardContent>
        </Card>
        <Card className="border-dashed border-2 hover:border-primary cursor-pointer transition-colors">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold mb-1">Salary Revision</h3>
            <p className="text-sm text-muted-foreground">Update salary structures</p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Payroll Register</CardTitle>
            <CardDescription>Employee salary breakdown for the selected period</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-44">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="january-2024">January 2024</SelectItem>
                <SelectItem value="december-2023">December 2023</SelectItem>
                <SelectItem value="november-2023">November 2023</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employee..." className="pl-9 w-48" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
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
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollData.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{employee.name}</p>
                      <p className="text-sm text-muted-foreground">{employee.designation}</p>
                    </div>
                  </TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell className="text-right">{formatCurrency(employee.basic)}</TableCell>
                  <TableCell className="text-right text-green-600">+{formatCurrency(employee.allowances)}</TableCell>
                  <TableCell className="text-right text-red-600">-{formatCurrency(employee.deductions)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(employee.netPay)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={employee.status === "processed" ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                      {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      <FileText className="h-4 w-4 mr-1" />
                      Payslip
                    </Button>
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
