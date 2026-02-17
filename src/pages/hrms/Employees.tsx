import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  UserCheck,
  UserX,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEmployees,
  useEmployeeStats,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useIsAdminOrHR,
  Employee,
} from "@/hooks/useEmployees";

const statusStyles = {
  active: "bg-success/10 text-success border-success/30",
  on_leave: "bg-warning/10 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

const departments = ["Engineering", "Product", "Human Resources", "Finance", "Marketing", "Sales", "Operations"];

export default function Employees() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdminOrHR();
  const stats = useEmployeeStats();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    job_title: "",
    department: "",
    status: "active" as Employee["status"],
    join_date: new Date().toISOString().split("T")[0],
    phone: "",
    manager_id: "" as string,
  });

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const resetForm = () => {
    setFormData({
      full_name: "",
      email: "",
      job_title: "",
      department: "",
      status: "active",
      join_date: new Date().toISOString().split("T")[0],
      phone: "",
      manager_id: "",
    });
  };

  const handleAddEmployee = () => {
    if (!formData.full_name || !formData.email) return;
    const { manager_id, ...rest } = formData;
    createEmployee.mutate({ ...rest, manager_id: manager_id || null }, {
      onSuccess: () => {
        resetForm();
        setIsAddDialogOpen(false);
      },
    });
  };

  const handleEditEmployee = () => {
    if (!selectedEmployee || !formData.full_name || !formData.email) return;
    const { manager_id, ...rest } = formData;
    updateEmployee.mutate(
      { id: selectedEmployee.id, ...rest, manager_id: manager_id || null },
      {
        onSuccess: () => {
          resetForm();
          setIsEditDialogOpen(false);
          setSelectedEmployee(null);
        },
      }
    );
  };

  const handleDeleteEmployee = () => {
    if (!selectedEmployee) return;
    deleteEmployee.mutate(selectedEmployee.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setSelectedEmployee(null);
      },
    });
  };

  const openEditDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setFormData({
      full_name: employee.full_name || "",
      email: employee.email || "",
      job_title: employee.job_title || "",
      department: employee.department || "",
      status: employee.status || "active",
      join_date: employee.join_date || new Date().toISOString().split("T")[0],
      phone: employee.phone || "",
      manager_id: employee.manager_id || "",
    });
    setIsEditDialogOpen(true);
  };

  // Show access denied if not admin/HR
  if (!roleLoading && !isAdmin) {
    return (
      <MainLayout title="Employees" subtitle="Manage your workforce and employee information">
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground text-center max-w-md">
            You need Admin or HR role to access the employee management system.
            Contact your administrator for access.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Employees" subtitle="Manage your workforce and employee information">
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Employees"
            value={stats.total.toString()}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            title="Active"
            value={stats.active.toString()}
            icon={<UserCheck className="h-4 w-4" />}
          />
          <StatCard
            title="On Leave"
            value={stats.onLeave.toString()}
            icon={<Clock className="h-4 w-4" />}
          />
          <StatCard
            title="Inactive"
            value={stats.inactive.toString()}
            icon={<UserX className="h-4 w-4" />}
          />
        </div>

        {/* Employee List */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Employee Directory</h3>
              <p className="text-sm text-muted-foreground">
                {filteredEmployees.length} employees found
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="w-64 pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-hrms text-white hover:opacity-90">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Employee</DialogTitle>
                    <DialogDescription>Enter the employee details below</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Full Name *</Label>
                      <Input
                        placeholder="John Doe"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        placeholder="john@company.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Job Title</Label>
                        <Input
                          placeholder="Software Engineer"
                          value={formData.job_title}
                          onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Department</Label>
                        <Select
                          value={formData.department}
                          onValueChange={(v) => setFormData({ ...formData, department: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(v) => setFormData({ ...formData, status: v as Employee["status"] })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="on_leave">On Leave</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Join Date</Label>
                        <Input
                          type="date"
                          value={formData.join_date}
                          onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Phone</Label>
                      <Input
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Manager</Label>
                      <Select
                        value={formData.manager_id}
                        onValueChange={(v) => setFormData({ ...formData, manager_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Manager</SelectItem>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.full_name || emp.email || "Unnamed"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddEmployee} disabled={createEmployee.isPending}>
                      {createEmployee.isPending ? "Adding..." : "Add Employee"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="p-6">
            {isLoading || roleLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-40 rounded-lg" />
                ))}
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-3 text-muted-foreground">
                  {searchQuery || statusFilter !== "all"
                    ? "No employees match your search"
                    : "No employees added yet"}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="group rounded-lg border bg-background p-4 transition-all hover:border-hrms hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-hrms/10 text-hrms font-medium">
                          {employee.full_name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("") || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="truncate font-medium text-foreground">
                            {employee.full_name || "Unnamed"}
                          </h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedEmployee(employee);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {employee.job_title || "No title"}
                        </p>
                        <p className="text-xs text-muted-foreground">{employee.department || "No department"}</p>
                        {employee.manager_id && (
                          <p className="text-xs text-muted-foreground">
                            → {employees.find((e) => e.id === employee.manager_id)?.full_name || "Unknown manager"}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <Badge
                        variant="outline"
                        className={cn("text-xs capitalize", statusStyles[employee.status])}
                      >
                        {employee.status?.replace("_", " ") || "active"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {employee.join_date
                          ? `Joined ${new Date(employee.join_date).toLocaleDateString()}`
                          : "No join date"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>Update the employee details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Full Name *</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Job Title</Label>
                <Input
                  value={formData.job_title}
                  onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Department</Label>
                <Select
                  value={formData.department}
                  onValueChange={(v) => setFormData({ ...formData, department: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as Employee["status"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Join Date</Label>
                <Input
                  type="date"
                  value={formData.join_date}
                  onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Manager</Label>
              <Select
                value={formData.manager_id}
                onValueChange={(v) => setFormData({ ...formData, manager_id: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Manager</SelectItem>
                  {employees.filter((emp) => emp.id !== selectedEmployee?.id).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name || emp.email || "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditEmployee} disabled={updateEmployee.isPending}>
              {updateEmployee.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedEmployee?.full_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEmployee}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
