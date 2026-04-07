import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  User, Mail, Lock, Save, AlertCircle, Building2, Briefcase, Phone,
  MapPin, Heart, Landmark, FileText, Send, Clock, CheckCircle, XCircle, Download,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEmployeeDetails } from "@/hooks/useEmployeeDetails";
import { useEmployeeDocuments } from "@/hooks/useEmployeeDocuments";
import { useMyChangeRequests, useSubmitChangeRequest } from "@/hooks/useProfileChangeRequests";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const DEPARTMENTS = [
  "Engineering", "HR", "Finance", "Sales", "Marketing",
  "Operations", "Leadership", "Legal", "Product", "Design",
];

const FIELD_LABELS: Record<string, string> = {
  full_name: "Full Name",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  blood_group: "Blood Group",
  marital_status: "Marital Status",
  nationality: "Nationality",
  address_line1: "Address Line 1",
  address_line2: "Address Line 2",
  city: "City",
  state: "State",
  pincode: "Pincode",
  country: "Country",
  emergency_contact_name: "Emergency Contact Name",
  emergency_contact_relation: "Emergency Contact Relation",
  emergency_contact_phone: "Emergency Contact Phone",
  bank_name: "Bank Name",
  bank_account_number: "Bank Account Number",
  bank_ifsc: "IFSC Code",
  bank_branch: "Bank Branch",
  pan_number: "PAN Number",
  aadhaar_last_four: "Aadhaar (last 4)",
  uan_number: "UAN Number",
  esi_number: "ESI Number",
  employee_id_number: "Employee ID",
  phone: "Phone",
};

// Fields employees can edit directly (non-critical personal info)
const SELF_EDITABLE_FIELDS = new Set([
  "phone",
  "marital_status",
  "blood_group",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "pincode",
  "country",
  "emergency_contact_name",
  "emergency_contact_relation",
  "emergency_contact_phone",
]);

