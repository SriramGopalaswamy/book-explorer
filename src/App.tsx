import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Financial Suite
import Accounting from "./pages/financial/Accounting";

// HRMS
import Employees from "./pages/hrms/Employees";

// Performance OS
import Goals from "./pages/performance/Goals";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          
          {/* Financial Suite */}
          <Route path="/financial/accounting" element={<Accounting />} />
          <Route path="/financial/invoicing" element={<Accounting />} />
          <Route path="/financial/banking" element={<Accounting />} />
          <Route path="/financial/cashflow" element={<Accounting />} />
          
          {/* HRMS */}
          <Route path="/hrms/employees" element={<Employees />} />
          <Route path="/hrms/attendance" element={<Employees />} />
          <Route path="/hrms/leaves" element={<Employees />} />
          <Route path="/hrms/payroll" element={<Employees />} />
          
          {/* Performance OS */}
          <Route path="/performance/goals" element={<Goals />} />
          <Route path="/performance/memos" element={<Goals />} />
          
          {/* Settings */}
          <Route path="/settings" element={<Index />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
