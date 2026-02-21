import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Visible impersonation banner shown when super_admin has an active org context.
 * This banner makes it unmistakably clear that org-scoped data is being viewed.
 */
export function PlatformOrgBanner() {
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Read from sessionStorage (set by org switch)
  useEffect(() => {
    const stored = sessionStorage.getItem("platform_active_org");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setOrgId(parsed.id);
        setOrgName(parsed.name);
      } catch {}
    }

    const handler = () => {
      const stored = sessionStorage.getItem("platform_active_org");
      if (stored) {
        const parsed = JSON.parse(stored);
        setOrgId(parsed.id);
        setOrgName(parsed.name);
      } else {
        setOrgId(null);
        setOrgName(null);
      }
    };

    window.addEventListener("platform-org-changed", handler);
    return () => window.removeEventListener("platform-org-changed", handler);
  }, []);

  const clearOrg = () => {
    sessionStorage.removeItem("platform_active_org");
    setOrgId(null);
    setOrgName(null);
    window.dispatchEvent(new Event("platform-org-changed"));
  };

  if (!orgId) return null;

  return (
    <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground">
      <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        <span>
          IMPERSONATION MODE — Viewing as:{" "}
          <strong className="font-bold">{orgName ?? orgId}</strong>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-destructive-foreground hover:bg-destructive-foreground/20"
          onClick={clearOrg}
        >
          <X className="h-3 w-3 mr-1" />
          Exit
        </Button>
      </div>
    </div>
  );
}
