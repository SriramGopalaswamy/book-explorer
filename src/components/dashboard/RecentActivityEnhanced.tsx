import { motion } from "framer-motion";
import { FileText, Users, Target, CreditCard, Check, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  {
    id: 1,
    type: "invoice",
    title: "Invoice #INV-2024-0089 created",
    description: "Client: Acme Corp",
    time: "2 hours ago",
    icon: FileText,
    gradient: "from-primary/20 to-primary/5",
    iconColor: "text-primary",
  },
  {
    id: 2,
    type: "employee",
    title: "New employee onboarded",
    description: "Rahul Sharma - Software Engineer",
    time: "4 hours ago",
    icon: Users,
    gradient: "from-hrms/20 to-hrms/5",
    iconColor: "text-hrms",
  },
  {
    id: 3,
    type: "goal",
    title: "Q1 Sales Target completed",
    description: "Achieved 125% of target",
    time: "1 day ago",
    icon: Target,
    gradient: "from-performance/20 to-performance/5",
    iconColor: "text-performance",
  },
  {
    id: 4,
    type: "payroll",
    title: "January payroll processed",
    description: "45 employees • ₹24,50,000",
    time: "2 days ago",
    icon: CreditCard,
    gradient: "from-primary/20 to-primary/5",
    iconColor: "text-primary",
  },
  {
    id: 5,
    type: "leave",
    title: "Leave request approved",
    description: "Priya Patel - 3 days annual leave",
    time: "3 days ago",
    icon: Check,
    gradient: "from-success/20 to-success/5",
    iconColor: "text-success",
  },
];

export function RecentActivityEnhanced() {
  return (
    <motion.div
      className="rounded-2xl border bg-card/80 backdrop-blur-sm p-6 shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            className="h-2 w-2 rounded-full bg-primary"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <h3 className="text-lg font-bold text-foreground">Recent Activity</h3>
        </div>
        <motion.button
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          whileHover={{ x: 4 }}
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </div>
      
      <div className="space-y-1">
        {activities.map((activity, index) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4 }}
            whileHover={{ x: 4, backgroundColor: "hsl(var(--secondary) / 0.5)" }}
            className={cn(
              "flex items-start gap-4 p-3 rounded-xl transition-colors cursor-pointer",
              index !== activities.length - 1 && "mb-1"
            )}
          >
            <motion.div
              className={cn(
                "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
                activity.gradient
              )}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <activity.icon className={cn("h-5 w-5", activity.iconColor)} />
            </motion.div>
            
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground mb-0.5">
                {activity.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {activity.description}
              </p>
            </div>
            
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
              <Clock className="h-3 w-3" />
              {activity.time}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}