import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  BookOpen,
  Shield,
  Calendar,
  Loader2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import grx10Logo from "@/assets/grx10-logo.webp";

const onboardingSteps = [
  {
    id: "coa",
    title: "Chart of Accounts",
    description: "Standard Indian chart of accounts with GST-ready ledgers",
    icon: BookOpen,
  },
  {
    id: "compliance",
    title: "Compliance Settings",
    description: "Tax configuration, approval workflows, and statutory defaults",
    icon: Shield,
  },
  {
    id: "fiscal",
    title: "Financial Year",
    description: "Active fiscal year aligned to Indian FY (Apr–Mar)",
    icon: Calendar,
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useUserOrganization();
  const { onboardingRequired, loading } = useSubscription();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  // If org is already active, redirect to dashboard (safe: uses Navigate component)
  if (!loading && !onboardingRequired && org?.orgState === "active") {
    return <Navigate to="/" replace />;
  }

  const initMutation = useMutation({
    mutationFn: async () => {
      if (!org?.organizationId) throw new Error("Organization not found");

      // Use the tenant-safe onboarding RPC (does not require super_admin)
      const { data, error } = await supabase.rpc("complete_tenant_onboarding", {
        _org_id: org.organizationId,
      });
      if (error) throw error;

      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Initialization failed");

      return result;
    },
    onSuccess: () => {
      toast.success("Organization onboarding complete!");
      queryClient.invalidateQueries({ queryKey: ["user-organization"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setTimeout(() => navigate("/", { replace: true }), 800);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleInitialize = async () => {
    // Simulate step completion for UX
    for (const step of onboardingSteps) {
      setCompletedSteps((prev) => [...prev, step.id]);
      await new Promise((r) => setTimeout(r, 600));
    }
    initMutation.mutate();
  };

  const allStepsComplete = completedSteps.length === onboardingSteps.length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center gap-4">
          <img src={grx10Logo} alt="GRX10" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Set Up Your Organization</h1>
            <p className="text-sm text-muted-foreground mt-1">
              We'll configure your financial system with industry-standard defaults
            </p>
          </div>
          {org?.orgName && (
            <Badge variant="outline" className="text-sm">
              {org.orgName}
            </Badge>
          )}
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Initialization Steps
            </CardTitle>
            <CardDescription>
              These configurations will be applied to your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {onboardingSteps.map((step) => {
              const Icon = step.icon;
              const isComplete = completedSteps.includes(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
                    isComplete
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/50"
                  }`}
                >
                  <div className="mt-0.5">
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}

            <Button
              onClick={handleInitialize}
              className="w-full mt-4"
              disabled={initMutation.isPending || allStepsComplete}
            >
              {initMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Initializing…
                </>
              ) : allStepsComplete ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete — Redirecting…
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Initialize Organization
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
