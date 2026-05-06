import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { Sidebar, getSidebarCollapsed } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { AIAgentChat } from "@/components/ai/AIAgentChat";
import { PlatformOrgBanner } from "@/components/platform/PlatformOrgBanner";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useCurrentRole } from "@/hooks/useRoles";
import { useSubscription } from "@/contexts/SubscriptionContext";

const roleLandingPages: Record<string, string> = {
  employee: "/hrms/my-attendance",
  hr: "/hrms/employees",
  manager: "/hrms/inbox",
  finance: "/financial/accounting",
  admin: "/",
};

/**
 * Persistent application chrome (sidebar + outer wrapper). Stays mounted across
 * navigations so route changes only swap the right-hand content. The Suspense
 * boundary lives here — lazy-loaded pages show an inline loader instead of
 * unmounting the entire layout.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed());
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  const { data: currentRole } = useCurrentRole();
  const prevRoleRef = useRef<string | null | undefined>(undefined);
  const { readOnlyMode } = useSubscription();
  useSessionTimeout();

  useEffect(() => {
    const handler = (e: Event) => {
      setCollapsed((e as CustomEvent).detail.collapsed);
    };
    window.addEventListener("sidebar-toggle", handler);
    return () => window.removeEventListener("sidebar-toggle", handler);
  }, []);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  // Redirect when role changes (not on initial load)
  useEffect(() => {
    if (currentRole === undefined || currentRole === null) return;
    if (
      prevRoleRef.current !== undefined &&
      prevRoleRef.current !== null &&
      prevRoleRef.current !== currentRole
    ) {
      const landing = roleLandingPages[currentRole] || "/";
      navigate(landing, { replace: true });
    }
    prevRoleRef.current = currentRole;
  }, [currentRole, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      {location.pathname.startsWith("/platform") && <PlatformOrgBanner />}
      <Sidebar />
      <div
        ref={mainRef}
        className={`transition-[padding] duration-300 ${collapsed ? "md:pl-16" : "md:pl-64"}`}
      >
        {readOnlyMode && (
          <div
            className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 text-sm text-destructive"
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">
              Read-only mode — your subscription has expired. Contact your administrator to renew.
            </span>
          </div>
        )}
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
      <MobileBottomNav />
      {!location.pathname.toLowerCase().startsWith("/financial/analytics") && <AIAgentChat />}
    </div>
  );
}
