import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { SessionTrackerProvider } from "@/components/auth/SessionTrackerProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SubscriptionGuard } from "@/components/auth/SubscriptionGuard";
import { FinanceRoute } from "@/components/auth/FinanceRoute";
import { HRAdminRoute } from "@/components/auth/HRAdminRoute";
import { ManagerRoute } from "@/components/auth/ManagerRoute";
import { PayrollRoute } from "@/components/auth/PayrollRoute";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

// Lazy-loaded page components — reduces initial bundle by ~80%
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const SubscriptionActivate = lazy(() => import("./pages/subscription/SubscriptionActivate"));
const Onboarding = lazy(() => import("./pages/onboarding/Onboarding"));

const Accounting = lazy(() => import("./pages/financial/Accounting"));
const Invoicing = lazy(() => import("./pages/financial/Invoicing"));
const InvoiceSettings = lazy(() => import("./pages/financial/InvoiceSettings"));
const Banking = lazy(() => import("./pages/financial/Banking"));
const CashFlow = lazy(() => import("./pages/financial/CashFlow"));
const Analytics = lazy(() => import("./pages/financial/Analytics"));
const Customers = lazy(() => import("./pages/financial/Customers"));
const Vendors = lazy(() => import("./pages/financial/Vendors"));
const Quotes = lazy(() => import("./pages/financial/Quotes"));
const Expenses = lazy(() => import("./pages/financial/Expenses"));
const CreditNotes = lazy(() => import("./pages/financial/CreditNotes"));
const VendorCredits = lazy(() => import("./pages/financial/VendorCredits"));
const Bills = lazy(() => import("./pages/financial/Bills"));
const Assets = lazy(() => import("./pages/financial/Assets"));
const StatutoryFilings = lazy(() => import("./pages/financial/StatutoryFilings"));
const AuditConsole = lazy(() => import("./pages/financial/AuditConsole"));
const JournalEntry = lazy(() => import("./pages/financial/JournalEntry"));
const LedgerExplorer = lazy(() => import("./pages/financial/LedgerExplorer"));
const CADashboard = lazy(() => import("./pages/financial/CADashboard"));
const EwayBills = lazy(() => import("./pages/financial/EwayBills"));
const EInvoices = lazy(() => import("./pages/financial/EInvoices"));

const Employees = lazy(() => import("./pages/hrms/Employees"));
const Attendance = lazy(() => import("./pages/hrms/Attendance"));
const AttendanceImport = lazy(() => import("./pages/hrms/AttendanceImport"));
const Leaves = lazy(() => import("./pages/hrms/Leaves"));
const Payroll = lazy(() => import("./pages/hrms/Payroll"));
const CTCComponents = lazy(() => import("./pages/hrms/CTCComponents"));
const MyPayslips = lazy(() => import("./pages/hrms/MyPayslips"));
const Holidays = lazy(() => import("./pages/hrms/Holidays"));
const OrgChart = lazy(() => import("./pages/hrms/OrgChart"));
const MyAttendance = lazy(() => import("./pages/hrms/MyAttendance"));
const ManagerInbox = lazy(() => import("./pages/hrms/ManagerInbox"));
const Reimbursements = lazy(() => import("./pages/hrms/Reimbursements"));

const ReimbursementsFinance = lazy(() => import("./pages/financial/ReimbursementsFinance"));
const AutomationDashboard = lazy(() => import("./pages/financial/AutomationDashboard"));

const Goals = lazy(() => import("./pages/performance/Goals"));
const Memos = lazy(() => import("./pages/performance/Memos"));

const AuditLog = lazy(() => import("./pages/AuditLog"));

import { PlatformRoute } from "@/components/auth/PlatformRoute";
const PlatformTenants = lazy(() => import("./pages/platform/PlatformTenants"));
const PlatformTenantDetail = lazy(() => import("./pages/platform/PlatformTenantDetail"));
const PlatformSandboxLab = lazy(() => import("./pages/platform/PlatformSandboxLab"));
const PlatformAudit = lazy(() => import("./pages/platform/PlatformAudit"));
const PlatformDbInspector = lazy(() => import("./pages/platform/PlatformDbInspector"));

const SandboxJoin = lazy(() => import("./pages/sandbox/SandboxJoin"));

