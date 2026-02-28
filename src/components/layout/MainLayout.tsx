import { ReactNode, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sidebar, getSidebarCollapsed } from "./Sidebar";
import { Header } from "./Header";
import { AnimatedPage } from "./AnimatedPage";
import { MobileBottomNav } from "./MobileBottomNav";
import { useCurrentRole } from "@/hooks/useRoles";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { AlertTriangle } from "lucide-react";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const roleLandingPages: Record<string, string> = {
  employee: "/hrms/my-attendance",
  hr: "/hrms/employees",
  manager: "/hrms/inbox",
  finance: "/financial/accounting",
  admin: "/",
};

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed());
  const { data: currentRole } = useCurrentRole();
  const prevRoleRef = useRef<string | null | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-toggle", handler);
    return () => window.removeEventListener("sidebar-toggle", handler);
  }, []);

  // Scroll main content area to top on route change — do NOT use window.scrollTo
  // as it can affect fixed sidebar scroll position
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Redirect when role changes (not on initial load)
  useEffect(() => {
    if (currentRole === undefined || currentRole === null) return;
    
    if (prevRoleRef.current !== undefined && prevRoleRef.current !== null && prevRoleRef.current !== currentRole) {
      const landing = roleLandingPages[currentRole] || "/";
      navigate(landing, { replace: true });
    }
    prevRoleRef.current = currentRole;
  }, [currentRole, navigate]);

  const { readOnlyMode } = useSubscription();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        ref={mainRef}
        className={`transition-[padding] duration-300 ${collapsed ? "md:pl-16" : "md:pl-64"}`}
      >
        {readOnlyMode && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">Read-only mode — your subscription has expired. Contact your administrator to renew.</span>
          </div>
        )}
        <Header title={title} subtitle={subtitle} />
        <main className="p-4 md:p-6 pb-24 md:pb-6">
          <AnimatedPage>{children}</AnimatedPage>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
