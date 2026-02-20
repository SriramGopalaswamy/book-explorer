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
                  <Route path="/financial/accounting" element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
                  <Route path="/financial/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
                  <Route path="/financial/vendors" element={<ProtectedRoute><Vendors /></ProtectedRoute>} />
                  <Route path="/financial/invoicing" element={<ProtectedRoute><Invoicing /></ProtectedRoute>} />
                  <Route path="/financial/invoice-settings" element={<ProtectedRoute><InvoiceSettings /></ProtectedRoute>} />
                  <Route path="/financial/quotes" element={<ProtectedRoute><Quotes /></ProtectedRoute>} />
                  <Route path="/financial/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
                  <Route path="/financial/bills" element={<ProtectedRoute><Bills /></ProtectedRoute>} />
                  <Route path="/financial/credit-notes" element={<ProtectedRoute><CreditNotes /></ProtectedRoute>} />
                  <Route path="/financial/vendor-credits" element={<ProtectedRoute><VendorCredits /></ProtectedRoute>} />
                  <Route path="/financial/banking" element={<ProtectedRoute><Banking /></ProtectedRoute>} />
                  <Route path="/financial/cashflow" element={<ProtectedRoute><CashFlow /></ProtectedRoute>} />
                  <Route path="/financial/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />

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
                  <Route path="/financial/reimbursements" element={<ProtectedRoute><ReimbursementsFinance /></ProtectedRoute>} />

                  {/* Performance OS */}
                  <Route path="/performance/goals" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
                  <Route path="/performance/memos" element={<ProtectedRoute><Memos /></ProtectedRoute>} />

                  {/* Admin */}
                  <Route path="/admin/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />

                  {/* Profile & Settings */}
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </DevModeProvider>
        </AppModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
