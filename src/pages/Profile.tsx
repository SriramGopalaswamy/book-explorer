import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Mail, Lock, Save, AlertCircle, Building2, Briefcase, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const DEPARTMENTS = [
  "Engineering", "HR", "Finance", "Sales", "Marketing",
  "Operations", "Leadership", "Legal", "Product", "Design",
];

export default function Profile() {
  const { user, updatePassword } = useAuth();
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

  // Load profile from database
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
      // Upsert profile record
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

      // Also update auth metadata for display name
      await supabase.auth.updateUser({ data: { full_name: fullName } });

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

  return (
    <MainLayout title="Profile" subtitle="Manage your account settings">
      <div className="container max-w-4xl py-8">
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="space-y-6"
        >
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
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Tabs */}
          <Tabs defaultValue="account" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 glass-morphism">
              <TabsTrigger value="account" className="rounded-lg">
                <User className="mr-2 h-4 w-4" />
                Account
              </TabsTrigger>
              <TabsTrigger value="security" className="rounded-lg">
                <Lock className="mr-2 h-4 w-4" />
                Security
              </TabsTrigger>
            </TabsList>

            {/* Account Tab */}
            <TabsContent value="account">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Update your personal details and profile</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Email — read only */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      value={user?.email || ""}
                      disabled
                      className="bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed for security reasons</p>
                  </div>

                  {/* Editable fields */}
                  <div className="space-y-2">
                    <Label htmlFor="fullname" className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      Full Name
                    </Label>
                    <Input
                      id="fullname"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      disabled={!profileLoaded}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="jobtitle" className="flex items-center gap-2">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      Job Title
                    </Label>
                    <Input
                      id="jobtitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior Engineer"
                      disabled={!profileLoaded}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Department
                    </Label>
                    <Select
                      value={department}
                      onValueChange={setDepartment}
                      disabled={!profileLoaded}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your department" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +1 555 000 0000"
                      disabled={!profileLoaded}
                    />
                  </div>

                  <Button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile || !profileLoaded}
                    className="w-full rounded-xl"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isSavingProfile ? "Saving..." : "Save Profile"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security">
              <Card className="glass-morphism">
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>
                    Update your password to keep your account secure
                  </CardDescription>
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
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="rounded-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="rounded-lg"
                    />
                  </div>

                  <Button
                    onClick={handlePasswordUpdate}
                    disabled={isUpdating}
                    className="w-full rounded-xl"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isUpdating ? "Updating..." : "Update Password"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </MainLayout>
  );
}
