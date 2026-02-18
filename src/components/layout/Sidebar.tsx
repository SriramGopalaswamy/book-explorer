import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Target,
  FileText,
  Building2,
  BarChart3,
  Clock,
  Calendar,
  CreditCard,
  TrendingUp,
  Settings,
  ChevronLeft,
  BookOpen,
  PartyPopper,
  GitBranch,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import grx10Logo from "@/assets/grx10-logo.webp";

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
  { name: "Analytics", path: "/financial/analytics", icon: BarChart3, module: "financial" },
];

const hrmsNav: NavItem[] = [
  { name: "Employees", path: "/hrms/employees", icon: Users, module: "hrms" },
  { name: "Attendance", path: "/hrms/attendance", icon: Clock, module: "hrms" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, module: "hrms" },
  { name: "Payroll", path: "/hrms/payroll", icon: CreditCard, module: "hrms" },
  { name: "Holidays", path: "/hrms/holidays", icon: PartyPopper, module: "hrms" },
  { name: "Org Chart", path: "/hrms/org-chart", icon: GitBranch, module: "hrms" },
];

const performanceNav: NavItem[] = [
  { name: "Goals", path: "/performance/goals", icon: Target, module: "performance" },
  { name: "Memos", path: "/performance/memos", icon: FileText, module: "performance" },
];

let persistedCollapsed = false;

// Mobile sidebar state managed via a global-ish export so Header can trigger it
export let mobileMenuOpen = false;
export let setMobileMenuOpen: (v: boolean) => void = () => {};

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(persistedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Expose setter so Header can trigger it
  setMobileMenuOpen = setMobileOpen;

  const handleToggle = () => {
    persistedCollapsed = !collapsed;
    setCollapsed(!collapsed);
  };

  const closeMobile = () => setMobileOpen(false);

  const NavSection = ({
    title,
    items,
  }: {
    title: string;
    items: NavItem[];
    sectionId: string;
  }) => (
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
              onClick={closeMobile}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-lg transition-all duration-200" />
              )}
              {!isActive && (
                <div className="absolute inset-0 rounded-xl bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              )}
              <div className="relative z-10 transition-transform duration-200 group-hover:scale-110">
                <Icon className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
              </div>
              {!collapsed && (
                <span className="relative z-10 whitespace-nowrap">{item.name}</span>
              )}
              {isActive && (
                <div className="absolute right-2 h-2 w-2 rounded-full bg-white/80 animate-scale-in" />
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <img
            src={grx10Logo}
            alt="GRX10"
            className={cn("h-8 w-auto transition-all duration-300", collapsed && "h-6 mx-auto")}
          />
        </div>
        {/* Close button on mobile */}
        <button
          onClick={closeMobile}
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <NavSection title="Main" items={navigation} sectionId="main" />
        <NavSection title="Financial Suite" items={financialNav} sectionId="financial" />
        <NavSection title="HRMS" items={hrmsNav} sectionId="hrms" />
        <NavSection title="Performance OS" items={performanceNav} sectionId="performance" />
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <NavLink
          to="/settings"
          onClick={closeMobile}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-all duration-200",
            location.pathname === "/settings" && "text-sidebar-accent-foreground"
          )}
        >
          {location.pathname === "/settings" && (
            <motion.div
              layoutId="settingsActive"
              className="absolute inset-0 rounded-xl bg-sidebar-accent"
              initial={false}
            />
          )}
          <div className="relative z-10 transition-transform duration-300 group-hover:rotate-90">
            <Settings className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
          </div>
          {!collapsed && <span className="relative z-10">Settings</span>}
        </NavLink>

        {/* Desktop collapse toggle */}
        <button
          onClick={handleToggle}
          className="mt-2 hidden md:flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-sidebar-foreground/50 transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <ChevronLeft
            className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* Decorative Glow */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </>
  );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden md:flex h-screen flex-col border-r border-sidebar-border transition-[width] duration-300 ease-in-out",
          collapsed ? "w-16" : "w-64"
        )}
        style={{
          background: "linear-gradient(180deg, hsl(270 10% 7%) 0%, hsl(270 10% 5%) 100%)",
        }}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile Backdrop ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={closeMobile}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            key="mobile-sidebar"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-sidebar-border md:hidden"
            style={{
              background: "linear-gradient(180deg, hsl(270 10% 7%) 0%, hsl(270 10% 5%) 100%)",
            }}
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

// Exported hook-style trigger for Header to use
export function useMobileMenu() {
  return { openMobileMenu: () => setMobileMenuOpen(true) };
}
