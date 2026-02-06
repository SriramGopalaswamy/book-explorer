import { motion } from "framer-motion";
import { 
  Plus, 
  FileText, 
  UserPlus, 
  ArrowUpRight, 
  Clock,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RippleEffect } from "@/components/ui/ripple-effect";

const actions = [
  {
    label: "Create Invoice",
    icon: FileText,
    href: "/financial/invoicing",
    gradient: "from-primary to-primary/70",
    description: "Bill clients",
  },
  {
    label: "Add Employee",
    icon: UserPlus,
    href: "/hrms/employees",
    gradient: "from-hrms to-hrms/70",
    description: "Onboard new",
  },
  {
    label: "New Goal",
    icon: Plus,
    href: "/performance/goals",
    gradient: "from-performance to-performance/70",
    description: "Set objectives",
  },
  {
    label: "Log Time",
    icon: Clock,
    href: "/hrms/attendance",
    gradient: "from-info to-info/70",
    description: "Track hours",
  },
];

export function QuickActionsEnhanced() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Zap className="h-5 w-5 text-primary" />
        </motion.div>
        <h3 className="text-lg font-bold text-foreground">Quick Actions</h3>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action, index) => (
          <motion.a
            key={action.label}
            href={action.href}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1, type: "spring" }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RippleEffect className="rounded-2xl">
              <div className="relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur-sm p-4 h-full group">
                {/* Gradient Background on Hover */}
                <motion.div
                  className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br",
                    action.gradient
                  )}
                />
                
                <div className="relative z-10">
                  <motion.div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white mb-3 shadow-lg",
                      action.gradient
                    )}
                    whileHover={{ rotate: 5 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <action.icon className="h-5 w-5" />
                  </motion.div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm mb-0.5">
                        {action.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </div>
            </RippleEffect>
          </motion.a>
        ))}
      </div>
    </motion.div>
  );
}