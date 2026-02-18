import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, BarChart3, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const tabs = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "HRMS", path: "/hrms/employees", icon: Users },
  { name: "Financial", path: "/financial/accounting", icon: TrendingUp },
  { name: "Analytics", path: "/financial/analytics", icon: BarChart3 },
  { name: "Settings", path: "/settings", icon: Settings },
];

// Determine which bottom nav tab is active based on current path
function getActiveTab(pathname: string) {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/hrms")) return "/hrms/employees";
  if (pathname.startsWith("/financial/analytics")) return "/financial/analytics";
  if (pathname.startsWith("/financial")) return "/financial/accounting";
  if (pathname.startsWith("/performance")) return "/financial/accounting"; // fallback
  if (pathname.startsWith("/settings")) return "/settings";
  return "/";
}

export function MobileBottomNav() {
  const location = useLocation();
  const activeTab = getActiveTab(location.pathname);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border/60"
      style={{
        background:
          "linear-gradient(180deg, hsl(270 10% 8% / 0.97) 0%, hsl(270 10% 6% / 0.99) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center justify-around h-16 px-1 safe-area-bottom">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.path;

          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className="relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 group"
            >
              {/* Active pill background */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavActive"
                  className="absolute inset-x-1 top-2 bottom-2 rounded-xl bg-primary/20 border border-primary/30"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}

              <div
                className={cn(
                  "relative z-10 flex flex-col items-center gap-0.5 transition-all duration-200",
                  isActive ? "scale-105" : "scale-100 group-active:scale-95"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isActive
                      ? "text-primary drop-shadow-[0_0_6px_hsl(var(--primary))]"
                      : "text-muted-foreground group-hover:text-foreground/70"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none transition-all duration-200",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground/70"
                  )}
                >
                  {tab.name}
                </span>
              </div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
