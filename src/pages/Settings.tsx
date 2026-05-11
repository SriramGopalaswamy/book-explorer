import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield, Users, AlertCircle, Trash2, Search, Image, Upload, X,
  Settings as SettingsIcon, Palette, DollarSign, UserCheck, Link2,
  Cloud, CheckCircle2, Loader2, Save, History, Lock, UserX, ChevronDown,
  Clock, Mail, Building2, RefreshCw, ExternalLink, ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BulkUploadDialog } from "@/components/bulk-upload/BulkUploadDialog";
import { useUsersAndRolesBulkUpload } from "@/hooks/useBulkUpload";
import { BulkUploadHistory } from "@/components/bulk-upload/BulkUploadHistory";
import { useOnboardingCompliance, ComplianceData, useOrganizationRoles } from "@/hooks/useOnboardingCompliance";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { useOrgWeekendPolicy } from "@/hooks/useOrgWeekendPolicy";
// GBC-21 + GBC-20: Settings.tsx extraction starts here. Each Section
// component lives under src/components/settings/ and uses react-hook-form
// + zod (the deps are already in package.json). Migrate sections one at
// a time so any regression can be bisected.
import OrganizationInfoSection from "@/components/settings/OrganizationInfoSection";
import BrandingSection from "@/components/settings/BrandingSection";
import PayrollConfigSection from "@/components/settings/PayrollConfigSection";
import GoalCycleSection from "@/components/settings/GoalCycleSection";
import LeadershipRolesSection from "@/components/settings/LeadershipRolesSection";
import IntegrationsSection from "@/components/settings/IntegrationsSection";
import UserManagementSection from "@/components/settings/UserManagementSection";
import { useGoalCycleConfigs, useUpsertGoalCycleConfig, GoalCycleConfig } from "@/hooks/useGoalCycleConfig";
import { useIsAdminOrHR } from "@/hooks/useRoles";
import { ExitProcessingDialog } from "@/components/employees/ExitProcessingDialog";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Target } from "lucide-react";
import { PrivacySecuritySection } from "@/components/settings/PrivacySecuritySection";
import { EmailAlertsConfigSection } from "@/components/settings/EmailAlertsConfigSection";
import { RolePermissionsTab } from "@/components/settings/RolePermissionsTab";






// ─── Organization Info Section ────────────────────────────────────────────────
// OrganizationInfoSection extracted to src/components/settings/OrganizationInfoSection.tsx
// (GBC-21 + GBC-20). See import at top of file.

// BrandingSection extracted to src/components/settings/BrandingSection.tsx
// (GBC-21 + GBC-20). See import at top of file.

// PayrollConfigSection extracted to src/components/settings/PayrollConfigSection.tsx

// ─── Goal Cycle Configuration Section ─────────────────────────────────────────
// GoalCycleSection extracted to src/components/settings/GoalCycleSection.tsx

// ─── Leadership Roles Section ─────────────────────────────────────────────────
// LeadershipRolesSection extracted to src/components/settings/LeadershipRolesSection.tsx

// ─── Integrations Section ─────────────────────────────────────────────────────
// IntegrationsSection extracted to src/components/settings/IntegrationsSection.tsx

// ─── User Management Section (lazy-loaded) ────────────────────────────────────
// UserManagementSection extracted to src/components/settings/UserManagementSection.tsx

// ─── Main Settings Page ───────────────────────────────────────────────────────
// Access is enforced at the route level by AdminRoute in App.tsx.
// No client-side role check needed here.
export default function Settings() {
  const [activeTab, setActiveTab] = useState("organization");

  return (
    <MainLayout title="Settings">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">Manage your organization's details, branding, payroll, roles, email alerts, integrations, and user access</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="organization" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5">
              <DollarSign className="h-4 w-4" />
              Payroll
            </TabsTrigger>
            <TabsTrigger value="leadership" className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              Leadership
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Link2 className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-1.5">
              <Target className="h-4 w-4" />
              Goals
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="upload-history" className="gap-1.5">
              <History className="h-4 w-4" />
              Upload History
            </TabsTrigger>
            <TabsTrigger value="email-alerts" className="gap-1.5">
              <Mail className="h-4 w-4" />
              Email Alerts
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-1.5">
              <Lock className="h-4 w-4" />
              Privacy & Security
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              Roles & Permissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organization" className="mt-6">
            <OrganizationInfoSection />
          </TabsContent>

          <TabsContent value="general" className="mt-6">
            <BrandingSection />
          </TabsContent>

          <TabsContent value="payroll" className="mt-6">
            <PayrollConfigSection />
          </TabsContent>

          <TabsContent value="leadership" className="mt-6">
            <LeadershipRolesSection />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsSection />
          </TabsContent>

          <TabsContent value="goals" className="mt-6">
            <GoalCycleSection />
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <UserManagementSection />
          </TabsContent>

          <TabsContent value="upload-history" className="mt-6">
              <BulkUploadHistory />
          </TabsContent>

          <TabsContent value="email-alerts" className="mt-6">
            <EmailAlertsConfigSection />
          </TabsContent>

          <TabsContent value="privacy" className="mt-6">
            <PrivacySecuritySection />
          </TabsContent>

          <TabsContent value="roles" className="mt-6">
            <RolePermissionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
