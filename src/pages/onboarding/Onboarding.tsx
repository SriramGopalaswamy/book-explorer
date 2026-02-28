import { useState, useCallback, useMemo } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useOnboardingCompliance, ComplianceData, useOrgHasTransactions } from "@/hooks/useOnboardingCompliance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { EntityIdentityStep } from "@/components/onboarding/steps/EntityIdentityStep";
import { GstTaxStep } from "@/components/onboarding/steps/GstTaxStep";
import { FinancialSetupStep } from "@/components/onboarding/steps/FinancialSetupStep";
import { ChartOfAccountsStep } from "@/components/onboarding/steps/ChartOfAccountsStep";
import { BrandingStep } from "@/components/onboarding/steps/BrandingStep";
import { PayrollFlagsStep } from "@/components/onboarding/steps/PayrollFlagsStep";
import { LeadershipRolesStep } from "@/components/onboarding/steps/LeadershipRolesStep";
import { IntegrationsStep } from "@/components/onboarding/steps/IntegrationsStep";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Shield,
  Sparkles,
  Building2,
  Receipt,
  Calendar,
  BookOpen,
  Palette,
  DollarSign,
  Users,
  Link,
} from "lucide-react";
import { toast } from "sonner";
import grx10Logo from "@/assets/grx10-logo.webp";

const STEPS = [
  { id: "entity", label: "Entity Identity", phase: 1 as const, icon: Building2 },
  { id: "gst", label: "GST & Tax", phase: 1 as const, icon: Receipt },
  { id: "financial", label: "Financial Setup", phase: 1 as const, icon: Calendar },
  { id: "coa", label: "Chart of Accounts", phase: 1 as const, icon: BookOpen },
  { id: "branding", label: "Branding", phase: 2 as const, icon: Palette },
  { id: "payroll", label: "Payroll Flags", phase: 2 as const, icon: DollarSign },
  { id: "roles", label: "Leadership Roles", phase: 2 as const, icon: Users },
  { id: "integrations", label: "Integrations", phase: 2 as const, icon: Link },
];

