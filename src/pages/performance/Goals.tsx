import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useGoals, useGoalStats, useCreateGoal, useUpdateGoal, useDeleteGoal, type Goal } from "@/hooks/useGoals";

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");

  const { data: goals = [], isLoading } = useGoals();
  const { data: stats } = useGoalStats();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const handleCreateGoal = async () => {
    if (!title) return;
    
    await createGoal.mutateAsync({
      title,
      description,
      category,
      owner,
      due_date: dueDate || undefined,
    });
    
    setIsDialogOpen(false);
    setTitle("");
    setDescription("");
    setCategory("general");
    setOwner("");
    setDueDate("");
  };

  const handleUpdateProgress = async (goal: Goal, newProgress: number) => {
    await updateGoal.mutateAsync({
      id: goal.id,
      progress: newProgress,
      status: newProgress >= 100 ? "completed" : goal.status,
    });
  };

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
            value={String(stats?.total || 0)}
            icon={<Target className="h-4 w-4" />}
          />
          <StatCard
            title="Completed"
            value={String(stats?.completed || 0)}
            change={stats?.completed ? { value: String(stats.completed), type: "increase" } : undefined}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatCard
            title="On Track"
            value={String(stats?.onTrack || 0)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            title="At Risk"
            value={String(stats?.atRisk || 0)}
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
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-performance text-foreground hover:opacity-90">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Goal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Goal</DialogTitle>
                  <DialogDescription>Set a new objective for your team</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Title</Label>
                    <Input 
                      placeholder="Enter goal title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Description</Label>
                    <Textarea 
                      placeholder="Describe the goal"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="revenue">Revenue</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="people">People</SelectItem>
                          <SelectItem value="operations">Operations</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Due Date</Label>
                      <Input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Owner</Label>
                    <Input 
                      placeholder="Team or person responsible"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleCreateGoal}
                    disabled={createGoal.isPending || !title}
                  >
                    {createGoal.isPending ? "Creating..." : "Create Goal"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="divide-y">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-6">
                  <Skeleton className="h-20 w-full" />
                </div>
              ))
            ) : goals.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No goals yet. Create your first goal to get started.
              </div>
            ) : (
              goals.map((goal) => {
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
                      {goal.description && (
                        <p className="text-sm text-muted-foreground">
                          {goal.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        {goal.owner && <span>{goal.owner}</span>}
                        {goal.owner && goal.due_date && <span>•</span>}
                        {goal.due_date && (
                          <span>
                            Due {format(new Date(goal.due_date), "MMM d, yyyy")}
                          </span>
                        )}
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
                            "h-2 cursor-pointer",
                            goal.status === "completed" && "[&>div]:bg-success",
                            goal.status === "at_risk" && "[&>div]:bg-warning",
                            goal.status === "on_track" && "[&>div]:bg-performance"
                          )}
                          onClick={() => {
                            const newProgress = Math.min(goal.progress + 10, 100);
                            handleUpdateProgress(goal, newProgress);
                          }}
                        />
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteGoal.mutate(goal.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}