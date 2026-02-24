import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  BookOpen,
  PartyPopper,
  GitBranch,
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
  User,
} from "lucide-react";
import { useCurrentRole } from "@/hooks/useRoles";

interface SearchItem {
  name: string;
  path: string;
  icon: React.ElementType;
  section: string;
  keywords?: string;
}

const ALL_ITEMS: SearchItem[] = [
  // Main
  { name: "Dashboard", path: "/", icon: LayoutDashboard, section: "Main", keywords: "home overview" },
  { name: "Profile", path: "/profile", icon: User, section: "Main", keywords: "account me" },
  { name: "Settings", path: "/settings", icon: Settings, section: "Main", keywords: "preferences config" },

  // Financial
  { name: "Accounting", path: "/financial/accounting", icon: BookOpen, section: "Financial", keywords: "chart of accounts ledger journal" },
  { name: "Customers", path: "/financial/customers", icon: UserCheck, section: "Financial", keywords: "clients contacts" },
  { name: "Vendors", path: "/financial/vendors", icon: Truck, section: "Financial", keywords: "suppliers" },
  { name: "Invoicing", path: "/financial/invoicing", icon: FileText, section: "Financial", keywords: "bills invoice create" },
  { name: "Quotes", path: "/financial/quotes", icon: Quote, section: "Financial", keywords: "estimates proposals" },
  { name: "Expenses", path: "/financial/expenses", icon: Wallet, section: "Financial", keywords: "spending costs" },
  { name: "Bills", path: "/financial/bills", icon: ScanLine, section: "Financial", keywords: "payables" },
  { name: "Reimbursements (Finance)", path: "/financial/reimbursements", icon: BadgeDollarSign, section: "Financial", keywords: "claims refund" },
  { name: "Credit Notes", path: "/financial/credit-notes", icon: FileX, section: "Financial", keywords: "returns" },
  { name: "Vendor Credits", path: "/financial/vendor-credits", icon: Receipt, section: "Financial", keywords: "supplier credit" },
  { name: "Banking", path: "/financial/banking", icon: Building2, section: "Financial", keywords: "bank accounts reconciliation" },
  { name: "Cash Flow", path: "/financial/cashflow", icon: TrendingUp, section: "Financial", keywords: "money flow forecast" },
  { name: "Analytics", path: "/financial/analytics", icon: BarChart3, section: "Financial", keywords: "reports profit loss balance sheet" },

  // HRMS
  { name: "Employees", path: "/hrms/employees", icon: Users, section: "HRMS", keywords: "staff team people directory" },
  { name: "Attendance", path: "/hrms/attendance", icon: Clock, section: "HRMS", keywords: "biometric check-in time" },
  { name: "My Attendance", path: "/hrms/my-attendance", icon: ClipboardCheck, section: "HRMS", keywords: "biometric my time correction" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, section: "HRMS", keywords: "time off vacation sick leave" },
  { name: "Payroll", path: "/hrms/payroll", icon: CreditCard, section: "HRMS", keywords: "salary payslip compensation" },
  { name: "Holidays", path: "/hrms/holidays", icon: PartyPopper, section: "HRMS", keywords: "public holidays calendar" },
  { name: "Org Chart", path: "/hrms/org-chart", icon: GitBranch, section: "HRMS", keywords: "organization hierarchy structure" },
  { name: "Manager Inbox", path: "/hrms/inbox", icon: Inbox, section: "HRMS", keywords: "approvals requests pending" },
  { name: "Reimbursements", path: "/hrms/reimbursements", icon: BadgeDollarSign, section: "HRMS", keywords: "expense claims" },

  // Performance
  { name: "Goals", path: "/performance/goals", icon: Target, section: "Performance", keywords: "objectives targets okr" },
  { name: "Memos", path: "/performance/memos", icon: FileText, section: "Performance", keywords: "announcements notices" },

  // Admin
  { name: "Audit Log", path: "/admin/audit-log", icon: Shield, section: "Admin", keywords: "activity trail history" },
];

export function useCommandSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}

export function CommandSearch({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { data: currentRole } = useCurrentRole();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  const filteredItems = useMemo(() => {
    const isEmployee = currentRole === "employee";
    const isManager = currentRole === "manager";
    const isFinance = currentRole === "finance";
    const isHR = currentRole === "hr";
    const isAdmin = currentRole === "admin";

    // Paths accessible per role
    const employeePaths = new Set([
      "/profile", "/settings",
      "/hrms/my-attendance", "/hrms/leaves", "/hrms/payroll",
      "/hrms/reimbursements", "/financial/expenses",
      "/performance/goals", "/performance/memos",
    ]);

    const managerPaths = new Set([
      ...employeePaths,
      "/hrms/inbox",
    ]);

    // Finance: financial suite + limited HRMS
    const financePaths = new Set([
      "/profile", "/settings",
      "/hrms/payroll", "/hrms/org-chart",
      "/performance/goals", "/performance/memos",
    ]);

    return ALL_ITEMS.filter((item) => {
      // Employees: strict whitelist
      if (isEmployee) return employeePaths.has(item.path);
      // Managers: employee paths + inbox
      if (isManager) return managerPaths.has(item.path);
      // Finance: financial suite + limited HRMS
      if (isFinance) return item.section === "Financial" || financePaths.has(item.path);
      // HR: HRMS + performance + admin, no financial
      if (isHR) return item.section !== "Financial" && item.path !== "/";
      // Admin: everything except self-service duplicates
      if (isAdmin) return item.path !== "/hrms/my-attendance";
      return true;
    });
  }, [currentRole]);

  const grouped = useMemo(() => {
    const groups: Record<string, SearchItem[]> = {};
    filteredItems.forEach((item) => {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    });
    return groups;
  }, [filteredItems]);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate, setOpen]
  );

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-0 right-0 w-80 z-50 rounded-xl border bg-popover shadow-lg overflow-hidden"
    >
      <Command className="rounded-xl">
        <CommandInput placeholder="Search menus…" autoFocus />
        <CommandList className="max-h-72">
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(grouped).map(([section, items]) => (
            <CommandGroup key={section} heading={section}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.path}
                    value={`${item.name} ${item.keywords ?? ""}`}
                    onSelect={() => handleSelect(item.path)}
                    className="gap-3 cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{item.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
