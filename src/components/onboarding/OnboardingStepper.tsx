import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  phase: 1 | 2;
}

interface OnboardingStepperProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Set<number>;
}

export function OnboardingStepper({ steps, currentStep, completedSteps }: OnboardingStepperProps) {
  const phase1Steps = steps.filter((s) => s.phase === 1);
  const phase2Steps = steps.filter((s) => s.phase === 2);

  const renderStep = (step: Step, idx: number) => {
    const globalIdx = steps.indexOf(step);
    const isActive = globalIdx === currentStep;
    const isComplete = completedSteps.has(globalIdx);

    return (
      <div key={step.id} className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all",
            isComplete
              ? "bg-primary text-primary-foreground"
              : isActive
              ? "border-2 border-primary text-primary bg-primary/10"
              : "border border-border text-muted-foreground"
          )}
        >
          {isComplete ? <CheckCircle2 className="h-4 w-4" /> : globalIdx + 1}
        </div>
        <span
          className={cn(
            "text-xs font-medium truncate hidden sm:inline",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {step.label}
        </span>
        {idx < (step.phase === 1 ? phase1Steps.length - 1 : phase2Steps.length - 1) && (
          <div className="h-px w-4 bg-border hidden sm:block" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-2">
          Phase 1 — Compliance Core
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {phase1Steps.map((s, i) => renderStep(s, i))}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
          Phase 2 — Operational Setup
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {phase2Steps.map((s, i) => renderStep(s, i))}
        </div>
      </div>
    </div>
  );
}
