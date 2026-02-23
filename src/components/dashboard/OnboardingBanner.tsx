import { useOnboardingStatus } from "@/hooks/useUserOrganization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Loader2 } from "lucide-react";

/**
 * Shows an informational banner on finance pages when the organization
 * hasn't completed Financial OS initialization.
 */
export function OnboardingBanner() {
  const { initialized, orgState, loading } = useOnboardingStatus();

  if (loading || initialized) return null;

  const stateMessages: Record<string, { title: string; desc: string }> = {
    draft: {
      title: "Organization Pending Initialization",
      desc: "This organization is in draft state. A platform administrator must initialize the Financial Operating System before financial modules are fully operational.",
    },
    initializing: {
      title: "Initialization In Progress",
      desc: "The Financial Operating System is being configured. Some features may be limited until initialization is complete.",
    },
    locked: {
      title: "Organization Locked",
      desc: "This organization is currently locked. Write operations are restricted. Contact your platform administrator.",
    },
    archived: {
      title: "Organization Archived",
      desc: "This organization has been archived. All data is read-only.",
    },
  };

  const msg = stateMessages[orgState ?? ""] ?? {
    title: "Financial System Not Initialized",
    desc: "The Chart of Accounts and tax configuration have not been set up yet. Contact your platform administrator to initialize the Financial Operating System.",
  };

  return (
    <Alert variant="default" className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
      <Info className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-300">{msg.title}</AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-400">
        {msg.desc}
      </AlertDescription>
    </Alert>
  );
}
