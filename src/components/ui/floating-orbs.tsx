import { motion } from "framer-motion";

interface FloatingOrbsProps {
  className?: string;
}

export function FloatingOrbs({ className = "" }: FloatingOrbsProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Primary Orb */}
      <motion.div
        className="absolute w-72 h-72 rounded-full bg-primary/20 blur-3xl"
        style={{ top: "10%", left: "15%" }}
        animate={{
          x: [0, 50, -30, 0],
          y: [0, -30, 50, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Secondary Orb */}
      <motion.div
        className="absolute w-96 h-96 rounded-full bg-hrms/15 blur-3xl"
        style={{ top: "30%", right: "10%" }}
        animate={{
          x: [0, -40, 30, 0],
          y: [0, 40, -30, 0],
          scale: [1, 0.9, 1.1, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />
      
      {/* Tertiary Orb */}
      <motion.div
        className="absolute w-64 h-64 rounded-full bg-info/10 blur-3xl"
        style={{ bottom: "20%", left: "30%" }}
        animate={{
          x: [0, 30, -50, 0],
          y: [0, -50, 30, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
        }}
      />
      
      {/* Accent Orb */}
      <motion.div
        className="absolute w-48 h-48 rounded-full bg-success/10 blur-2xl"
        style={{ bottom: "30%", right: "25%" }}
        animate={{
          x: [0, -20, 40, 0],
          y: [0, 30, -20, 0],
          scale: [1, 1.15, 0.9, 1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />
    </div>
  );
}