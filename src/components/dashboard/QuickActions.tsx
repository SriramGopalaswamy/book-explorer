import { Link } from "react-router-dom";
import {
  Plus,
  FileText,
  Users,
  Target,
  CreditCard,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { label: "New Invoice", icon: FileText, path: "/financial/invoicing/new", color: "bg-financial" },
  { label: "Add Employee", icon: Users, path: "/hrms/employees/new", color: "bg-hrms" },
  { label: "Create Goal", icon: Target, path: "/performance/goals/new", color: "bg-performance" },
  { label: "Process Payroll", icon: CreditCard, path: "/hrms/payroll", color: "bg-financial" },
  { label: "Request Leave", icon: Calendar, path: "/hrms/leaves/request", color: "bg-hrms" },
];

export function QuickActions() {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-card">
      <h3 className="mb-4 text-lg font-semibold text-foreground">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {actions.map((action) => (
          <Link key={action.label} to={action.path}>
            <Button
              variant="outline"
              className="h-auto w-full flex-col gap-2 py-4 hover:border-primary hover:bg-secondary"
            >
              <div className={`rounded-lg p-2 ${action.color} text-white`}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium">{action.label}</span>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
