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
  ChevronRight,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import grx10Logo from "@/assets/grx10-logo.svg";

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
    <motion.div 
      className="mb-6"
      initial={false}
      animate={{ opacity: 1 }}
    >
      <AnimatePresence>
        {!collapsed && (
          <motion.h3
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50"
          >
            {title}
          </motion.h3>
        )}
      </AnimatePresence>
      <nav className="space-y-1">
        {items.map((item, index) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <NavLink
                to={item.path}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                  isActive
                    ? "text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
                )}
              >
                {/* Active Background */}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                
                {/* Hover Background */}
                {!isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                )}
                
                <motion.div
                  className="relative z-10"
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <Icon className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
                </motion.div>
                
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="relative z-10"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {/* Active Indicator Dot */}
                {isActive && (
                  <motion.div
                    className="absolute right-2 h-2 w-2 rounded-full bg-white/80"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 }}
                  />
                )}
              </NavLink>
            </motion.div>
          );
        })}
      </nav>
    </motion.div>
  );

  return (
    <motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, type: "spring" }}
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
      style={{
        background: "linear-gradient(180deg, hsl(270 10% 7%) 0%, hsl(270 10% 5%) 100%)",
      }}
    >
      {/* Logo */}
      <motion.div
        className="flex h-16 items-center justify-between border-b border-sidebar-border px-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="full-logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <motion.img
                src={grx10Logo}
                alt="GRX10"
                className="h-8 w-auto"
                whileHover={{ scale: 1.05 }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="icon-logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto flex h-9 w-9 items-center justify-center"
            >
              <motion.img
                src={grx10Logo}
                alt="GRX10"
                className="h-6 w-auto"
                whileHover={{ scale: 1.1, rotate: 5 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <NavSection title="Main" items={navigation} />
        <NavSection title="Financial Suite" items={financialNav} />
        <NavSection title="HRMS" items={hrmsNav} />
        <NavSection title="Performance OS" items={performanceNav} />
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <motion.div whileHover={{ scale: 1.02 }}>
          <NavLink
            to="/settings"
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
            <motion.div
              className="relative z-10"
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.3 }}
            >
              <Settings className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
            </motion.div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative z-10"
                >
                  Settings
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        </motion.div>

        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
      
      {/* Decorative Glow */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </motion.aside>
  );
}