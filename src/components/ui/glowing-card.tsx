import { ReactNode, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowingCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "primary" | "hrms" | "info" | "success";
  variant?: "default" | "glass" | "solid";
}

const glowColors = {
  primary: "from-primary/50 to-primary/0",
  hrms: "from-hrms/50 to-hrms/0",
  info: "from-info/50 to-info/0",
  success: "from-success/50 to-success/0",
};

export function GlowingCard({
  children,
  className = "",
  glowColor = "primary",
  variant = "default",
}: GlowingCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-2xl transition-all duration-500",
        variant === "glass" && "glass-morphism",
        variant === "default" && "bg-card border border-border",
        variant === "solid" && "bg-card",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4, transition: { duration: 0.3 } }}
    >
      {/* Glow effect that follows cursor */}
      <motion.div
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500",
          isHovered && "opacity-100"
        )}
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, hsl(var(--${glowColor === "primary" ? "primary" : glowColor}) / 0.15), transparent 40%)`,
        }}
      />
      
      {/* Border glow */}
      <motion.div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500",
          isHovered && "opacity-100"
        )}
        style={{
          background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, hsl(var(--${glowColor === "primary" ? "primary" : glowColor}) / 0.3), transparent 40%)`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: "1px",
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}