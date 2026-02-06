import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  Users,
  Target,
  FileText,
  Building2,
  Clock,
  Calendar,
  CreditCard,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  module?: "financial" | "hrms" | "performance";
}

const navigation: NavItem[] = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
];

const financialNav: NavItem[] = [
  { name: "Accounting", path: "/financial/accounting", icon: BookOpen, module: "financial" },
  { name: "Invoicing", path: "/financial/invoicing", icon: FileText, module: "financial" },
  { name: "Banking", path: "/financial/banking", icon: Building2, module: "financial" },
  { name: "Cash Flow", path: "/financial/cashflow", icon: TrendingUp, module: "financial" },
];

const hrmsNav: NavItem[] = [
  { name: "Employees", path: "/hrms/employees", icon: Users, module: "hrms" },
  { name: "Attendance", path: "/hrms/attendance", icon: Clock, module: "hrms" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, module: "hrms" },
  { name: "Payroll", path: "/hrms/payroll", icon: CreditCard, module: "hrms" },
];

const performanceNav: NavItem[] = [
  { name: "Goals", path: "/performance/goals", icon: Target, module: "performance" },
  { name: "Memos", path: "/performance/memos", icon: FileText, module: "performance" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const NavSection = ({ title, items }: { title: string; items: NavItem[] }) => (
    <div className="mb-6">
      {!collapsed && (
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          {title}
        </h3>
      )}
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
              {!collapsed && <span>{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-sidebar-foreground">GRX10</h1>
              <p className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                Business Suite
              </p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="Main" items={navigation} />
        <NavSection title="Financial Suite" items={financialNav} />
        <NavSection title="HRMS" items={hrmsNav} />
        <NavSection title="Performance OS" items={performanceNav} />
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <NavLink
          to="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            location.pathname === "/settings" && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
        >
          <Settings className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
          {!collapsed && <span>Settings</span>}
        </NavLink>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