const Items = lazy(() => import("./pages/inventory/Items"));
const InventoryWarehouses = lazy(() => import("./pages/inventory/Warehouses"));
const StockLedger = lazy(() => import("./pages/inventory/StockLedger"));
const StockAdjustments = lazy(() => import("./pages/inventory/StockAdjustments"));

const PurchaseOrders = lazy(() => import("./pages/procurement/PurchaseOrders"));
const GoodsReceipts = lazy(() => import("./pages/procurement/GoodsReceipts"));

const SalesOrders = lazy(() => import("./pages/sales/SalesOrders"));
const DeliveryNotes = lazy(() => import("./pages/sales/DeliveryNotes"));
const SalesReturnsPage = lazy(() => import("./pages/sales/SalesReturns"));

const BillOfMaterials = lazy(() => import("./pages/manufacturing/BillOfMaterials"));
const WorkOrdersPage = lazy(() => import("./pages/manufacturing/WorkOrders"));
const MaterialConsumption = lazy(() => import("./pages/manufacturing/MaterialConsumption"));
const FinishedGoods = lazy(() => import("./pages/manufacturing/FinishedGoods"));

const BinLocationsPage = lazy(() => import("./pages/warehouse/BinLocations"));
const StockTransfersPage = lazy(() => import("./pages/warehouse/StockTransfers"));
const PickingListsPage = lazy(() => import("./pages/warehouse/PickingLists"));
const InventoryCountsPage = lazy(() => import("./pages/warehouse/InventoryCounts"));

const PaymentReceipts = lazy(() => import("./pages/financial/PaymentReceipts"));
const VendorPaymentsPage = lazy(() => import("./pages/financial/VendorPayments"));
const PurchaseReturnsPage = lazy(() => import("./pages/procurement/PurchaseReturns"));
const ApprovalWorkflowsPage = lazy(() => import("./pages/admin/ApprovalWorkflows"));
const MCPToolExplorer = lazy(() => import("./pages/admin/MCPToolExplorer"));
const ExchangeRatesPage = lazy(() => import("./pages/financial/ExchangeRates"));
const RecurringTransactionsPage = lazy(() => import("./pages/financial/RecurringTransactions"));

const Connectors = lazy(() => import("./pages/connectors/Connectors"));
const ConnectorDetail = lazy(() => import("./pages/connectors/ConnectorDetail"));