const MARITAL_STATUS_OPTIONS = ["Single", "Married", "Divorced", "Widowed"];
const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-warning" />,
  approved: <CheckCircle className="h-3.5 w-3.5 text-primary" />,
  rejected: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const statusStyles: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-primary/10 text-primary border-primary/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function Profile() {
  const { user, updatePassword } = useAuth();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");

  // Password change form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Change request dialog
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeSection, setChangeSection] = useState("");
  const [changeField, setChangeField] = useState("");
  const [changeCurrentVal, setChangeCurrentVal] = useState("");
  const [changeNewVal, setChangeNewVal] = useState("");
  const [changeReason, setChangeReason] = useState("");

  // Self-edit tracking
  const [editingFields, setEditingFields] = useState<Record<string, string>>({});
  const [isSavingSelfEdit, setIsSavingSelfEdit] = useState(false);

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-id", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, department, job_title, phone, email")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const profileId = myProfile?.id || null;

  const { data: details, isLoading: detailsLoading } = useEmployeeDetails(profileId);
  const { data: documents = [], isLoading: docsLoading } = useEmployeeDocuments(profileId);
  const { data: changeRequests = [] } = useMyChangeRequests();
  const submitChange = useSubmitChangeRequest();

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, department, job_title, phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setFullName(data.full_name || user?.user_metadata?.full_name || "");
        setDepartment(data.department || "");
        setJobTitle(data.job_title || "");
        setPhone(data.phone || "");
      } else {
        setFullName(user?.user_metadata?.full_name || "");
      }
      setProfileLoaded(true);
    };
    loadProfile();
  }, [user]);

  const getInitials = () => {
    const name = fullName || user?.user_metadata?.full_name || user?.email || "U";
    const parts = name.split(" ");
    return parts.map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            full_name: fullName,
            department: department || null,
            job_title: jobTitle || null,
            phone: phone || null,
          },
          { onConflict: "user_id" }
        );
      if (error) throw error;
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error("Failed to update profile: " + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordUpdate = async () => {
    setPasswordError("");
    if (!newPassword || !confirmPassword) {
      setPasswordError("Please fill in all password fields");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setIsUpdating(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        setPasswordError(error.message);
      } else {
        toast.success("Password updated successfully");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordError("Failed to update password");
    } finally {
      setIsUpdating(false);
    }
  };

  const openChangeRequest = (section: string, fieldName: string, currentValue: string | null) => {
    setChangeSection(section);
    setChangeField(fieldName);
    setChangeCurrentVal(currentValue || "—");
    setChangeNewVal("");
    setChangeReason("");
    setChangeDialogOpen(true);
  };

  const handleSubmitChange = () => {
    if (!profileId || !changeNewVal.trim()) return;
    submitChange.mutate(
      {
        profile_id: profileId,
        section: changeSection,
        field_name: changeField,
        current_value: changeCurrentVal === "—" ? null : changeCurrentVal,
        requested_value: changeNewVal.trim(),
        reason: changeReason.trim() || undefined,
      },
      { onSuccess: () => setChangeDialogOpen(false) }
    );
  };

  // Self-edit: start editing a field
  const startEditing = (fieldKey: string, currentValue: string | null) => {
    setEditingFields((prev) => ({ ...prev, [fieldKey]: currentValue || "" }));
  };

  const cancelEditing = (fieldKey: string) => {
    setEditingFields((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  const updateEditingField = (fieldKey: string, value: string) => {
    setEditingFields((prev) => ({ ...prev, [fieldKey]: value }));
  };

  // Save a single self-editable field
  const saveSelfEdit = async (fieldKey: string, currentValue: string | null) => {
    const newValue = editingFields[fieldKey]?.trim() || null;
    if (newValue === (currentValue || null)) {
      cancelEditing(fieldKey);
      return;
    }

    setIsSavingSelfEdit(true);
    try {
      // Phone is on profiles table, everything else on employee_details
      if (fieldKey === "phone") {
        const { error } = await supabase
          .from("profiles")
          .update({ phone: newValue })
          .eq("id", profileId!);
        if (error) throw error;
        setPhone(newValue || "");
        queryClient.invalidateQueries({ queryKey: ["my-profile-id"] });
      } else {
        // employee_details field
        if (!details?.id) {
          // Need to insert
          const { error } = await supabase
            .from("employee_details")
            .upsert(
              { profile_id: profileId!, [fieldKey]: newValue } as any,
              { onConflict: "profile_id" }
            );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("employee_details")
            .update({ [fieldKey]: newValue } as any)
            .eq("id", details.id);
          if (error) throw error;
        }
        queryClient.invalidateQueries({ queryKey: ["employee-details", profileId] });
      }
      toast.success(`${FIELD_LABELS[fieldKey] || fieldKey} updated`);
      cancelEditing(fieldKey);
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setIsSavingSelfEdit(false);
    }
  };

  const handleDocDownload = async (filePath: string, docName: string) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(filePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Failed to download document");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  // Read-only row with "Request Change" button (for critical fields)
  const DetailRow = ({ label, value, section, fieldKey }: {
    label: string; value: string | null; section: string; fieldKey: string;
  }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-primary hover:text-primary/80 h-7"
        onClick={() => openChangeRequest(section, fieldKey, value)}
      >
        <Send className="h-3 w-3 mr-1" />
        Request Change
      </Button>
    </div>
  );

  // Editable row for non-critical fields
  const EditableDetailRow = ({ label, value, fieldKey, type = "text", options }: {
    label: string; value: string | null; fieldKey: string; type?: "text" | "select"; options?: string[];
  }) => {
    const isEditing = fieldKey in editingFields;

    if (isEditing) {
      return (
        <div className="flex items-center gap-2 py-2.5 border-b border-border/50 last:border-0">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            {type === "select" && options ? (
              <Select
                value={editingFields[fieldKey] || ""}
                onValueChange={(v) => updateEditingField(fieldKey, v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-8 text-sm"
                value={editingFields[fieldKey]}
                onChange={(e) => updateEditingField(fieldKey, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
                autoFocus
              />
            )}
          </div>
          <div className="flex items-center gap-1 mt-4">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={isSavingSelfEdit}
              onClick={() => saveSelfEdit(fieldKey, value)}
            >
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-muted-foreground"
              onClick={() => cancelEditing(fieldKey)}
            >
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 group">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium">{value || "—"}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-primary h-7"
          onClick={() => startEditing(fieldKey, value)}
        >
          <Pencil className="h-3 w-3 mr-1" />
          Edit
        </Button>
      </div>
    );
  };

  const pendingCount = changeRequests.filter(r => r.status === "pending").length;

  return (
    <MainLayout title="Profile" subtitle="View your details and manage account settings">
      <div className="w-full py-8">
        <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-6">
          {/* Profile Header */}
          <Card className="glass-morphism">
            <CardContent className="pt-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 ring-4 ring-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-2xl font-bold">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">{fullName || user?.email?.split("@")[0] || "User"}</h2>
                  <p className="text-muted-foreground">{user?.email}</p>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {jobTitle && (
                      <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <Briefcase className="h-3 w-3" />
                        {jobTitle}
                      </div>
                    )}
                    {department && (
                      <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                        <Building2 className="h-3 w-3" />
                        {department}
                      </div>
                    )}
                    {details?.employee_id_number && (
                      <div className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        ID: {details.employee_id_number}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="personal" className="space-y-6">
            <TabsList className="grid w-full grid-cols-6 glass-morphism">
              <TabsTrigger value="personal" className="rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5">
                <User className="h-4 w-4 hidden sm:block flex-shrink-0" />
                <span>Personal</span>
              </TabsTrigger>
              <TabsTrigger value="address" className="rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5">
                <MapPin className="h-4 w-4 hidden sm:block flex-shrink-0" />
                <span>Address</span>
              </TabsTrigger>
              <TabsTrigger value="bank" className="rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5">
                <Landmark className="h-4 w-4 hidden sm:block flex-shrink-0" />
                <span>Bank & IDs</span>
              </TabsTrigger>
              <TabsTrigger value="documents" className="rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5">
                <FileText className="h-4 w-4 hidden sm:block flex-shrink-0" />
                <span>Documents</span>
              </TabsTrigger>
              <TabsTrigger value="account" className="rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5">
                <Mail className="h-4 w-4 hidden sm:block flex-shrink-0" />
                <span>Account</span>
              </TabsTrigger>
              <TabsTrigger value="requests" className="rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5 relative">
                <Clock className="h-4 w-4 hidden sm:block flex-shrink-0" />
                <span>Requests</span>
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Personal Details Tab */}
            <TabsContent value="personal">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Personal Details
                  </CardTitle>
                  <CardDescription>
                    Fields marked with <Pencil className="inline h-3 w-3 text-muted-foreground" /> can be edited directly. Other fields require an HR change request.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {detailsLoading ? (
                    <p className="text-muted-foreground text-center py-8">Loading...</p>
                  ) : (
                    <div className="space-y-0">
                      <DetailRow label="Full Name" value={fullName} section="personal" fieldKey="full_name" />
                      <DetailRow label="Date of Birth" value={details?.date_of_birth} section="personal" fieldKey="date_of_birth" />
                      <DetailRow label="Gender" value={details?.gender} section="personal" fieldKey="gender" />
                      <EditableDetailRow label="Blood Group" value={details?.blood_group || null} fieldKey="blood_group" type="select" options={BLOOD_GROUP_OPTIONS} />
                      <EditableDetailRow label="Marital Status" value={details?.marital_status || null} fieldKey="marital_status" type="select" options={MARITAL_STATUS_OPTIONS} />
                      <DetailRow label="Nationality" value={details?.nationality} section="personal" fieldKey="nationality" />
                      <DetailRow label="Department" value={department} section="personal" fieldKey="department" />
                      <DetailRow label="Job Title" value={jobTitle} section="personal" fieldKey="job_title" />
                      <EditableDetailRow label="Phone" value={phone} fieldKey="phone" />
                      <DetailRow label="Email" value={user?.email || null} section="personal" fieldKey="email" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Address Tab */}
            <TabsContent value="address">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Address & Emergency Contacts
                  </CardTitle>
                  <CardDescription>You can directly update your address and emergency contact details.</CardDescription>
                </CardHeader>
                <CardContent>
                  {detailsLoading ? (
                    <p className="text-muted-foreground text-center py-8">Loading...</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Address</p>
                      <EditableDetailRow label="Address Line 1" value={details?.address_line1 || null} fieldKey="address_line1" />
                      <EditableDetailRow label="Address Line 2" value={details?.address_line2 || null} fieldKey="address_line2" />
                      <EditableDetailRow label="City" value={details?.city || null} fieldKey="city" />
                      <EditableDetailRow label="State" value={details?.state || null} fieldKey="state" />
                      <EditableDetailRow label="Pincode" value={details?.pincode || null} fieldKey="pincode" />
                      <EditableDetailRow label="Country" value={details?.country || null} fieldKey="country" />

                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-2">Emergency Contact</p>
                      <EditableDetailRow label="Contact Name" value={details?.emergency_contact_name || null} fieldKey="emergency_contact_name" />
                      <EditableDetailRow label="Relation" value={details?.emergency_contact_relation || null} fieldKey="emergency_contact_relation" />
                      <EditableDetailRow label="Phone" value={details?.emergency_contact_phone || null} fieldKey="emergency_contact_phone" />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bank & Statutory IDs Tab */}
            <TabsContent value="bank">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-primary" />
                    Bank & Statutory IDs
                  </CardTitle>
                  <CardDescription>These are sensitive fields. Changes require HR approval.</CardDescription>
                </CardHeader>
                <CardContent>
                  {detailsLoading ? (
                    <p className="text-muted-foreground text-center py-8">Loading...</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bank Details</p>
                      <DetailRow label="Bank Name" value={details?.bank_name} section="bank" fieldKey="bank_name" />
                      <DetailRow label="Account Number" value={details?.bank_account_number ? "••••" + details.bank_account_number.slice(-4) : null} section="bank" fieldKey="bank_account_number" />
                      <DetailRow label="IFSC Code" value={details?.bank_ifsc} section="bank" fieldKey="bank_ifsc" />
                      <DetailRow label="Branch" value={details?.bank_branch} section="bank" fieldKey="bank_branch" />

                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-2">Statutory IDs</p>
                      <DetailRow label="Employee ID" value={details?.employee_id_number} section="bank" fieldKey="employee_id_number" />
                      <DetailRow label="PAN Number" value={details?.pan_number ? details.pan_number.slice(0, 2) + "••••" + details.pan_number.slice(-2) : null} section="bank" fieldKey="pan_number" />
                      <DetailRow label="Aadhaar (last 4)" value={details?.aadhaar_last_four ? "••••" + details.aadhaar_last_four : null} section="bank" fieldKey="aadhaar_last_four" />
                      <DetailRow label="UAN Number" value={details?.uan_number} section="bank" fieldKey="uan_number" />
                      <DetailRow label="ESI Number" value={details?.esi_number} section="bank" fieldKey="esi_number" />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    My Documents
                  </CardTitle>
                  <CardDescription>Official documents uploaded by HR. Contact HR to add or update documents.</CardDescription>
                </CardHeader>
                <CardContent>
                  {docsLoading ? (
                    <p className="text-muted-foreground text-center py-8">Loading...</p>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
                      <p className="mt-3 text-muted-foreground">No documents uploaded yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Contact HR to upload your documents</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                              <FileText className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{doc.document_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-[10px] h-5">{doc.document_type}</Badge>
                                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                                {doc.file_size && <span>{(doc.file_size / 1024).toFixed(0)} KB</span>}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDocDownload(doc.file_path, doc.document_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account">
              <div className="space-y-6">
                <Card className="glass-morphism">
                  <CardHeader>
                    <CardTitle>Account Information</CardTitle>
                    <CardDescription>Update your name and basic contact info</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        Email Address
                      </Label>
                      <Input id="email" value={user?.email || ""} disabled className="bg-secondary/50" />
                      <p className="text-xs text-muted-foreground">Email cannot be changed for security reasons</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fullname" className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        Full Name
                      </Label>
                      <Input id="fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" disabled={!profileLoaded} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobtitle" className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        Job Title
                      </Label>
                      <Input id="jobtitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Engineer" disabled={!profileLoaded} />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        Department
                      </Label>
                      <Select value={department} onValueChange={setDepartment} disabled={!profileLoaded}>
                        <SelectTrigger><SelectValue placeholder="Select your department" /></SelectTrigger>
                        <SelectContent>
                          {DEPARTMENTS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        Phone Number
                      </Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +1 555 000 0000" disabled={!profileLoaded} />
                    </div>
                    <Button onClick={handleSaveProfile} disabled={isSavingProfile || !profileLoaded} className="w-full rounded-xl">
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingProfile ? "Saving..." : "Save Profile"}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="glass-morphism">
                  <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Update your password to keep your account secure</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {passwordError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{passwordError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm Password</Label>
                      <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                    </div>
                    <Button onClick={handlePasswordUpdate} disabled={isUpdating} className="w-full rounded-xl">
                      <Lock className="mr-2 h-4 w-4" />
                      {isUpdating ? "Updating..." : "Update Password"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Change Requests Audit Trail Tab */}
            <TabsContent value="requests">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-primary" />
                    Change Request Audit Trail
                  </CardTitle>
                  <CardDescription>Complete history of all profile change requests with reviewer decisions and timestamps</CardDescription>
                </CardHeader>
                <CardContent>
                  {changeRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <Send className="mx-auto h-12 w-12 text-muted-foreground/40" />
                      <p className="mt-3 text-muted-foreground">No change requests yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Use the "Request Change" button on any field to submit a request</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

                      <div className="space-y-4">
                        {changeRequests.map((req, idx) => {
                          const isPending = req.status === "pending";
                          const isApproved = req.status === "approved";
                          const isRejected = req.status === "rejected";

                          return (
                            <div key={req.id} className="relative pl-10">
                              {/* Timeline dot */}
                              <div className={`absolute left-[9px] top-3 h-3 w-3 rounded-full border-2 border-background ${
                                isPending ? "bg-amber-500" : isApproved ? "bg-emerald-500" : "bg-red-500"
                              }`} />

                              <div className={`p-4 rounded-lg border transition-colors ${
                                isPending ? "border-amber-500/30 bg-amber-500/5" : 
                                isApproved ? "border-emerald-500/20 bg-emerald-500/5" : 
                                "border-red-500/20 bg-red-500/5"
                              }`}>
                                {/* Header */}
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] h-5 capitalize">{req.section}</Badge>
                                    <span className="text-sm font-medium">{FIELD_LABELS[req.field_name] || req.field_name}</span>
                                  </div>
                                  <Badge variant="outline" className={`${statusStyles[req.status]} flex items-center gap-1`}>
                                    {statusIcons[req.status]}
                                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                  </Badge>
                                </div>

                                {/* Value comparison */}
                                <div className="grid grid-cols-2 gap-3 text-xs mb-2">
                                  <div className="p-2 rounded bg-muted/30">
                                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">Current Value</span>
                                    <span className="font-medium">{req.current_value || "—"}</span>
                                  </div>
                                  <div className="p-2 rounded bg-primary/5 border border-primary/10">
                                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">Requested Value</span>
                                    <span className="font-medium text-primary">{req.requested_value || "—"}</span>
                                  </div>
                                </div>

                                {req.reason && (
                                  <p className="text-xs text-muted-foreground mb-2">
                                    <span className="font-medium">Reason:</span> {req.reason}
                                  </p>
                                )}

                                {/* Audit trail events */}
                                <div className="border-t border-border/30 pt-2 mt-2 space-y-1">
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span>Submitted on {new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} at {new Date(req.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                                  </div>
                                  {req.reviewed_at && (
                                    <div className="flex items-center gap-2 text-[10px]">
                                      {isApproved ? (
                                        <CheckCircle className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                                      ) : (
                                        <XCircle className="h-3 w-3 flex-shrink-0 text-red-500" />
                                      )}
                                      <span className={isApproved ? "text-emerald-600" : "text-red-600"}>
                                        {isApproved ? "Approved" : "Rejected"} on {new Date(req.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} at {new Date(req.reviewed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                  )}
                                  {req.reviewer_notes && (
                                    <div className="flex items-start gap-2 text-[10px] text-muted-foreground mt-1 ml-5">
                                      <span className="italic">"{req.reviewer_notes}"</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      {/* Change Request Dialog */}
      <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
        <DialogContent className="max-w-md glass-morphism">
          <DialogHeader>
            <DialogTitle className="text-gradient-primary">Request Profile Change</DialogTitle>
            <DialogDescription>
              Submit a change request for <span className="font-medium">{FIELD_LABELS[changeField] || changeField}</span>. HR will review and apply the change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Current Value</Label>
              <Input value={changeCurrentVal} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New Value <span className="text-destructive">*</span></Label>
              <Input
                value={changeNewVal}
                onChange={(e) => setChangeNewVal(e.target.value)}
                placeholder="Enter the desired value"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
              <Textarea
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Why are you requesting this change?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitChange} disabled={!changeNewVal.trim() || submitChange.isPending}>
              <Send className="mr-2 h-4 w-4" />
              {submitChange.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
