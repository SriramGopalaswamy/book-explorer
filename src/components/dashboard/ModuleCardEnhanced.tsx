import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowingCard } from "@/components/ui/glowing-card";
import { AnimatedCounter } from "@/components/ui/animated-counter";

interface ModuleCardEnhancedProps {
  title: string;
  description: string;
  icon: ReactNode;
  stats: { label: string; value: string; numericValue?: number }[];
  linkTo: string;
  variant: "financial" | "hrms" | "performance";
  index?: number;
}

const variantStyles = {
  financial: {
    gradient: "bg-gradient-financial",
    glow: "primary" as const,
    accent: "from-primary to-primary/60",
  },
  hrms: {
    gradient: "bg-gradient-hrms",
    glow: "hrms" as const,
    accent: "from-hrms to-hrms/60",
  },
  performance: {
    gradient: "bg-gradient-performance",
    glow: "primary" as const,
    accent: "from-performance to-performance/60",
  },
};

export function ModuleCardEnhanced({
  title,
  description,
  icon,
  stats,
  linkTo,
  variant,
  index = 0,
}: ModuleCardEnhancedProps) {
  const styles = variantStyles[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5, type: "spring" }}
    >
      <GlowingCard glowColor={styles.glow} className="p-6 h-full">
        {/* Gradient accent bar with animation */}
        <motion.div
          className={cn(
            "absolute left-0 top-0 h-1 rounded-t-2xl",
            styles.gradient
          )}
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: index * 0.15 + 0.3, duration: 0.5 }}
        />

        {/* Sparkle indicator for new features */}
        <motion.div
          className="absolute top-4 right-4"
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="h-4 w-4 text-primary/40" />
        </motion.div>

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <motion.div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-2xl",
              styles.gradient,
              "text-white shadow-lg"
            )}
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            {icon}
          </motion.div>
          <Link
            to={linkTo}
            className="group flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>View All</span>
            <motion.div
              initial={{ x: 0 }}
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <ArrowRight className="h-4 w-4" />
            </motion.div>
          </Link>
        </div>

        {/* Content */}
        <motion.h3
          className="mb-1.5 text-xl font-bold text-foreground"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.15 + 0.2 }}
        >
          {title}
        </motion.h3>
        <motion.p
          className="mb-5 text-sm text-muted-foreground leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.15 + 0.3 }}
        >
          {description}
        </motion.p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat, statIndex) => (
            <motion.div
              key={statIndex}
              className="rounded-xl bg-secondary/50 p-4 backdrop-blur-sm border border-border/50"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.15 + 0.4 + statIndex * 0.1 }}
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <p className="text-2xl font-bold text-foreground mb-0.5">
                {stat.numericValue ? (
                  <AnimatedCounter
                    value={stat.numericValue}
                    duration={1.5}
                    prefix={stat.value.includes("₹") ? "₹" : ""}
                    suffix={stat.value.includes("%") ? "%" : ""}
                  />
                ) : (
                  stat.value
                )}
              </p>
              <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </GlowingCard>
    </motion.div>
  );
}