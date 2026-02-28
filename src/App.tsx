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

// HRMS
import Employees from "./pages/hrms/Employees";
import Attendance from "./pages/hrms/Attendance";
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

// Performance OS
import Goals from "./pages/performance/Goals";
import Memos from "./pages/performance/Memos";

// Admin
import AuditLog from "./pages/AuditLog";

// Platform (Super Admin)
import { PlatformRoute } from "@/components/auth/PlatformRoute";
import PlatformOrganizations from "./pages/platform/PlatformOrganizations";
import PlatformIntegrity from "./pages/platform/PlatformIntegrity";
import PlatformHealth from "./pages/platform/PlatformHealth";
import PlatformActions from "./pages/platform/PlatformActions";
import PlatformAudit from "./pages/platform/PlatformAudit";
import PlatformSandbox from "./pages/platform/PlatformSandbox";
import PlatformTenantDetail from "./pages/platform/PlatformTenantDetail";
import PlatformSubscriptionKeys from "./pages/platform/PlatformSubscriptionKeys";

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
                <Route path="/reset-password" element={<ResetPassword />} />

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
                <Route path="/financial/expenses" element={<Guarded><Expenses /></Guarded>} />
                <Route path="/financial/bills" element={<Guarded><FinanceRoute><Bills /></FinanceRoute></Guarded>} />
                <Route path="/financial/credit-notes" element={<Guarded><FinanceRoute><CreditNotes /></FinanceRoute></Guarded>} />
                <Route path="/financial/vendor-credits" element={<Guarded><FinanceRoute><VendorCredits /></FinanceRoute></Guarded>} />
                <Route path="/financial/banking" element={<Guarded><FinanceRoute><Banking /></FinanceRoute></Guarded>} />
                <Route path="/financial/cashflow" element={<Guarded><FinanceRoute><CashFlow /></FinanceRoute></Guarded>} />
                <Route path="/financial/analytics" element={<Guarded><FinanceRoute><Analytics /></FinanceRoute></Guarded>} />
                <Route path="/financial/assets" element={<Guarded><FinanceRoute><Assets /></FinanceRoute></Guarded>} />
                <Route path="/financial/statutory" element={<Guarded><FinanceRoute><StatutoryFilings /></FinanceRoute></Guarded>} />
                <Route path="/financial/audit-console" element={<Guarded><FinanceRoute><AuditConsole /></FinanceRoute></Guarded>} />

                {/* HRMS */}
                <Route path="/hrms/employees" element={<Guarded><Employees /></Guarded>} />
                <Route path="/hrms/attendance" element={<Guarded><HRAdminRoute><Attendance /></HRAdminRoute></Guarded>} />
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

                {/* Profile & Settings */}
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

                {/* Platform Admin (Super Admin only — exempt from subscription guard) */}
                <Route path="/platform" element={<ProtectedRoute><PlatformRoute><PlatformOrganizations /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/tenant/:orgId" element={<ProtectedRoute><PlatformRoute><PlatformTenantDetail /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/integrity" element={<ProtectedRoute><PlatformRoute><PlatformIntegrity /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/health" element={<ProtectedRoute><PlatformRoute><PlatformHealth /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/actions" element={<ProtectedRoute><PlatformRoute><PlatformActions /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/audit" element={<ProtectedRoute><PlatformRoute><PlatformAudit /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/sandbox" element={<ProtectedRoute><PlatformRoute><PlatformSandbox /></PlatformRoute></ProtectedRoute>} />
                <Route path="/platform/subscription-keys" element={<ProtectedRoute><PlatformRoute><PlatformSubscriptionKeys /></PlatformRoute></ProtectedRoute>} />

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
