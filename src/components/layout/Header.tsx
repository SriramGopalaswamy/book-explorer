import { motion } from "framer-motion";
import { Search, User, LogOut, Command, Moon, Sun, Menu } from "lucide-react";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { CommandSearch, useCommandSearch } from "@/components/layout/CommandSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useMobileMenu } from "./Sidebar";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { openMobileMenu } = useMobileMenu();
  const commandSearch = useCommandSearch();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
  };

  const getInitials = () => {
    if (user?.user_metadata?.full_name) {
      const names = user.user_metadata.full_name.split(" ");
      return names.map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const getDisplayName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    return user?.email?.split("@")[0] || "User";
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 md:px-6 gap-3 glass"
    >
      {/* Left: Hamburger (mobile) + Title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 rounded-xl md:hidden"
          onClick={openMobileMenu}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <motion.div
          className="min-w-0"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h1 className="text-lg md:text-xl font-bold text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </motion.div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
        {/* Search — desktop only */}
        <motion.div
          className="relative hidden md:block"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => commandSearch.setOpen(!commandSearch.open)}
            className="flex items-center gap-2 w-64 h-10 px-3 rounded-xl bg-secondary/50 border border-transparent text-sm text-muted-foreground hover:border-primary hover:bg-background transition-all duration-300 cursor-pointer"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded">
              <Command className="h-3 w-3" />K
            </kbd>
          </button>

          <CommandSearch open={commandSearch.open} setOpen={commandSearch.setOpen} />
        </motion.div>

        {/* Dark Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.05 }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-xl"
            onClick={toggleTheme}
          >
            <Sun className={`h-5 w-5 transition-all ${theme === "dark" ? "-rotate-90 scale-0" : "rotate-0 scale-100"}`} />
            <Moon className={`absolute h-5 w-5 transition-all ${theme === "dark" ? "rotate-0 scale-100" : "rotate-90 scale-0"}`} />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </motion.div>

        {/* Notifications */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.05 }}
        >
          <NotificationCenter />
        </motion.div>

        {/* User Menu */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2 rounded-xl">
                <motion.div whileHover={{ scale: 1.05 }}>
                  <Avatar className="h-8 w-8 md:h-9 md:w-9 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-sm font-semibold">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <span className="hidden text-sm font-medium md:block">
                  {getDisplayName()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl glass-morphism">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold">{getDisplayName()}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="rounded-lg cursor-pointer"
                onClick={() => navigate("/profile")}
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="rounded-lg cursor-pointer"
                onClick={() => navigate("/settings")}
              >
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive cursor-pointer rounded-lg"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      </div>
    </motion.header>
  );
}
