import { FileText, Users, Target, CreditCard, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  {
    id: 1,
    type: "invoice",
    title: "Invoice #INV-2024-0089 created",
    description: "Client: Acme Corp",
    time: "2 hours ago",
    icon: FileText,
    iconBg: "bg-financial-light text-financial",
  },
  {
    id: 2,
    type: "employee",
    title: "New employee onboarded",
    description: "Rahul Sharma - Software Engineer",
    time: "4 hours ago",
    icon: Users,
    iconBg: "bg-hrms-light text-hrms",
  },
  {
    id: 3,
    type: "goal",
    title: "Q1 Sales Target completed",
    description: "Achieved 125% of target",
    time: "1 day ago",
    icon: Target,
    iconBg: "bg-performance-light text-performance",
  },
  {
    id: 4,
    type: "payroll",
    title: "January payroll processed",
    description: "45 employees • ₹24,50,000",
    time: "2 days ago",
    icon: CreditCard,
    iconBg: "bg-financial-light text-financial",
  },
  {
    id: 5,
    type: "leave",
    title: "Leave request approved",
    description: "Priya Patel - 3 days annual leave",
    time: "3 days ago",
    icon: Check,
    iconBg: "bg-success/10 text-success",
  },
];

export function RecentActivity() {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
        <button className="text-sm font-medium text-muted-foreground hover:text-foreground">
          View all
        </button>
      </div>
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className={cn(
              "flex items-start gap-4 pb-4",
              index !== activities.length - 1 && "border-b"
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                activity.iconBg
              )}
            >
              <activity.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {activity.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {activity.description}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {activity.time}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
