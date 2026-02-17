/**
 * AppModeContext
 * 
 * Centralized application mode management.
 * 
 * Modes:
 * - 'production': Real authentication required
 * - 'developer': Bypass authentication, internal tool usage
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { DEV_MODE } from "@/config/systemFlags";
import { useAuth } from "./AuthContext";

export type AppMode = 'production' | 'developer';

interface AppModeContextType {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  isDeveloperAuthenticated: boolean;
  setIsDeveloperAuthenticated: (authenticated: boolean) => void;
  enterDeveloperMode: () => void;
  exitDeveloperMode: () => void;
  canShowDevTools: boolean;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [appMode, setAppModeState] = useState<AppMode>('production');
  const [isDeveloperAuthenticated, setIsDeveloperAuthenticated] = useState(false);

  useEffect(() => {
    if (user) {
      setAppModeState('production');
      setIsDeveloperAuthenticated(false);
      console.log('🔒 App Mode: PRODUCTION (authenticated user detected)');
    } else if (!isDeveloperAuthenticated) {
      setAppModeState('production');
      console.log('🔒 App Mode: PRODUCTION (no authentication)');
    }
  }, [user, isDeveloperAuthenticated]);

  const enterDeveloperMode = useCallback(() => {
    if (!DEV_MODE) {
      console.error('❌ Cannot enter developer mode: DEV_MODE is disabled');
      return;
    }
    if (user) {
      console.warn('⚠️  Cannot enter developer mode: User already authenticated');
      return;
    }
    setAppModeState('developer');
    setIsDeveloperAuthenticated(true);
    console.log('🔓 DEVELOPER MODE ACTIVATED');
  }, [user]);

  const exitDeveloperMode = useCallback(() => {
    setAppModeState('production');
    setIsDeveloperAuthenticated(false);
    console.log('🔒 Exited developer mode → returning to login screen');
  }, []);

  const setAppMode = useCallback((mode: AppMode) => {
    if (mode === 'developer' && !DEV_MODE) {
      console.error('❌ Cannot set developer mode: DEV_MODE is disabled');
      return;
    }
    if (mode === 'developer' && user) {
      console.warn('⚠️  Cannot set developer mode: User already authenticated');
      return;
    }
    setAppModeState(mode);
  }, [user]);

  const canShowDevTools = appMode === 'developer' && isDeveloperAuthenticated && DEV_MODE;

  const value: AppModeContextType = {
    appMode,
    setAppMode,
    isDeveloperAuthenticated,
    setIsDeveloperAuthenticated,
    enterDeveloperMode,
    exitDeveloperMode,
    canShowDevTools,
  };

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (context === undefined) {
    throw new Error("useAppMode must be used within an AppModeProvider");
  }
  return context;
}
