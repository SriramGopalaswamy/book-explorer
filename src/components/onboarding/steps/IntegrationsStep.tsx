import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cloud, Link2 } from "lucide-react";

export function IntegrationsStep() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect Microsoft 365 or Google Workspace to enable SSO, calendar sync, and email integration.
        These are optional and can be set up later from Settings.
      </p>

      <Card className="p-4 border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#0078D4]/10 flex items-center justify-center">
              <Cloud className="h-5 w-5 text-[#0078D4]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Microsoft 365</p>
              <p className="text-xs text-muted-foreground">Azure AD SSO, Outlook, Teams</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
        </div>
      </Card>

      <Card className="p-4 border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-[#4285F4]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Google Workspace</p>
              <p className="text-xs text-muted-foreground">Google SSO, Calendar, Drive</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">Coming Soon</Badge>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground italic">
        OAuth integration will require server-side token exchange. Configure from Settings → Integrations after activation.
      </div>
    </div>
  );
}
