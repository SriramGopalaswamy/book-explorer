import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { GlowingCard } from "@/components/ui/glowing-card";

interface StatCardEnhancedProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  change?: {
    value: string;
    type: "increase" | "decrease";
  };
  icon: ReactNode;
  className?: string;
  glowColor?: "primary" | "hrms" | "info" | "success";
  index?: number;
}

export function StatCardEnhanced({
  title,
  value,
  prefix = "",
  suffix = "",
  change,
  icon,
  className,
  glowColor = "primary",
  index = 0,
}: StatCardEnhancedProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5, type: "spring" }}
    >
      <GlowingCard glowColor={glowColor} className={cn("p-5", className)}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            {icon}
          </motion.div>
        </div>
        
        <div className="space-y-1">
          <p className="text-3xl font-bold text-foreground tracking-tight">
            <AnimatedCounter
              value={value}
              prefix={prefix}
              suffix={suffix}
              duration={1.5}
            />
          </p>
          
          {change && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 + 0.3 }}
              className="flex items-center gap-1.5"
            >
              <motion.div
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                  change.type === "increase"
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                )}
                whileHover={{ scale: 1.05 }}
              >
                {change.type === "increase" ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {change.value}
              </motion.div>
              <span className="text-xs text-muted-foreground">vs last month</span>
            </motion.div>
          )}
        </div>
      </GlowingCard>
    </motion.div>
  );
}