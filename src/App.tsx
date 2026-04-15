import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SubscriptionGuard } from "@/components/auth/SubscriptionGuard";
import { FinanceRoute } from "@/components/auth/FinanceRoute";
import { HRAdminRoute } from "@/components/auth/HRAdminRoute";
import { ManagerRoute } from "@/components/auth/ManagerRoute";
import { PayrollRoute } from "@/components/auth/PayrollRoute";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import PendingApproval from "./pages/PendingApproval";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Subscription & Onboarding
import SubscriptionActivate from "./pages/subscription/SubscriptionActivate";
import Onboarding from "./pages/onboarding/Onboarding";

// Financial Suite
import Accounting from "./pages/financial/Accounting";
import Invoicing from "./pages/financial/Invoicing";
import InvoiceSettings from "./pages/financial/InvoiceSettings";
import Banking from "./pages/financial/Banking";
import CashFlow from "./pages/financial/CashFlow";
import Analytics from "./pages/financial/Analytics";
import Customers from "./pages/financial/Customers";
import Vendors from "./pages/financial/Vendors";
import Quotes from "./pages/financial/Quotes";
import Expenses from "./pages/financial/Expenses";
import CreditNotes from "./pages/financial/CreditNotes";
import VendorCredits from "./pages/financial/VendorCredits";
import Bills from "./pages/financial/Bills";
import Assets from "./pages/financial/Assets";
import StatutoryFilings from "./pages/financial/StatutoryFilings";
import AuditConsole from "./pages/financial/AuditConsole";
import JournalEntry from "./pages/financial/JournalEntry";
import LedgerExplorer from "./pages/financial/LedgerExplorer";
import CADashboard from "./pages/financial/CADashboard";
import EwayBills from "./pages/financial/EwayBills";
import EInvoices from "./pages/financial/EInvoices";

// HRMS
import Employees from "./pages/hrms/Employees";
import Attendance from "./pages/hrms/Attendance";
import AttendanceImport from "./pages/hrms/AttendanceImport";
import Leaves from "./pages/hrms/Leaves";
import Payroll from "./pages/hrms/Payroll";
import CTCComponents from "./pages/hrms/CTCComponents";
import MyPayslips from "./pages/hrms/MyPayslips";
import Holidays from "./pages/hrms/Holidays";
import OrgChart from "./pages/hrms/OrgChart";
import MyAttendance from "./pages/hrms/MyAttendance";
import ManagerInbox from "./pages/hrms/ManagerInbox";
import Reimbursements from "./pages/hrms/Reimbursements";

import ReimbursementsFinance from "./pages/financial/ReimbursementsFinance";
import AutomationDashboard from "./pages/financial/AutomationDashboard";

// Performance OS
import Goals from "./pages/performance/Goals";
import Memos from "./pages/performance/Memos";

// Admin
import AuditLog from "./pages/AuditLog";

// Platform (Super Admin)
import { PlatformRoute } from "@/components/auth/PlatformRoute";
import PlatformTenants from "./pages/platform/PlatformTenants";
import PlatformTenantDetail from "./pages/platform/PlatformTenantDetail";
import PlatformSandboxLab from "./pages/platform/PlatformSandboxLab";
import PlatformAudit from "./pages/platform/PlatformAudit";
import PlatformDbInspector from "./pages/platform/PlatformDbInspector";

// Sandbox
import SandboxJoin from "./pages/sandbox/SandboxJoin";

// Inventory
import Items from "./pages/inventory/Items";
import InventoryWarehouses from "./pages/inventory/Warehouses";
import StockLedger from "./pages/inventory/StockLedger";
import StockAdjustments from "./pages/inventory/StockAdjustments";

// Procurement
import PurchaseOrders from "./pages/procurement/PurchaseOrders";
import GoodsReceipts from "./pages/procurement/GoodsReceipts";

// Sales
import SalesOrders from "./pages/sales/SalesOrders";
import DeliveryNotes from "./pages/sales/DeliveryNotes";
import SalesReturnsPage from "./pages/sales/SalesReturns";

// Manufacturing
import BillOfMaterials from "./pages/manufacturing/BillOfMaterials";
import WorkOrdersPage from "./pages/manufacturing/WorkOrders";
import MaterialConsumption from "./pages/manufacturing/MaterialConsumption";
import FinishedGoods from "./pages/manufacturing/FinishedGoods";

// Warehouse
import BinLocationsPage from "./pages/warehouse/BinLocations";
import StockTransfersPage from "./pages/warehouse/StockTransfers";
import PickingListsPage from "./pages/warehouse/PickingLists";
import InventoryCountsPage from "./pages/warehouse/InventoryCounts";

// Payments & Returns
import PaymentReceipts from "./pages/financial/PaymentReceipts";
import VendorPaymentsPage from "./pages/financial/VendorPayments";
import PurchaseReturnsPage from "./pages/procurement/PurchaseReturns";
import ApprovalWorkflowsPage from "./pages/admin/ApprovalWorkflows";
import MCPToolExplorer from "./pages/admin/MCPToolExplorer";
import ExchangeRatesPage from "./pages/financial/ExchangeRates";
import RecurringTransactionsPage from "./pages/financial/RecurringTransactions";

// Connectors
import Connectors from "./pages/connectors/Connectors";
import ConnectorDetail from "./pages/connectors/ConnectorDetail";

// Profile
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

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
        <SubscriptionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
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

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              
            </BrowserRouter>
          </TooltipProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
