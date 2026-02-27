import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  ChevronDown,
  BookOpen,
  PartyPopper,
  GitBranch,
  X,
  ClipboardCheck,
  Inbox,
  Shield,
  UserCheck,
  Truck,
  Quote,
  FileX,
  Receipt,
  Wallet,
  ScanLine,
  BadgeDollarSign,
  Package,
  Landmark,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import grx10Logo from "@/assets/grx10-logo.webp";
import grx10Icon from "@/assets/grx10-icon.png";
import { useCurrentRole } from "@/hooks/useRoles";

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
  { name: "Customers", path: "/financial/customers", icon: UserCheck, module: "financial" },
  { name: "Vendors", path: "/financial/vendors", icon: Truck, module: "financial" },
  { name: "Invoicing", path: "/financial/invoicing", icon: FileText, module: "financial" },
  { name: "Quotes", path: "/financial/quotes", icon: Quote, module: "financial" },
  { name: "Expenses", path: "/financial/expenses", icon: Wallet, module: "financial" },
  { name: "Bills", path: "/financial/bills", icon: ScanLine, module: "financial" },
  { name: "Reimbursements", path: "/financial/reimbursements", icon: BadgeDollarSign, module: "financial" },
  { name: "Credit Notes", path: "/financial/credit-notes", icon: FileX, module: "financial" },
  { name: "Vendor Credits", path: "/financial/vendor-credits", icon: Receipt, module: "financial" },
  { name: "Banking", path: "/financial/banking", icon: Building2, module: "financial" },
  { name: "Cash Flow", path: "/financial/cashflow", icon: TrendingUp, module: "financial" },
  { name: "Assets", path: "/financial/assets", icon: Package, module: "financial" },
  { name: "Statutory Filings", path: "/financial/statutory", icon: Landmark, module: "financial" },
  { name: "Analytics", path: "/financial/analytics", icon: BarChart3, module: "financial" },
];

const hrmsNav: NavItem[] = [
  { name: "Employees", path: "/hrms/employees", icon: Users, module: "hrms" },
  { name: "Attendance", path: "/hrms/attendance", icon: Clock, module: "hrms" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, module: "hrms" },
  { name: "Payroll", path: "/hrms/payroll", icon: CreditCard, module: "hrms" },
  { name: "Holidays", path: "/hrms/holidays", icon: PartyPopper, module: "hrms" },
  { name: "Org Chart", path: "/hrms/org-chart", icon: GitBranch, module: "hrms" },
  { name: "My Attendance", path: "/hrms/my-attendance", icon: ClipboardCheck, module: "hrms" },
  { name: "My Payslips", path: "/hrms/my-payslips", icon: CreditCard, module: "hrms" },
  { name: "My Reimbursements", path: "/hrms/reimbursements", icon: BadgeDollarSign, module: "hrms" },
  { name: "My Expenses", path: "/financial/expenses", icon: Wallet, module: "hrms" },
];

// Employee-only HRMS items
const employeeHrmsNav: NavItem[] = [
  { name: "My Attendance", path: "/hrms/my-attendance", icon: ClipboardCheck, module: "hrms" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, module: "hrms" },
  { name: "My Payslips", path: "/hrms/my-payslips", icon: CreditCard, module: "hrms" },
  { name: "My Reimbursements", path: "/hrms/reimbursements", icon: BadgeDollarSign, module: "hrms" },
  { name: "My Expenses", path: "/financial/expenses", icon: Wallet, module: "hrms" },
];

// Manager HRMS items (same as employee + Inbox)
const managerHrmsNav: NavItem[] = [
  { name: "My Attendance", path: "/hrms/my-attendance", icon: ClipboardCheck, module: "hrms" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, module: "hrms" },
  { name: "My Payslips", path: "/hrms/my-payslips", icon: CreditCard, module: "hrms" },
  { name: "My Reimbursements", path: "/hrms/reimbursements", icon: BadgeDollarSign, module: "hrms" },
  { name: "My Expenses", path: "/financial/expenses", icon: Wallet, module: "hrms" },
  { name: "Inbox", path: "/hrms/inbox", icon: Inbox, module: "hrms" },
];

// Finance HRMS items (admin views + employee self-service)
const financeHrmsNav: NavItem[] = [
  { name: "Employees", path: "/hrms/employees", icon: Users, module: "hrms" },
  { name: "Payroll", path: "/hrms/payroll", icon: CreditCard, module: "hrms" },
  { name: "Org Chart", path: "/hrms/org-chart", icon: GitBranch, module: "hrms" },
  { name: "My Attendance", path: "/hrms/my-attendance", icon: ClipboardCheck, module: "hrms" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, module: "hrms" },
  { name: "My Payslips", path: "/hrms/my-payslips", icon: CreditCard, module: "hrms" },
  { name: "My Reimbursements", path: "/hrms/reimbursements", icon: BadgeDollarSign, module: "hrms" },
  { name: "My Expenses", path: "/financial/expenses", icon: Wallet, module: "hrms" },
];

const performanceNav: NavItem[] = [
  { name: "Goals", path: "/performance/goals", icon: Target, module: "performance" },
  { name: "Memos", path: "/performance/memos", icon: FileText, module: "performance" },
];

let persistedCollapsed = false;
export function getSidebarCollapsed() { return persistedCollapsed; }

