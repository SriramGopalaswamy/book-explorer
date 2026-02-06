import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

interface SparklesProps {
  children: React.ReactNode;
  className?: string;
  sparkleCount?: number;
}

export function Sparkles({ children, className = "", sparkleCount = 3 }: SparklesProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) {
      const newSparkles: Sparkle[] = Array.from({ length: sparkleCount }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 8 + 4,
        delay: Math.random() * 0.3,
        duration: Math.random() * 0.5 + 0.5,
      }));
      setSparkles(newSparkles);
    } else {
      setSparkles([]);
    }
  }, [isHovered, sparkleCount]);

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence>
        {sparkles.map((sparkle) => (
          <motion.svg
            key={sparkle.id}
            className="pointer-events-none absolute z-20"
            style={{
              left: `${sparkle.x}%`,
              top: `${sparkle.y}%`,
              width: sparkle.size,
              height: sparkle.size,
            }}
            initial={{ scale: 0, opacity: 0, rotate: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 180 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              duration: sparkle.duration,
              delay: sparkle.delay,
              ease: "easeOut",
            }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"
              fill="hsl(var(--primary))"
            />
          </motion.svg>
        ))}
      </AnimatePresence>
      {children}
    </div>
  );
}