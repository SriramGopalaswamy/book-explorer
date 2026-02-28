import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Building2,
  Shield,
  Activity,
  ClipboardList,
  ChevronLeft,
  Zap,
  FlaskConical,
  KeyRound,
} from "lucide-react";
import grx10Logo from "@/assets/grx10-logo.webp";
import { PlatformOrgBanner } from "./PlatformOrgBanner";

const platformNav = [
  { name: "Tenants", path: "/platform", icon: Building2 },
  { name: "Subscription Keys", path: "/platform/subscription-keys", icon: KeyRound },
  { name: "Integrity Monitor", path: "/platform/integrity", icon: Shield },
  { name: "System Health", path: "/platform/health", icon: Activity },
  { name: "Actions", path: "/platform/actions", icon: Zap },
  { name: "Sandbox", path: "/platform/sandbox", icon: FlaskConical },
  { name: "Audit Console", path: "/platform/audit", icon: ClipboardList },
];

interface PlatformLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function PlatformLayout({ children, title, subtitle }: PlatformLayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <PlatformOrgBanner />

      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex h-14 items-center gap-4 px-6">
          <NavLink to="/" className="flex items-center gap-2 mr-4">
            <img src={grx10Logo} alt="GRX10" className="h-7 w-auto" />
          </NavLink>

          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
            <Shield className="h-4 w-4 text-destructive ml-2" />
            <span className="text-xs font-bold uppercase tracking-wider text-destructive px-1">
              Platform Admin
            </span>
          </div>

          <nav className="flex items-center gap-1 ml-6">
            {platformNav.map((item) => {
              const isActive =
                item.path === "/platform"
                  ? location.pathname === "/platform"
                  : location.pathname.startsWith(item.path);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.name}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto">
            <NavLink
              to="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden md:inline">Exit Platform</span>
            </NavLink>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