const Profile = lazy(() => import("./pages/Profile"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

/** Global suspense fallback */
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/** Shorthand: ProtectedRoute + SubscriptionGuard */
function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <SubscriptionGuard>{children}</SubscriptionGuard>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <SessionTrackerProvider />
        <SubscriptionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/pending-approval" element={<PendingApproval />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/sandbox/join/:token" element={<ProtectedRoute><SandboxJoin /></ProtectedRoute>} />

                  {/* Subscription & Onboarding (protected but exempt from subscription guard) */}
                  <Route path="/subscription/activate" element={<ProtectedRoute><SubscriptionActivate /></ProtectedRoute>} />
                  <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

                  {/* Protected + Subscription-guarded routes */}
                  <Route path="/" element={<Guarded><Index /></Guarded>} />

                  {/* Financial Suite */}
                  <Route path="/financial/accounting" element={<Guarded><FinanceRoute><Accounting /></FinanceRoute></Guarded>} />
                  <Route path="/financial/customers" element={<Guarded><FinanceRoute><Customers /></FinanceRoute></Guarded>} />
                  <Route path="/financial/vendors" element={<Guarded><FinanceRoute><Vendors /></FinanceRoute></Guarded>} />
                  <Route path="/financial/invoicing" element={<Guarded><FinanceRoute><Invoicing /></FinanceRoute></Guarded>} />
                  <Route path="/financial/invoice-settings" element={<Guarded><FinanceRoute><InvoiceSettings /></FinanceRoute></Guarded>} />
                  <Route path="/financial/quotes" element={<Guarded><FinanceRoute><Quotes /></FinanceRoute></Guarded>} />
                  <Route path="/financial/expenses" element={<Guarded><FinanceRoute><Expenses /></FinanceRoute></Guarded>} />
                  <Route path="/financial/bills" element={<Guarded><FinanceRoute><Bills /></FinanceRoute></Guarded>} />
                  <Route path="/financial/credit-notes" element={<Guarded><FinanceRoute><CreditNotes /></FinanceRoute></Guarded>} />
                  <Route path="/financial/vendor-credits" element={<Guarded><FinanceRoute><VendorCredits /></FinanceRoute></Guarded>} />
                  <Route path="/financial/banking" element={<Guarded><FinanceRoute><Banking /></FinanceRoute></Guarded>} />
                  <Route path="/financial/cashflow" element={<Guarded><FinanceRoute><CashFlow /></FinanceRoute></Guarded>} />
                  <Route path="/financial/analytics" element={<Guarded><FinanceRoute><Analytics /></FinanceRoute></Guarded>} />
                  <Route path="/financial/assets" element={<Guarded><FinanceRoute><Assets /></FinanceRoute></Guarded>} />
                  <Route path="/financial/statutory" element={<Guarded><FinanceRoute><StatutoryFilings /></FinanceRoute></Guarded>} />
                  <Route path="/financial/audit-console" element={<Guarded><FinanceRoute><AuditConsole /></FinanceRoute></Guarded>} />
                  <Route path="/financial/journal-entry" element={<Guarded><FinanceRoute><JournalEntry /></FinanceRoute></Guarded>} />
                  <Route path="/financial/ledger" element={<Guarded><FinanceRoute><LedgerExplorer /></FinanceRoute></Guarded>} />
                  <Route path="/financial/ca-dashboard" element={<Guarded><FinanceRoute><CADashboard /></FinanceRoute></Guarded>} />
                  <Route path="/financial/payment-receipts" element={<Guarded><FinanceRoute><PaymentReceipts /></FinanceRoute></Guarded>} />
                  <Route path="/financial/vendor-payments" element={<Guarded><FinanceRoute><VendorPaymentsPage /></FinanceRoute></Guarded>} />
                  <Route path="/financial/exchange-rates" element={<Guarded><FinanceRoute><ExchangeRatesPage /></FinanceRoute></Guarded>} />
                  <Route path="/financial/eway-bills" element={<Guarded><FinanceRoute><EwayBills /></FinanceRoute></Guarded>} />
                  <Route path="/financial/e-invoices" element={<Guarded><FinanceRoute><EInvoices /></FinanceRoute></Guarded>} />
                  <Route path="/financial/recurring" element={<Guarded><FinanceRoute><RecurringTransactionsPage /></FinanceRoute></Guarded>} />
                  <Route path="/financial/automation" element={<Guarded><FinanceRoute><AutomationDashboard /></FinanceRoute></Guarded>} />

                  {/* Inventory */}
                  <Route path="/inventory/items" element={<Guarded><FinanceRoute><Items /></FinanceRoute></Guarded>} />
                  <Route path="/inventory/warehouses" element={<Guarded><FinanceRoute><InventoryWarehouses /></FinanceRoute></Guarded>} />
                  <Route path="/inventory/stock-ledger" element={<Guarded><FinanceRoute><StockLedger /></FinanceRoute></Guarded>} />
                  <Route path="/inventory/adjustments" element={<Guarded><FinanceRoute><StockAdjustments /></FinanceRoute></Guarded>} />

                  {/* Procurement */}
                  <Route path="/procurement/purchase-orders" element={<Guarded><FinanceRoute><PurchaseOrders /></FinanceRoute></Guarded>} />
                  <Route path="/procurement/goods-receipts" element={<Guarded><FinanceRoute><GoodsReceipts /></FinanceRoute></Guarded>} />
                  <Route path="/procurement/returns" element={<Guarded><FinanceRoute><PurchaseReturnsPage /></FinanceRoute></Guarded>} />

                  {/* Sales */}
                  <Route path="/sales/orders" element={<Guarded><FinanceRoute><SalesOrders /></FinanceRoute></Guarded>} />
                  <Route path="/sales/deliveries" element={<Guarded><FinanceRoute><DeliveryNotes /></FinanceRoute></Guarded>} />
                  <Route path="/sales/returns" element={<Guarded><FinanceRoute><SalesReturnsPage /></FinanceRoute></Guarded>} />

                  {/* Manufacturing */}
                  <Route path="/manufacturing/bom" element={<Guarded><FinanceRoute><BillOfMaterials /></FinanceRoute></Guarded>} />
                  <Route path="/manufacturing/work-orders" element={<Guarded><FinanceRoute><WorkOrdersPage /></FinanceRoute></Guarded>} />
                  <Route path="/manufacturing/consumption" element={<Guarded><FinanceRoute><MaterialConsumption /></FinanceRoute></Guarded>} />
                  <Route path="/manufacturing/finished-goods" element={<Guarded><FinanceRoute><FinishedGoods /></FinanceRoute></Guarded>} />

                  {/* Warehouse */}
                  <Route path="/warehouse/bins" element={<Guarded><FinanceRoute><BinLocationsPage /></FinanceRoute></Guarded>} />
                  <Route path="/warehouse/transfers" element={<Guarded><FinanceRoute><StockTransfersPage /></FinanceRoute></Guarded>} />
                  <Route path="/warehouse/picking" element={<Guarded><FinanceRoute><PickingListsPage /></FinanceRoute></Guarded>} />
                  <Route path="/warehouse/counts" element={<Guarded><FinanceRoute><InventoryCountsPage /></FinanceRoute></Guarded>} />

                  {/* HRMS */}
                  <Route path="/hrms/employees" element={<Guarded><Employees /></Guarded>} />
                  <Route path="/hrms/attendance" element={<Guarded><HRAdminRoute><Attendance /></HRAdminRoute></Guarded>} />
                  <Route path="/hrms/attendance-import" element={<Guarded><HRAdminRoute><AttendanceImport /></HRAdminRoute></Guarded>} />
                  <Route path="/hrms/leaves" element={<Guarded><Leaves /></Guarded>} />
                  <Route path="/hrms/payroll" element={<Guarded><PayrollRoute><Payroll /></PayrollRoute></Guarded>} />
                  <Route path="/hrms/ctc-components" element={<Guarded><FinanceRoute><CTCComponents /></FinanceRoute></Guarded>} />
                  <Route path="/hrms/my-payslips" element={<Guarded><MyPayslips /></Guarded>} />
                  <Route path="/hrms/holidays" element={<Guarded><HRAdminRoute><Holidays /></HRAdminRoute></Guarded>} />
                  <Route path="/hrms/org-chart" element={<Guarded><OrgChart /></Guarded>} />
                  <Route path="/hrms/my-attendance" element={<Guarded><MyAttendance /></Guarded>} />
                  <Route path="/hrms/inbox" element={<Guarded><ManagerRoute><ManagerInbox /></ManagerRoute></Guarded>} />
                  <Route path="/hrms/reimbursements" element={<Guarded><Reimbursements /></Guarded>} />
                  
                  <Route path="/financial/reimbursements" element={<Guarded><FinanceRoute><ReimbursementsFinance /></FinanceRoute></Guarded>} />

                  {/* Performance OS */}
                  <Route path="/performance/goals" element={<Guarded><Goals /></Guarded>} />
                  <Route path="/performance/memos" element={<Guarded><Memos /></Guarded>} />

                  {/* Admin */}
                  <Route path="/admin/audit-log" element={<Guarded><HRAdminRoute><AuditLog /></HRAdminRoute></Guarded>} />
                  <Route path="/admin/approvals" element={<Guarded><HRAdminRoute><ApprovalWorkflowsPage /></HRAdminRoute></Guarded>} />
                  <Route path="/admin/mcp-tools" element={<Guarded><HRAdminRoute><MCPToolExplorer /></HRAdminRoute></Guarded>} />

                  {/* Connectors */}
                  <Route path="/connectors" element={<Guarded><FinanceRoute><Connectors /></FinanceRoute></Guarded>} />
                  <Route path="/connectors/:provider" element={<Guarded><FinanceRoute><ConnectorDetail /></FinanceRoute></Guarded>} />

                  {/* Profile & Settings */}
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

                  {/* Platform Admin (Super Admin only — exempt from subscription guard) */}
                  <Route path="/platform" element={<ProtectedRoute><PlatformRoute><PlatformTenants /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/tenant/:orgId" element={<ProtectedRoute><PlatformRoute><PlatformTenantDetail /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/sandbox" element={<ProtectedRoute><PlatformRoute><PlatformSandboxLab /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/audit" element={<ProtectedRoute><PlatformRoute><PlatformAudit /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/db-inspector" element={<ProtectedRoute><PlatformRoute><PlatformDbInspector /></PlatformRoute></ProtectedRoute>} />

                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
