import { motion } from "framer-motion";
import { Sparkles, Zap, TrendingUp, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TextReveal } from "@/components/ui/text-reveal";
import { FloatingOrbs } from "@/components/ui/floating-orbs";

export function WelcomeHero() {
  const { user } = useAuth();
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(" ")[0];
    }
    return user?.email?.split("@")[0] || "there";
  };

  const features = [
    { icon: Zap, label: "Real-time Analytics", delay: 0.2 },
    { icon: TrendingUp, label: "Smart Insights", delay: 0.4 },
    { icon: Shield, label: "Secure & Fast", delay: 0.6 },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-dark p-8 mb-8">
      {/* Animated Background */}
      <FloatingOrbs />
      
      {/* Mesh gradient overlay */}
      <div className="absolute inset-0 bg-mesh opacity-50" />
      
      {/* Noise texture */}
      <div className="absolute inset-0 bg-noise opacity-[0.03]" />
      
      {/* Content */}
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-2 mb-4"
        >
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 backdrop-blur-sm"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-5 w-5 text-primary" />
          </motion.div>
          <span className="text-sm font-medium text-primary/80">
            {new Date().toLocaleDateString("en-US", { 
              weekday: "long", 
              month: "long", 
              day: "numeric" 
            })}
          </span>
        </motion.div>

        <TextReveal
          text={`${getGreeting()}, ${getName()}!`}
          className="text-3xl md:text-4xl font-bold text-white mb-2"
          delay={0.1}
        />
        
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-lg text-white/70 max-w-xl mb-6"
        >
          Your business is running smoothly. Here's what needs your attention today.
        </motion.p>

        {/* Feature Pills */}
        <div className="flex flex-wrap gap-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: feature.delay, duration: 0.4, type: "spring" }}
              whileHover={{ scale: 1.05, y: -2 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 text-sm font-medium cursor-default"
            >
              <feature.icon className="h-4 w-4 text-primary" />
              {feature.label}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Decorative Elements */}
      <motion.div
        className="absolute top-4 right-4 w-32 h-32 rounded-full border border-white/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute top-8 right-8 w-24 h-24 rounded-full border border-primary/20"
        animate={{ rotate: -360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}