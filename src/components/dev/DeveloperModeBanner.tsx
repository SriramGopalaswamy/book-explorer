/**
 * DeveloperModeBanner Component
 * 
 * Visual indicator when app is running in developer mode
 * Shows a subtle banner at the top of the application
 * Only renders when in developer mode
 */

import { useAppMode } from "@/contexts/AppModeContext";
import { Code2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function DeveloperModeBanner() {
  const { appMode, canShowDevTools, exitDeveloperMode } = useAppMode();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // Only show in developer mode
  if (!canShowDevTools || appMode !== 'developer') {
    return null;
  }

  const handleExit = async () => {
    exitDeveloperMode();
    await signOut();
    toast.info("Exited developer mode");
    navigate("/auth");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-purple-900/90 backdrop-blur border-b border-purple-700">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-purple-200">
          <Code2 className="h-4 w-4" />
          <span className="text-sm font-medium">DEVELOPER MODE</span>
          <span className="text-xs text-purple-300">• Authentication Bypassed</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExit}
          className="text-purple-200 hover:text-white hover:bg-purple-800"
        >
          <X className="h-4 w-4 mr-1" />
          Exit Dev Mode
        </Button>
      </div>
    </div>
  );
}
