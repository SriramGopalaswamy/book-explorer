import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  UserCheck,
  UserX,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const employees = [
  {
    id: 1,
    name: "Rahul Sharma",
    email: "rahul.sharma@grx10.com",
    role: "Software Engineer",
    department: "Engineering",
    status: "active",
    joinDate: "2023-06-15",
  },
  {
    id: 2,
    name: "Priya Patel",
    email: "priya.patel@grx10.com",
    role: "Product Manager",
    department: "Product",
    status: "active",
    joinDate: "2022-11-20",
  },
  {
    id: 3,
    name: "Amit Kumar",
    email: "amit.kumar@grx10.com",
    role: "HR Manager",
    department: "Human Resources",
    status: "on_leave",
    joinDate: "2021-03-10",
  },
  {
    id: 4,
    name: "Sneha Reddy",
    email: "sneha.reddy@grx10.com",
    role: "Financial Analyst",
    department: "Finance",
    status: "active",
    joinDate: "2023-01-08",
  },
  {
    id: 5,
    name: "Vikram Singh",
    email: "vikram.singh@grx10.com",
    role: "Senior Developer",
    department: "Engineering",
    status: "active",
    joinDate: "2020-09-25",
  },
  {
    id: 6,
    name: "Anjali Gupta",
    email: "anjali.gupta@grx10.com",
    role: "Marketing Lead",
    department: "Marketing",
    status: "inactive",
    joinDate: "2022-07-12",
  },
];

const statusStyles = {
  active: "bg-success/10 text-success border-success/30",
  on_leave: "bg-warning/10 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

export default function Employees() {
  return (
    <MainLayout
      title="Employees"
      subtitle="Manage your workforce and employee information"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Employees"
            value="127"
            change={{ value: "3", type: "increase" }}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            title="Active"
            value="118"
            icon={<UserCheck className="h-4 w-4" />}
          />
          <StatCard
            title="On Leave"
            value="8"
            icon={<Clock className="h-4 w-4" />}
          />
          <StatCard
            title="Inactive"
            value="1"
            icon={<UserX className="h-4 w-4" />}
          />
        </div>

        {/* Employee List */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Employee Directory
              </h3>
              <p className="text-sm text-muted-foreground">
                {employees.length} employees in the system
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="w-64 pl-9"
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
              <Button className="bg-gradient-hrms text-white hover:opacity-90">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="group cursor-pointer rounded-lg border bg-background p-4 transition-all hover:border-hrms hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-hrms/10 text-hrms font-medium">
                      {employee.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="truncate font-medium text-foreground">
                        {employee.name}
                      </h4>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          statusStyles[employee.status as keyof typeof statusStyles]
                        )}
                      >
                        {employee.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {employee.role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {employee.department}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">
                    Joined {new Date(employee.joinDate).toLocaleDateString()}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    View Profile
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
