import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Financial Suite
import Accounting from "./pages/financial/Accounting";
import Invoicing from "./pages/financial/Invoicing";

// HRMS
import Employees from "./pages/hrms/Employees";

// Performance OS
import Goals from "./pages/performance/Goals";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/auth" element={<Auth />} />
            
            {/* Protected routes */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            
            {/* Financial Suite */}
            <Route path="/financial/accounting" element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
            <Route path="/financial/invoicing" element={<ProtectedRoute><Invoicing /></ProtectedRoute>} />
            <Route path="/financial/banking" element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
            <Route path="/financial/cashflow" element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
            
            {/* HRMS */}
            <Route path="/hrms/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
            <Route path="/hrms/attendance" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
            <Route path="/hrms/leaves" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
            <Route path="/hrms/payroll" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
            
            {/* Performance OS */}
            <Route path="/performance/goals" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
            <Route path="/performance/memos" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
            
            {/* Settings */}
            <Route path="/settings" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
