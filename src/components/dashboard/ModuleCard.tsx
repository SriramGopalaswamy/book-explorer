import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  stats: { label: string; value: string }[];
  linkTo: string;
  variant: "financial" | "hrms" | "performance";
}

const variantStyles = {
  financial: {
    gradient: "bg-gradient-financial",
    light: "bg-financial-light",
    text: "text-financial",
  },
  hrms: {
    gradient: "bg-gradient-hrms",
    light: "bg-hrms-light",
    text: "text-hrms",
  },
  performance: {
    gradient: "bg-gradient-performance",
    light: "bg-performance-light",
    text: "text-performance",
  },
};

export function ModuleCard({
  title,
  description,
  icon,
  stats,
  linkTo,
  variant,
}: ModuleCardProps) {
  const styles = variantStyles[variant];

  return (
    <div className="module-card group">
      {/* Gradient accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 h-1 w-full rounded-t-xl",
          styles.gradient
        )}
      />

      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            styles.gradient,
            "text-white shadow-lg"
          )}
        >
          {icon}
        </div>
        <Link
          to={linkTo}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View All
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      {/* Content */}
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground truncate">{description}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={cn("rounded-lg p-3", styles.light)}
          >
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
