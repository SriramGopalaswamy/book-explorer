import { useState } from "react";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Mail, Lock, Save, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function Profile() {
  const { user, updatePassword } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Password change form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const getInitials = () => {
    if (user?.user_metadata?.full_name) {
      const names = user.user_metadata.full_name.split(" ");
      return names.map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const getDisplayName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    return user?.email?.split("@")[0] || "User";
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
    } catch (error) {
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
                  <h2 className="text-2xl font-bold">{getDisplayName()}</h2>
                  <p className="text-muted-foreground">{user?.email}</p>
                  <div className="mt-2 flex gap-2">
                    <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {user?.user_metadata?.full_name ? "Active Account" : "Email Account"}
                    </div>
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
                  <CardDescription>
                    View your account details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      value={user?.email || ""}
                      disabled
                      className="bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed for security reasons
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fullname">Full Name</Label>
                    <Input
                      id="fullname"
                      value={user?.user_metadata?.full_name || ""}
                      disabled
                      className="bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact your administrator to update your name
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="created">Account Created</Label>
                    <Input
                      id="created"
                      value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : ""}
                      disabled
                      className="bg-secondary/50"
                    />
                  </div>
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
