import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Activity, Zap, Shield, KeyRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";

// Lazy import the content from existing pages
import { TenantsContent } from "./PlatformOrganizations";
import { HealthContent } from "./PlatformHealth";
import { ActionsContent } from "./PlatformActions";
import { IntegrityContent } from "./PlatformIntegrity";
import { SubscriptionKeysContent } from "./PlatformSubscriptionKeys";

const TABS = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "health", label: "Health", icon: Activity },
  { id: "actions", label: "Actions", icon: Zap },
  { id: "integrity", label: "Integrity", icon: Shield },
  { id: "subscriptions", label: "Subscriptions", icon: KeyRound },
] as const;

export default function PlatformTenants() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <MainLayout title="Tenants" subtitle="Organization lifecycle, health, integrity & subscription management">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-background"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview">
          <TenantsContent />
        </TabsContent>

        <TabsContent value="health">
          <HealthContent />
        </TabsContent>

        <TabsContent value="actions">
          <ActionsContent />
        </TabsContent>

        <TabsContent value="integrity">
          <IntegrityContent />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SubscriptionKeysContent />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