// Mobile sidebar state managed via a global-ish export so Header can trigger it
export let mobileMenuOpen = false;
export let setMobileMenuOpen: (v: boolean) => void = () => {};

function NavSection({
  title,
  items,
  sectionId,
  defaultOpen = true,
  collapsed,
  onItemClick,
}: {
  title: string;
  items: NavItem[];
  sectionId: string;
  defaultOpen?: boolean;
  collapsed: boolean;
  onItemClick: () => void;
}) {
  const location = useLocation();
  const hasActiveItem = items.some((item) => location.pathname === item.path);
  const storageKey = `sidebar-section-${sectionId}`;
  const [sectionOpen, setSectionOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === "true";
    return defaultOpen || hasActiveItem;
  });

  const toggleSection = () => {
    setSectionOpen((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="mb-4">
        {/* Full sidebar: clickable section header */}
        {!collapsed && (
          <button
            onClick={toggleSection}
            className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-lg text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/50 transition-all duration-200 group"
          >
            <span>{title}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                sectionOpen ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>
        )}

        {/* Mini sidebar: subtle divider with tooltip on hover */}
        {collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mx-auto mb-2 mt-1 h-px w-8 rounded-full bg-sidebar-foreground/20 cursor-default" />
            </TooltipTrigger>
            <TooltipContent side="right" className="flex flex-col gap-0.5 py-2">
              <span className="font-semibold text-xs uppercase tracking-wider">{title}</span>
              <span className="text-xs text-muted-foreground">
                {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
            </TooltipContent>
          </Tooltip>
        )}

        {(sectionOpen || collapsed) && (
          <nav className="space-y-1">
              {items.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;

                const linkContent = (
                  <>
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
                    {isActive && !collapsed && (
                      <div className="absolute right-2 h-2 w-2 rounded-full bg-white/80 animate-scale-in" />
                    )}
                  </>
                );

                return collapsed ? (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.path}
                        onClick={onItemClick}
                        className={cn(
                          "group relative flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
                        )}
                      >
                        {linkContent}
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  </Tooltip>
                ) : (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onItemClick}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {linkContent}
                  </NavLink>
                );
              })}
          </nav>
        )}
      </div>
    </TooltipProvider>
  );
}


export function Sidebar() {
  const [collapsed, setCollapsed] = useState(persistedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { data: currentRole, isLoading: roleLoading, isFetched } = useCurrentRole();
  const { data: isSuperAdmin } = useIsSuperAdmin();

  // Only treat as loading on initial fetch, not on refetches — prevents scroll reset
  const isLoading = !isFetched;

  const isEmployee = currentRole === "employee";
  const isManager = currentRole === "manager";
  const isFinance = currentRole === "finance";
  const isHR = currentRole === "hr";

  // Expose setter so Header can trigger it
  setMobileMenuOpen = setMobileOpen;

  const handleToggle = () => {
    persistedCollapsed = !collapsed;
    setCollapsed(!collapsed);
    // Dispatch a custom event so MainLayout can react
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed: !collapsed } }));
  };

  const closeMobile = () => setMobileOpen(false);


  // Build visible nav based on role
  const restrictedRole = isEmployee || isManager || isFinance || isHR;
  const visibleMainNav = restrictedRole ? [] : navigation;
  const visibleFinancialNav = (isEmployee || isManager || isHR) ? [] : financialNav; // finance + admin see financial suite
  const visibleHrmsNav = isManager
    ? managerHrmsNav
    : isEmployee
    ? employeeHrmsNav
    : isFinance
    ? financeHrmsNav
    : hrmsNav;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          {collapsed ? (
            <img
              src={grx10Icon}
              alt="GRX10"
              className="h-8 w-8 mx-auto transition-all duration-300 rounded"
            />
          ) : (
            <img
              src={grx10Logo}
              alt="GRX10"
              className="h-8 w-auto transition-all duration-300"
            />
          )}
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
        {!isLoading && (
          <>
            {visibleMainNav.length > 0 && (
              <NavSection title="Main" items={visibleMainNav} sectionId="main" collapsed={collapsed} onItemClick={closeMobile} />
            )}
            {visibleFinancialNav.length > 0 && (
              <NavSection title="Financial Suite" items={visibleFinancialNav} sectionId="financial" collapsed={collapsed} onItemClick={closeMobile} />
            )}
            <NavSection title="HRMS" items={visibleHrmsNav} sectionId="hrms" collapsed={collapsed} onItemClick={closeMobile} />
            <NavSection title="Performance OS" items={performanceNav} sectionId="performance" collapsed={collapsed} onItemClick={closeMobile} />
            {(currentRole === "admin" || currentRole === "hr") && (
              <NavSection
                title="Admin"
                items={[{ name: "Audit Log", path: "/admin/audit-log", icon: Shield }]}
                sectionId="admin"
                collapsed={collapsed}
                onItemClick={closeMobile}
              />
            )}
            {isSuperAdmin && (
              <NavSection
                title="Platform"
                items={[
                  { name: "Tenants", path: "/platform", icon: Building2 },
                  { name: "Integrity Monitor", path: "/platform/integrity", icon: Shield },
                  { name: "Audit Console", path: "/platform/audit", icon: Crown },
                  { name: "System Health", path: "/platform/health", icon: Settings },
                ]}
                sectionId="platform"
                collapsed={collapsed}
                onItemClick={closeMobile}
              />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {currentRole === "admin" && (
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
        )}

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
