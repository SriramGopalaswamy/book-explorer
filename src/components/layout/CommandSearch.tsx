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
  ShieldCheck,
  UserCheck,
  Truck,
  Quote,
  FileX,
  Receipt,
  Wallet,
  ScanLine,
  BadgeDollarSign,
  User,
  PenLine,
  BookMarked,
  FileSpreadsheet,
  Package,
  Landmark,
  IndianRupee,
  ArrowRightLeft,
  RotateCcw,
  Banknote,
  CheckSquare,
  Plug,
  RefreshCw,
  Warehouse,
  ClipboardList,
  ShoppingCart,
  ShoppingBag,
  PackageCheck,
  Layers,
  Wrench,
  Flame,
  MapPin,
  FlaskConical,
  Database,
  Activity,
  Cpu,
  Zap,
} from "lucide-react";
import { useCurrentRole } from "@/hooks/useRoles";
import { useIsSuperAdmin } from "@/hooks/useSuperAdmin";

interface SearchItem {
  name: string;
  path: string;
  icon: React.ElementType;
  section: string;
  keywords?: string;
  superAdminOnly?: boolean;
}

const ALL_ITEMS: SearchItem[] = [
  // Main
  { name: "Dashboard", path: "/", icon: LayoutDashboard, section: "Main", keywords: "home overview" },
  { name: "Profile", path: "/profile", icon: User, section: "Main", keywords: "account me my profile" },
  { name: "Settings", path: "/settings", icon: Settings, section: "Main", keywords: "preferences config" },

  // Financial
  { name: "Accounting", path: "/financial/accounting", icon: BookOpen, section: "Financial", keywords: "chart of accounts coa" },
  { name: "Journal Entry", path: "/financial/journal-entry", icon: PenLine, section: "Financial", keywords: "journal posting debit credit entry" },
  { name: "Ledger Explorer", path: "/financial/ledger", icon: BookMarked, section: "Financial", keywords: "ledger accounts transactions" },
  { name: "Customers", path: "/financial/customers", icon: UserCheck, section: "Financial", keywords: "clients contacts receivables" },
  { name: "Vendors", path: "/financial/vendors", icon: Truck, section: "Financial", keywords: "suppliers payables" },
  { name: "Sales Invoices", path: "/financial/invoicing", icon: FileText, section: "Financial", keywords: "invoice create billing sales" },
  { name: "Quotes", path: "/financial/quotes", icon: Quote, section: "Financial", keywords: "estimates proposals quotations" },
  { name: "Expenses", path: "/financial/expenses", icon: Wallet, section: "Financial", keywords: "spending costs expenditure" },
  { name: "Bills", path: "/financial/bills", icon: ScanLine, section: "Financial", keywords: "payables purchase bills" },
  { name: "Reimbursements (Finance)", path: "/financial/reimbursements", icon: BadgeDollarSign, section: "Financial", keywords: "claims refund employee" },
  { name: "Credit Notes", path: "/financial/credit-notes", icon: FileX, section: "Financial", keywords: "returns credit refund customer" },
  { name: "Vendor Credits", path: "/financial/vendor-credits", icon: Receipt, section: "Financial", keywords: "supplier credit purchase return" },
  { name: "Banking", path: "/financial/banking", icon: Building2, section: "Financial", keywords: "bank accounts reconciliation" },
  { name: "Cash Flow", path: "/financial/cashflow", icon: TrendingUp, section: "Financial", keywords: "money flow forecast liquidity" },
  { name: "Payment Receipts", path: "/financial/payment-receipts", icon: Banknote, section: "Financial", keywords: "received payment customer receipt" },
  { name: "Vendor Payments", path: "/financial/vendor-payments", icon: Banknote, section: "Financial", keywords: "paid supplier payment outgoing" },
  { name: "Exchange Rates", path: "/financial/exchange-rates", icon: ArrowRightLeft, section: "Financial", keywords: "forex fx currency conversion rates IAS21" },
  { name: "Assets", path: "/financial/assets", icon: Package, section: "Financial", keywords: "fixed assets depreciation capex" },
  { name: "Statutory Filings", path: "/financial/statutory", icon: Landmark, section: "Financial", keywords: "GST TDS compliance filing tax" },
  { name: "E-Way Bills", path: "/financial/eway-bills", icon: Truck, section: "Financial", keywords: "eway transport goods movement" },
  { name: "E-Invoices", path: "/financial/e-invoices", icon: FileText, section: "Financial", keywords: "einvoice IRN QR code GST" },
  { name: "Analytics", path: "/financial/analytics", icon: BarChart3, section: "Financial", keywords: "reports profit loss balance sheet financial" },
  { name: "Recurring Transactions", path: "/financial/recurring", icon: RefreshCw, section: "Financial", keywords: "recurring repeat automatic template schedule" },
  { name: "CA Dashboard", path: "/financial/ca-dashboard", icon: Shield, section: "Financial", keywords: "chartered accountant dashboard depreciation run" },
  { name: "CA Audit Console", path: "/financial/audit-console", icon: ShieldCheck, section: "Financial", keywords: "audit console chartered accountant" },
  { name: "Automation Studio", path: "/financial/automation", icon: Zap, section: "Financial", keywords: "automation workflow invoice follow-up email whatsapp studio" },

  // Inventory
  { name: "Items", path: "/inventory/items", icon: Package, section: "Inventory", keywords: "products sku catalog master items" },
  { name: "Warehouses", path: "/inventory/warehouses", icon: Warehouse, section: "Inventory", keywords: "storage locations godown" },
  { name: "Stock Ledger", path: "/inventory/stock-ledger", icon: BookOpen, section: "Inventory", keywords: "stock movement history inventory ledger" },
  { name: "Stock Adjustments", path: "/inventory/adjustments", icon: ClipboardList, section: "Inventory", keywords: "adjustment write-off stock correction" },

  // Procurement
  { name: "Purchase Orders", path: "/procurement/purchase-orders", icon: ShoppingCart, section: "Procurement", keywords: "PO purchase order vendor order" },
  { name: "Goods Receipts", path: "/procurement/goods-receipts", icon: PackageCheck, section: "Procurement", keywords: "GRN goods receipt note inward" },
  { name: "Purchase Returns", path: "/procurement/returns", icon: RotateCcw, section: "Procurement", keywords: "purchase return debit note vendor return" },

  // Sales
  { name: "Sales Orders", path: "/sales/orders", icon: ShoppingBag, section: "Sales", keywords: "SO sales order customer order" },
  { name: "Deliveries", path: "/sales/deliveries", icon: Truck, section: "Sales", keywords: "delivery note outward dispatch shipment" },
  { name: "Sales Returns", path: "/sales/returns", icon: RotateCcw, section: "Sales", keywords: "sales return credit note customer return" },

  // Manufacturing
  { name: "Bill of Materials", path: "/manufacturing/bom", icon: Layers, section: "Manufacturing", keywords: "BOM recipe components production" },
  { name: "Work Orders", path: "/manufacturing/work-orders", icon: Wrench, section: "Manufacturing", keywords: "work order production job manufacturing" },
  { name: "Consumption", path: "/manufacturing/consumption", icon: Flame, section: "Manufacturing", keywords: "raw material consumption production use" },
  { name: "Finished Goods", path: "/manufacturing/finished-goods", icon: PackageCheck, section: "Manufacturing", keywords: "finished goods production output posting" },

  // Warehouse
  { name: "Bin Locations", path: "/warehouse/bins", icon: MapPin, section: "Warehouse", keywords: "bin rack shelf location warehouse" },
  { name: "Stock Transfers", path: "/warehouse/transfers", icon: ArrowRightLeft, section: "Warehouse", keywords: "transfer inter-warehouse stock movement" },
  { name: "Picking Lists", path: "/warehouse/picking", icon: ClipboardList, section: "Warehouse", keywords: "pick list order fulfillment picking" },
  { name: "Inventory Counts", path: "/warehouse/counts", icon: ClipboardCheck, section: "Warehouse", keywords: "cycle count stocktake inventory physical count" },

  // HRMS
  { name: "Employees", path: "/hrms/employees", icon: Users, section: "HRMS", keywords: "staff team people directory" },
  { name: "Attendance", path: "/hrms/attendance", icon: Clock, section: "HRMS", keywords: "biometric check-in time" },
  { name: "My Attendance", path: "/hrms/my-attendance", icon: ClipboardCheck, section: "HRMS", keywords: "my time correction biometric" },
  { name: "Leaves", path: "/hrms/leaves", icon: Calendar, section: "HRMS", keywords: "time off vacation sick leave" },
  { name: "Payroll", path: "/hrms/payroll", icon: CreditCard, section: "HRMS", keywords: "salary payslip compensation" },
  { name: "My Payslips", path: "/hrms/my-payslips", icon: FileSpreadsheet, section: "HRMS", keywords: "payslip salary slip" },
  
  { name: "Holidays", path: "/hrms/holidays", icon: PartyPopper, section: "HRMS", keywords: "public holidays calendar" },
  { name: "Org Chart", path: "/hrms/org-chart", icon: GitBranch, section: "HRMS", keywords: "organization hierarchy structure" },
  { name: "CTC Components", path: "/hrms/ctc-components", icon: IndianRupee, section: "HRMS", keywords: "salary components CTC structure" },
  { name: "Manager Inbox", path: "/hrms/inbox", icon: Inbox, section: "HRMS", keywords: "approvals requests pending manager" },
  { name: "My Reimbursements", path: "/hrms/reimbursements", icon: BadgeDollarSign, section: "HRMS", keywords: "expense claims reimbursement" },

  // Performance
  { name: "Goals", path: "/performance/goals", icon: Target, section: "Performance", keywords: "objectives targets okr kpi" },
  { name: "Memos", path: "/performance/memos", icon: FileText, section: "Performance", keywords: "announcements notices communication" },

  // Admin
  { name: "Audit Log", path: "/admin/audit-log", icon: Shield, section: "Admin", keywords: "activity trail history log" },
  { name: "Approvals", path: "/admin/approvals", icon: CheckSquare, section: "Admin", keywords: "approve workflow pending requests" },
  { name: "MCP Tool Explorer", path: "/admin/mcp-tools", icon: Cpu, section: "Admin", keywords: "MCP tools AI agent ERP API model context protocol tool explorer" },

  // Connectors
  { name: "Connectors", path: "/connectors", icon: Plug, section: "Connectors", keywords: "integrations API webhooks third-party" },

  // Platform (super-admin only)
  { name: "Tenants", path: "/platform", icon: Building2, section: "Platform", keywords: "organizations tenants multi-tenant", superAdminOnly: true },
  { name: "Sandbox Lab", path: "/platform/sandbox", icon: FlaskConical, section: "Platform", keywords: "sandbox testing lab demo", superAdminOnly: true },
  { name: "DB Inspector", path: "/platform/db-inspector", icon: Database, section: "Platform", keywords: "database inspect tables schema", superAdminOnly: true },
  { name: "Platform Audit Log", path: "/platform/audit", icon: ClipboardList, section: "Platform", keywords: "platform audit log activity", superAdminOnly: true },
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
  const { data: isSuperAdmin } = useIsSuperAdmin();
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
      "/hrms/my-payslips",
      "/hrms/reimbursements",
      "/performance/goals", "/performance/memos",
    ]);

    const managerPaths = new Set([
      ...employeePaths,
      "/hrms/inbox",
    ]);

    // Finance: financial suite + limited HRMS
    const financePaths = new Set([
      "/profile", "/settings",
      "/hrms/my-attendance", "/hrms/payroll", "/hrms/org-chart",
      "/performance/goals", "/performance/memos",
    ]);

    const operationsSections = new Set(["Inventory", "Procurement", "Sales", "Manufacturing", "Warehouse"]);

    return ALL_ITEMS.filter((item) => {
      // Hide super-admin-only items unless user is super admin
      if (item.superAdminOnly && !isSuperAdmin) return false;

      // Employees: strict whitelist
      if (isEmployee) return employeePaths.has(item.path);
      // Managers: employee paths + inbox
      if (isManager) return managerPaths.has(item.path);
      // Finance: financial suite + operations + limited HRMS
      if (isFinance) return item.section === "Financial" || operationsSections.has(item.section) || financePaths.has(item.path);
      // HR: HRMS + performance + admin, no financial
      if (isHR) return item.section !== "Financial" && !operationsSections.has(item.section) && item.path !== "/";
      // Admin: everything except platform super-admin items
      if (isAdmin) return item.section !== "Platform";
      return true;
    });
  }, [currentRole, isSuperAdmin]);

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
