import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  User, MapPin, Phone, Building2, Heart, Briefcase, CreditCard, Save, Shield, ChevronsUpDown, Check, FileText, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Employee } from "@/hooks/useEmployees";
import {
  useEmployeeDetails,
  useUpsertEmployeeDetails,
  type EmployeeDetailsInput,
} from "@/hooks/useEmployeeDetails";
import { CompensationTab } from "./CompensationTab";
import { DocumentsTab } from "./DocumentsTab";

const statusStyles: Record<string, string> = {
  active: "bg-success/10 text-success border-success/30",
  on_leave: "bg-warning/10 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const DEPARTMENTS = ["Engineering", "Product", "Human Resources", "Finance", "Marketing", "Sales", "Operations"];

function ManagerComboboxInline({ value, onChange, employees, excludeId }: { value: string; onChange: (v: string) => void; employees: Employee[]; excludeId?: string }) {
  const [open, setOpen] = useState(false);
  const options = employees.filter((e) => e.id !== excludeId);
  const selected = options.find((e) => e.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9 text-xs">
          <span className="truncate">{selected ? (selected.full_name || selected.email || "Unnamed") : "Select manager"}</span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 z-50" align="start">
        <Command>
          <CommandInput placeholder="Search by name..." />
          <CommandList>
            <CommandEmpty>No manager found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="none" onSelect={() => { onChange(""); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                No Manager
              </CommandItem>
              {options.map((emp) => (
                <CommandItem key={emp.id} value={emp.full_name || emp.email || emp.id} onSelect={() => { onChange(emp.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === emp.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{emp.full_name || "Unnamed"}</span>
                    {emp.job_title && <span className="text-xs text-muted-foreground">{emp.job_title}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managerName?: string;
  allEmployees?: Employee[];
  onUpdateEmployee?: (data: { id: string; full_name?: string; email?: string; job_title?: string; department?: string; status?: string; join_date?: string; phone?: string; manager_id?: string | null }) => void;
  canEditCompensation?: boolean;
  /** Open directly in edit mode */
  initialEditMode?: boolean;
}

export function EmployeeDetailDialog({ employee, open, onOpenChange, managerName, allEmployees = [], onUpdateEmployee, canEditCompensation = false, initialEditMode = false }: Props) {
  const { data: details, isLoading } = useEmployeeDetails(employee?.id ?? null);
  const upsert = useUpsertEmployeeDetails();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<EmployeeDetailsInput>>({});
  // Profile-level fields
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    email: "",
    job_title: "",
    department: "",
    status: "active",
    join_date: "",
    phone: "",
    manager_id: "",
  });

  useEffect(() => {
    if (details) {
      setForm({ ...details });
    } else if (employee) {
      setForm({ profile_id: employee.id });
    }
    if (employee) {
      setProfileForm({
        full_name: employee.full_name || "",
        email: employee.email || "",
        job_title: employee.job_title || "",
        department: employee.department || "",
        status: employee.status || "active",
        join_date: employee.join_date || "",
        phone: employee.phone || "",
        manager_id: employee.manager_id || "",
      });
    }
    // Apply initialEditMode when opening
    setIsEditing(initialEditMode);
  }, [details, employee, initialEditMode]);

  if (!employee) return null;

  const initials = employee.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const setField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val || null }));

  const handleSave = () => {
    if (!employee) return;
    upsert.mutate(
      { ...form, profile_id: employee.id } as EmployeeDetailsInput,
      {
        onSuccess: () => {
          // Save profile-level fields
          if (onUpdateEmployee) {
            onUpdateEmployee({
              id: employee.id,
              full_name: profileForm.full_name || undefined,
              email: profileForm.email || undefined,
              job_title: profileForm.job_title || undefined,
              department: profileForm.department || undefined,
              status: profileForm.status || undefined,
              join_date: profileForm.join_date || undefined,
              phone: profileForm.phone || undefined,
              manager_id: profileForm.manager_id || null,
            });
          }
          setIsEditing(false);
        },
      }
    );
  };

  const Field = ({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: any }) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );

  const EditField = ({ label, fieldKey, placeholder, type = "text" }: { label: string; fieldKey: string; placeholder?: string; type?: string }) => (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={(form as any)[fieldKey] || ""}
        onChange={(e) => setField(fieldKey, e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );

  const ProfileEditField = ({ label, fieldKey, placeholder, type = "text" }: { label: string; fieldKey: string; placeholder?: string; type?: string }) => (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={(profileForm as any)[fieldKey] || ""}
        onChange={(e) => setProfileForm((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-hrms/10 text-hrms text-lg font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl">{isEditing ? profileForm.full_name || "Unnamed" : employee.full_name || "Unnamed"}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 mt-1">
                <span>{isEditing ? profileForm.job_title || "No title" : employee.job_title || "No title"}</span>
                {(isEditing ? profileForm.department : employee.department) && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span>{isEditing ? profileForm.department : employee.department}</span>
                  </>
                )}
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className={cn("text-xs capitalize", statusStyles[isEditing ? profileForm.status : employee.status])}>
                  {(isEditing ? profileForm.status : employee.status)?.replace("_", " ") || "active"}
                </Badge>
                {(isEditing ? profileForm.join_date : employee.join_date) && (
                  <span className="text-xs text-muted-foreground">
                    Joined {new Date((isEditing ? profileForm.join_date : employee.join_date)!).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : isEditing ? (
          /* ── Edit Mode ── */
          <Tabs defaultValue="profile" className="mt-4">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="profile" className="text-xs">Profile</TabsTrigger>
              <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
              <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
              <TabsTrigger value="emergency" className="text-xs">Emergency</TabsTrigger>
              <TabsTrigger value="bank" className="text-xs">Bank & IDs</TabsTrigger>
              <TabsTrigger value="compensation" className="text-xs">Compensation</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
            </TabsList>

            {/* Profile tab — core fields (name, email, department, etc.) */}
            <TabsContent value="profile" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <ProfileEditField label="Full Name *" fieldKey="full_name" placeholder="John Doe" />
                <ProfileEditField label="Email *" fieldKey="email" placeholder="john@company.com" type="email" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ProfileEditField label="Job Title" fieldKey="job_title" placeholder="Software Engineer" />
                <div className="grid gap-1">
                  <Label className="text-xs">Department</Label>
                  <Select value={profileForm.department} onValueChange={(v) => setProfileForm((prev) => ({ ...prev, department: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={profileForm.status} onValueChange={(v) => setProfileForm((prev) => ({ ...prev, status: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ProfileEditField label="Join Date" fieldKey="join_date" type="date" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ProfileEditField label="Phone" fieldKey="phone" placeholder="+91 98765 43210" />
                <div className="grid gap-1">
                  <Label className="text-xs">Manager</Label>
                  <ManagerComboboxInline
                    value={profileForm.manager_id}
                    onChange={(v) => setProfileForm((prev) => ({ ...prev, manager_id: v }))}
                    employees={allEmployees}
                    excludeId={employee?.id}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="personal" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <EditField label="Date of Birth" fieldKey="date_of_birth" type="date" />
                <div className="grid gap-1">
                  <Label className="text-xs">Gender</Label>
                  <Select value={form.gender || ""} onValueChange={(v) => setField("gender", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Blood Group</Label>
                  <Select value={form.blood_group || ""} onValueChange={(v) => setField("blood_group", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Marital Status</Label>
                  <Select value={form.marital_status || ""} onValueChange={(v) => setField("marital_status", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {MARITAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <EditField label="Nationality" fieldKey="nationality" placeholder="Indian" />
              </div>
            </TabsContent>

            <TabsContent value="address" className="space-y-3 pt-3">
              <EditField label="Address Line 1" fieldKey="address_line1" placeholder="House/Flat No, Street" />
              <EditField label="Address Line 2" fieldKey="address_line2" placeholder="Landmark, Area" />
              <div className="grid grid-cols-2 gap-3">
                <EditField label="City" fieldKey="city" placeholder="Mumbai" />
                <EditField label="State" fieldKey="state" placeholder="Maharashtra" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditField label="Pincode" fieldKey="pincode" placeholder="400001" />
                <EditField label="Country" fieldKey="country" placeholder="India" />
              </div>
            </TabsContent>

            <TabsContent value="emergency" className="space-y-3 pt-3">
              <EditField label="Contact Name" fieldKey="emergency_contact_name" placeholder="Full name" />
              <div className="grid grid-cols-2 gap-3">
                <EditField label="Relationship" fieldKey="emergency_contact_relation" placeholder="e.g. Spouse, Parent" />
                <EditField label="Phone Number" fieldKey="emergency_contact_phone" placeholder="+91 98765 43210" />
              </div>
            </TabsContent>

            <TabsContent value="bank" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <EditField label="Bank Name" fieldKey="bank_name" placeholder="State Bank of India" />
                <EditField label="Account Number" fieldKey="bank_account_number" placeholder="Account No." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditField label="IFSC Code" fieldKey="bank_ifsc" placeholder="SBIN0001234" />
                <EditField label="Branch" fieldKey="bank_branch" placeholder="Branch name" />
              </div>
              <div className="border-t pt-3 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Statutory IDs
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <EditField label="Employee ID" fieldKey="employee_id_number" placeholder="EMP-001" />
                  <EditField label="PAN Number" fieldKey="pan_number" placeholder="ABCDE1234F" />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <EditField label="Aadhaar (Last 4)" fieldKey="aadhaar_last_four" placeholder="1234" />
                  <EditField label="UAN" fieldKey="uan_number" placeholder="UAN Number" />
                  <EditField label="ESI Number" fieldKey="esi_number" placeholder="ESI Number" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compensation" className="pt-3">
              <CompensationTab profileId={employee.id} employeeName={employee.full_name || undefined} canEdit={canEditCompensation} />
            </TabsContent>

            <TabsContent value="documents" className="pt-3">
              <DocumentsTab profileId={employee.id} canEdit={canEditCompensation} />
            </TabsContent>
          </Tabs>
        ) : (
          /* ── View Mode ── */
          <Tabs defaultValue="personal" className="mt-4">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
              <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
              <TabsTrigger value="emergency" className="text-xs">Emergency</TabsTrigger>
              <TabsTrigger value="bank" className="text-xs">Bank & IDs</TabsTrigger>
              <TabsTrigger value="compensation" className="text-xs">Compensation</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="pt-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email" value={employee.email} icon={User} />
                <Field label="Phone" value={employee.phone} icon={Phone} />
                <Field label="Date of Birth" value={details?.date_of_birth ? new Date(details.date_of_birth).toLocaleDateString("en-IN") : null} />
                <Field label="Gender" value={details?.gender} />
                <Field label="Blood Group" value={details?.blood_group} icon={Heart} />
                <Field label="Marital Status" value={details?.marital_status} />
                <Field label="Nationality" value={details?.nationality} />
                <Field label="Manager" value={managerName || "—"} icon={Briefcase} />
              </div>
            </TabsContent>

            <TabsContent value="address" className="pt-3">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Address Line 1" value={details?.address_line1} icon={MapPin} />
                <Field label="Address Line 2" value={details?.address_line2} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="City" value={details?.city} />
                  <Field label="State" value={details?.state} />
                  <Field label="Pincode" value={details?.pincode} />
                  <Field label="Country" value={details?.country} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="emergency" className="pt-3">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Contact Name" value={details?.emergency_contact_name} icon={Phone} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Relationship" value={details?.emergency_contact_relation} />
                  <Field label="Phone Number" value={details?.emergency_contact_phone} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="bank" className="pt-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bank Name" value={details?.bank_name} icon={Building2} />
                <Field label="Account Number" value={details?.bank_account_number} icon={CreditCard} />
                <Field label="IFSC Code" value={details?.bank_ifsc} />
                <Field label="Branch" value={details?.bank_branch} />
              </div>
              <div className="border-t pt-3 mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Statutory IDs
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Employee ID" value={details?.employee_id_number} />
                  <Field label="PAN Number" value={details?.pan_number} />
                  <Field label="Aadhaar (Last 4)" value={details?.aadhaar_last_four} />
                  <Field label="UAN" value={details?.uan_number} />
                  <Field label="ESI Number" value={details?.esi_number} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compensation" className="pt-3">
              <CompensationTab profileId={employee.id} employeeName={employee.full_name || undefined} canEdit={canEditCompensation} />
            </TabsContent>

            <TabsContent value="documents" className="pt-3">
              <DocumentsTab profileId={employee.id} canEdit={canEditCompensation} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="mt-4">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={upsert.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {upsert.isPending ? "Saving..." : "Save All Changes"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit Details
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
