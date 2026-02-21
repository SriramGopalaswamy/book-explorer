import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { DevModeProvider } from "@/contexts/DevModeContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { FinanceRoute } from "@/components/auth/FinanceRoute";
import { AIChatAssistant } from "@/components/ai/AIChatAssistant";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

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

// HRMS
import Employees from "./pages/hrms/Employees";
import Attendance from "./pages/hrms/Attendance";
import Leaves from "./pages/hrms/Leaves";
import Payroll from "./pages/hrms/Payroll";
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

// Profile
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <AppModeProvider>
          <DevModeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  {/* Public routes */}
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* Protected routes */}
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />

                  {/* Financial Suite */}
                  <Route path="/financial/accounting" element={<ProtectedRoute><FinanceRoute><Accounting /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/customers" element={<ProtectedRoute><FinanceRoute><Customers /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/vendors" element={<ProtectedRoute><FinanceRoute><Vendors /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/invoicing" element={<ProtectedRoute><FinanceRoute><Invoicing /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/invoice-settings" element={<ProtectedRoute><FinanceRoute><InvoiceSettings /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/quotes" element={<ProtectedRoute><FinanceRoute><Quotes /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/expenses" element={<ProtectedRoute><FinanceRoute><Expenses /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/bills" element={<ProtectedRoute><FinanceRoute><Bills /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/credit-notes" element={<ProtectedRoute><FinanceRoute><CreditNotes /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/vendor-credits" element={<ProtectedRoute><FinanceRoute><VendorCredits /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/banking" element={<ProtectedRoute><FinanceRoute><Banking /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/cashflow" element={<ProtectedRoute><FinanceRoute><CashFlow /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/analytics" element={<ProtectedRoute><FinanceRoute><Analytics /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/assets" element={<ProtectedRoute><FinanceRoute><Assets /></FinanceRoute></ProtectedRoute>} />
                  <Route path="/financial/statutory" element={<ProtectedRoute><FinanceRoute><StatutoryFilings /></FinanceRoute></ProtectedRoute>} />

                  {/* HRMS */}
                  <Route path="/hrms/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
                  <Route path="/hrms/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
                  <Route path="/hrms/leaves" element={<ProtectedRoute><Leaves /></ProtectedRoute>} />
                  <Route path="/hrms/payroll" element={<ProtectedRoute><Payroll /></ProtectedRoute>} />
                  <Route path="/hrms/holidays" element={<ProtectedRoute><Holidays /></ProtectedRoute>} />
                  <Route path="/hrms/org-chart" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
                  <Route path="/hrms/my-attendance" element={<ProtectedRoute><MyAttendance /></ProtectedRoute>} />
                  <Route path="/hrms/inbox" element={<ProtectedRoute><ManagerInbox /></ProtectedRoute>} />
                  <Route path="/hrms/reimbursements" element={<ProtectedRoute><Reimbursements /></ProtectedRoute>} />
                  <Route path="/financial/reimbursements" element={<ProtectedRoute><FinanceRoute><ReimbursementsFinance /></FinanceRoute></ProtectedRoute>} />

                  {/* Performance OS */}
                  <Route path="/performance/goals" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
                  <Route path="/performance/memos" element={<ProtectedRoute><Memos /></ProtectedRoute>} />

                  {/* Admin */}
                  <Route path="/admin/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />

                  {/* Profile & Settings */}
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

                  {/* Platform Admin (Super Admin only) */}
                  <Route path="/platform" element={<ProtectedRoute><PlatformRoute><PlatformOrganizations /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/integrity" element={<ProtectedRoute><PlatformRoute><PlatformIntegrity /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/health" element={<ProtectedRoute><PlatformRoute><PlatformHealth /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/actions" element={<ProtectedRoute><PlatformRoute><PlatformActions /></PlatformRoute></ProtectedRoute>} />
                  <Route path="/platform/audit" element={<ProtectedRoute><PlatformRoute><PlatformAudit /></PlatformRoute></ProtectedRoute>} />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <AIChatAssistant />
              </BrowserRouter>
            </TooltipProvider>
          </DevModeProvider>
        </AppModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