function validateStep(step: number, data: ComplianceData): string | null {
  switch (step) {
    case 0:
      if (!data.legal_name?.trim()) return "Legal name is required";
      if (!data.entity_type) return "Entity type is required";
      if (!data.pan?.trim() || data.pan.trim().length !== 10) return "Valid PAN is required";
      if (!data.registered_address?.trim()) return "Registered address is required";
      if (!data.state) return "State is required";
      if (!data.pincode?.trim() || data.pincode.trim().length !== 6) return "Valid 6-digit pincode is required";
      return null;
    case 1:
      if (!data.registration_type) return "Registration type is required";
      if (!data.filing_frequency) return "Filing frequency is required";
      return null;
    case 2:
      if (!data.financial_year_start) return "Financial year start is required";
      if (!data.books_start_date) return "Books start date is required";
      if (!data.accounting_method) return "Accounting method is required";
      return null;
    case 3:
      if (!data.industry_template) return "Select an industry template";
      if (!data.coa_confirmed) return "Please confirm the Chart of Accounts setup";
      return null;
    default:
      return null;
  }
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { data: org } = useUserOrganization();
  const { onboardingRequired, loading: subLoading } = useSubscription();
  const { compliance, isLoading, upsert, completePhase1 } = useOnboardingCompliance();
  const { data: hasTransactions } = useOrgHasTransactions();
  const configLocked = !!hasTransactions;

  const [currentStep, setCurrentStep] = useState(0);
  const [localData, setLocalData] = useState<ComplianceData>({});
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Merge remote data into local on first load
  if (compliance && !initialized) {
    setLocalData((prev) => ({ ...compliance, ...prev }));
    setInitialized(true);
  }

  const isPhase1 = currentStep < 4;
  const isPhase1Complete = compliance?.phase1_completed_at != null;
  const orgActive = org?.orgState === "active";

  // Determine if we should redirect
  const shouldRedirect = !subLoading && orgActive && !onboardingRequired && currentStep < 4
    && !(compliance?.phase1_completed_at && !compliance?.phase2_completed_at)
    && (compliance?.phase2_completed_at || !compliance?.phase1_completed_at);

  const handleChange = useCallback((updates: Partial<ComplianceData>) => {
    setLocalData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSaveAndContinue = async () => {
    // Validate Phase 1 steps
    if (isPhase1) {
      const error = validateStep(currentStep, localData);
      if (error) {
        toast.error(error);
        return;
      }
    }

    try {
      // Save current data
      await upsert.mutateAsync(localData);
      setCompletedSteps((prev) => new Set(prev).add(currentStep));

      // If completing Step 4 (last Phase 1 step), trigger activation
      if (currentStep === 3) {
        await completePhase1.mutateAsync();
        toast.success("Phase 1 complete! Your organization is now active.", {
          description: "You can now continue with optional setup or go to Dashboard.",
        });
        setCurrentStep(4); // Move to Phase 2
        return;
      }

      // Move to next step
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const handleSkipPhase2 = async () => {
    // Save any pending Phase 2 data
    try {
      await upsert.mutateAsync({ ...localData, phase2_completed_at: new Date().toISOString() });
    } catch {
      // Non-critical
    }
    navigate("/", { replace: true });
  };

  const handleFinishPhase2 = async () => {
    try {
      await upsert.mutateAsync({ ...localData, phase2_completed_at: new Date().toISOString() });
      toast.success("Onboarding complete!");
      navigate("/", { replace: true });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const StepIcon = STEPS[currentStep]?.icon || Shield;

  if (isLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (shouldRedirect) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <img src={grx10Logo} alt="GRX10" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Set Up Your Organization</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isPhase1
                ? "Complete compliance setup to activate your account"
                : "Optional operational configuration"}
            </p>
          </div>
          {org?.orgName && (
            <Badge variant="outline" className="text-sm">{org.orgName}</Badge>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {currentStep + 1} of {STEPS.length}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Stepper */}
        <OnboardingStepper steps={STEPS} currentStep={currentStep} completedSteps={completedSteps} />

        {/* Active Step Card */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <StepIcon className="h-5 w-5 text-primary" />
                {STEPS[currentStep].label}
              </CardTitle>
              {isPhase1 ? (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                  <Shield className="h-3 w-3 mr-1" /> Required
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  <Sparkles className="h-3 w-3 mr-1" /> Optional
                </Badge>
              )}
            </div>
            <CardDescription>
              {isPhase1
                ? "This step is required to activate your organization"
                : "This step is optional and can be completed later"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentStep === 0 && <EntityIdentityStep data={localData} onChange={handleChange} />}
            {currentStep === 1 && <GstTaxStep data={localData} onChange={handleChange} />}
            {currentStep === 2 && <FinancialSetupStep data={localData} onChange={handleChange} />}
            {currentStep === 3 && <ChartOfAccountsStep data={localData} onChange={handleChange} />}
            {currentStep === 4 && <BrandingStep data={localData} onChange={handleChange} />}
            {currentStep === 5 && <PayrollFlagsStep data={localData} onChange={handleChange} />}
            {currentStep === 6 && <LeadershipRolesStep />}
            {currentStep === 7 && <IntegrationsStep />}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0 || (currentStep === 4 && isPhase1Complete)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>

              <div className="flex gap-2">
                {/* Phase 2: Skip / Go to Dashboard */}
                {!isPhase1 && (
                  <Button variant="outline" size="sm" onClick={handleSkipPhase2}>
                    Go to Dashboard
                  </Button>
                )}

                {/* Last Phase 2 step: Finish */}
                {currentStep === STEPS.length - 1 ? (
                  <Button size="sm" onClick={handleFinishPhase2} disabled={upsert.isPending}>
                    {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Finish Setup
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSaveAndContinue}
                    disabled={upsert.isPending || completePhase1.isPending}
                  >
                    {(upsert.isPending || completePhase1.isPending) ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-1" />
                    )}
                    {currentStep === 3 ? "Activate Organization" : "Save & Continue"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
