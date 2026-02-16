/**
 * AppModeContext
 * 
 * Centralized application mode management for dual-boot architecture.
 * 
 * Modes:
 * - 'production': Real authentication required, SSO/email login
 * - 'developer': Bypass authentication, internal tool usage
 * 
 * Architecture:
 * - On app load: Check for real authenticated user → production mode
 * - Developer mode: Activated ONLY via button click on login screen
 * - Mode switching: Controlled and audited
 * - Production isolation: Developer features completely disabled in production mode
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { DEV_MODE } from "@/config/systemFlags";
import { useAuth } from "./AuthContext";
import { setCustomHeader, removeCustomHeader } from "@/lib/api";

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

  /**
   * Initialize app mode based on authentication state
   */
  useEffect(() => {
    if (user) {
      // Real authenticated user = production mode
      setAppModeState('production');
      setIsDeveloperAuthenticated(false);
      
      // Remove any developer mode headers
      removeCustomHeader('x-dev-bypass');
      
      console.log('🔒 App Mode: PRODUCTION (authenticated user detected)');
    } else if (!isDeveloperAuthenticated) {
      // No user, not in dev mode = production mode (show login)
      setAppModeState('production');
      console.log('🔒 App Mode: PRODUCTION (no authentication)');
    }
  }, [user, isDeveloperAuthenticated]);

  /**
   * Enter developer mode (called from login screen button)
   */
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
    
    // Set x-dev-bypass header for all API requests
    setCustomHeader('x-dev-bypass', 'true');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔓 DEVELOPER MODE ACTIVATED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Auth:        BYPASSED');
    console.log('DevTools:    ENABLED');
    console.log('Mode:        DEVELOPER');
    console.log('Header:      x-dev-bypass: true');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }, [user]);

  /**
   * Exit developer mode (logout)
   */
  const exitDeveloperMode = useCallback(() => {
    setAppModeState('production');
    setIsDeveloperAuthenticated(false);
    
    // Remove x-dev-bypass header
    removeCustomHeader('x-dev-bypass');
    removeCustomHeader('x-dev-role');
    
    console.log('🔒 Exited developer mode → returning to login screen');
  }, []);

  /**
   * Set app mode directly (for advanced use cases)
   */
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
    console.log(`🔄 App mode changed to: ${mode.toUpperCase()}`);
  }, [user]);

  /**
   * Determine if dev tools should be visible
   * True only if in developer mode AND DEV_MODE flag is enabled
   */
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
