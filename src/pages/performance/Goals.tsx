import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const goals = [
  {
    id: 1,
    title: "Q1 Revenue Target",
    description: "Achieve ₹50L in quarterly revenue",
    progress: 85,
    status: "on_track",
    dueDate: "2024-03-31",
    owner: "Sales Team",
    category: "Revenue",
  },
  {
    id: 2,
    title: "Customer Acquisition",
    description: "Onboard 50 new enterprise clients",
    progress: 60,
    status: "on_track",
    dueDate: "2024-06-30",
    owner: "Business Development",
    category: "Growth",
  },
  {
    id: 3,
    title: "Product Launch",
    description: "Launch mobile app v2.0",
    progress: 100,
    status: "completed",
    dueDate: "2024-01-15",
    owner: "Product Team",
    category: "Product",
  },
  {
    id: 4,
    title: "Employee Training Program",
    description: "Complete skill development for 100% employees",
    progress: 45,
    status: "at_risk",
    dueDate: "2024-02-28",
    owner: "HR Team",
    category: "People",
  },
  {
    id: 5,
    title: "Cost Optimization",
    description: "Reduce operational costs by 15%",
    progress: 70,
    status: "on_track",
    dueDate: "2024-04-30",
    owner: "Finance Team",
    category: "Operations",
  },
];

const statusConfig = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "bg-success/10 text-success border-success/30",
  },
  on_track: {
    label: "On Track",
    icon: TrendingUp,
    color: "bg-info/10 text-info border-info/30",
  },
  at_risk: {
    label: "At Risk",
    icon: AlertCircle,
    color: "bg-warning/10 text-warning border-warning/30",
  },
  delayed: {
    label: "Delayed",
    icon: Clock,
    color: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

export default function Goals() {
  return (
    <MainLayout
      title="Goals"
      subtitle="Track and manage organizational objectives"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Goals"
            value="42"
            icon={<Target className="h-4 w-4" />}
          />
          <StatCard
            title="Completed"
            value="18"
            change={{ value: "4", type: "increase" }}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatCard
            title="On Track"
            value="19"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            title="At Risk"
            value="5"
            icon={<AlertCircle className="h-4 w-4" />}
          />
        </div>

        {/* Goals List */}
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Active Goals
              </h3>
              <p className="text-sm text-muted-foreground">
                Monitor progress across all departments
              </p>
            </div>
            <Button className="bg-gradient-performance text-foreground hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Create Goal
            </Button>
          </div>

          <div className="divide-y">
            {goals.map((goal) => {
              const status = statusConfig[goal.status as keyof typeof statusConfig];
              const StatusIcon = status.icon;

              return (
                <div
                  key={goal.id}
                  className="flex flex-col gap-4 p-6 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h4 className="font-medium text-foreground">
                        {goal.title}
                      </h4>
                      <Badge variant="outline" className={cn("text-xs", status.color)}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {goal.description}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{goal.owner}</span>
                      <span>•</span>
                      <span>
                        Due {new Date(goal.dueDate).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <Badge variant="secondary" className="text-xs">
                        {goal.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{goal.progress}%</span>
                      </div>
                      <Progress
                        value={goal.progress}
                        className={cn(
                          "h-2",
                          goal.status === "completed" && "[&>div]:bg-success",
                          goal.status === "at_risk" && "[&>div]:bg-warning",
                          goal.status === "on_track" && "[&>div]:bg-performance"
                        )}
                      />
                    </div>
                    <Button variant="ghost" size="sm">
                      View Details
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
