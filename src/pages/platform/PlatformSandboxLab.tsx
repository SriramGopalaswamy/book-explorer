import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Zap } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { SandboxContent } from "./PlatformSandbox";
import { SimulationContent } from "./PlatformSimulation";

const TABS = [
  { id: "environments", label: "Environments", icon: FlaskConical },
  { id: "simulation", label: "Simulation", icon: Zap },
] as const;

export default function PlatformSandboxLab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "environments";

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <MainLayout title="Sandbox Lab" subtitle="Isolated environments, role simulation & compliance testing">
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
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="environments">
          <SandboxContent />
        </TabsContent>

        <TabsContent value="simulation">
          <SimulationContent />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
