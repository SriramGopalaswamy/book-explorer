/**
 * DevModeContext
 * 
 * Global context for developer mode features:
 * - Role impersonation
 * - Permission matrix debugging
 * - Live role-permission governance
 * - SuperAdmin permission editing
 * 
 * Architecture:
 * - Only initializes if DEV_MODE=true
 * - Fetches all roles and permissions on boot
 * - Determines highest authority role as default
 * - Injects x-dev-role header into all API requests
 * - Never modifies database
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { DEV_MODE, ALLOW_PERMISSION_EDITING } from "@/config/systemFlags";
import { api, setCustomHeader, removeCustomHeader } from "@/lib/api";
import { useAuth } from "./AuthContext";
import { useAppMode } from "./AppModeContext";
import { toast } from "sonner";

interface Role {
  name: string;
  permissions: string[];
  priority: number;
  description: string;
  isSystemRole: boolean;
  id?: string;
}

interface Permission {
  id: string;
  module: string;
  resource: string;
  action: string;
  permissionString: string;
  description?: string;
}

interface PermissionMatrix {
  [role: string]: {
    permissions: string[];
    priority: number;
    hasWildcard: boolean;
  };
}

interface CurrentRoleInfo {
  user: {
    id?: string;
    email?: string;
    actualRole?: string;
  };
  effectiveRole: string;
  isImpersonating: boolean;
  permissions: string[];
  hasWildcard: boolean;
}

interface DevModeContextType {
  // System state
  isDevMode: boolean;
  isLoading: boolean;
  allowPermissionEditing: boolean;
  
  // Role management
  availableRoles: Role[];
  activeRole: string | null;
  setActiveRole: (role: string) => void;
  isImpersonating: boolean;
  
  // Permission data
  permissions: Permission[];
  permissionMatrix: PermissionMatrix;
  currentRoleInfo: CurrentRoleInfo | null;
  
  // Actions
  refreshData: () => Promise<void>;
  updateRolePermissions: (roleName: string, permissions: string[]) => Promise<void>;
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined);

export function DevModeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { appMode, isDeveloperAuthenticated, canShowDevTools } = useAppMode();
  
  const [isLoading, setIsLoading] = useState(true);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [activeRole, setActiveRoleState] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>({});
  const [currentRoleInfo, setCurrentRoleInfo] = useState<CurrentRoleInfo | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  
  /**
   * Fetch all dev mode data from backend
   */
  const fetchDevData = useCallback(async () => {
    // Only fetch in developer mode OR if user exists (for backward compatibility)
    const shouldFetch = (appMode === 'developer' && isDeveloperAuthenticated) || (user && DEV_MODE);
    
    if (!shouldFetch) {
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Fetch roles, permissions, and matrix in parallel
      const [rolesRes, permissionsRes, matrixRes] = await Promise.all([
        api.get<{ roles: Role[] }>('/dev/roles'),
        api.get<{ permissions: Permission[] }>('/dev/permissions'),
        api.get<{ matrix: PermissionMatrix }>('/dev/role-permissions'),
      ]);
      
      if (!rolesRes.roles || rolesRes.roles.length === 0) {
        console.error('No roles received from API');
        toast.error('No roles available - check server configuration');
        setAvailableRoles([]);
      } else {
        setAvailableRoles(rolesRes.roles);
        toast.success(`Loaded ${rolesRes.roles.length} roles for dev mode`);
      }
      
      setPermissions(permissionsRes.permissions);
      setPermissionMatrix(matrixRes.matrix);
      
      // Determine highest authority role (by priority)
      if (rolesRes.roles.length > 0) {
        const highestPriorityRole = rolesRes.roles.reduce((highest, role) => {
          return role.priority > highest.priority ? role : highest;
        }, rolesRes.roles[0]);
        
        // Set as default active role if not already set
        if (!activeRole && highestPriorityRole) {
          setActiveRoleState(highestPriorityRole.name);
          setCustomHeader('x-dev-role', highestPriorityRole.name);
          setIsImpersonating(true);
        }
        
        // Fetch current role info
        const roleInfo = await api.get<CurrentRoleInfo>('/dev/current-role-info');
        setCurrentRoleInfo(roleInfo);
        setIsImpersonating(roleInfo.isImpersonating);
      }
      
    } catch (error) {
      console.error('Failed to fetch dev mode data:', error);
      toast.error('Failed to initialize dev mode');
    } finally {
      setIsLoading(false);
    }
  }, [user, activeRole, appMode, isDeveloperAuthenticated]);
  
  /**
   * Initialize dev mode on user login OR developer mode activation
   */
  useEffect(() => {
    const shouldInitialize = (!authLoading && user && DEV_MODE) || 
                            (!authLoading && isDeveloperAuthenticated && appMode === 'developer');
    
    if (shouldInitialize) {
      fetchDevData();
    } else if (!authLoading && !user && !isDeveloperAuthenticated) {
      // Clean up when user logs out or exits developer mode
      setAvailableRoles([]);
      setActiveRoleState(null);
      setPermissions([]);
      setPermissionMatrix({});
      setCurrentRoleInfo(null);
      setIsImpersonating(false);
      removeCustomHeader('x-dev-role');
      setIsLoading(false);
    } else if (!DEV_MODE) {
      setIsLoading(false);
    }
  }, [user, authLoading, isDeveloperAuthenticated, appMode, fetchDevData]);
  
  /**
   * Set active role and update header
   */
  const setActiveRole = useCallback((role: string) => {
    setActiveRoleState(role);
    setCustomHeader('x-dev-role', role);
    setIsImpersonating(true);
    
    // Refresh current role info
    if (DEV_MODE && user) {
      api.get<CurrentRoleInfo>('/dev/current-role-info')
        .then(roleInfo => {
          setCurrentRoleInfo(roleInfo);
          setIsImpersonating(roleInfo.isImpersonating);
        })
        .catch(error => {
          console.error('Failed to refresh role info:', error);
        });
    }
    
    console.log(`🔄 Role switched to: ${role}`);
    toast.success(`Role switched to: ${role}`);
  }, [user]);
  
  /**
   * Update role permissions (SuperAdmin only)
   */
  const updateRolePermissions = useCallback(async (roleName: string, permissions: string[]) => {
    if (!ALLOW_PERMISSION_EDITING) {
      toast.error('Permission editing is disabled');
      return;
    }
    
    try {
      const result = await api.put<{ success: boolean; message: string; warning?: string }>(
        `/dev/role-permissions/${roleName}`,
        { permissions }
      );
      
      toast.success(result.message);
      
      if (result.warning) {
        toast.warning(result.warning, { duration: 5000 });
      }
      
      // Refresh data
      await fetchDevData();
    } catch (error: unknown) {
      console.error('Failed to update role permissions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update permissions';
      toast.error(errorMessage);
      throw error;
    }
  }, [fetchDevData]);
  
  const value: DevModeContextType = {
    isDevMode: DEV_MODE,
    isLoading,
    allowPermissionEditing: ALLOW_PERMISSION_EDITING,
    availableRoles,
    activeRole,
    setActiveRole,
    isImpersonating,
    permissions,
    permissionMatrix,
    currentRoleInfo,
    refreshData: fetchDevData,
    updateRolePermissions,
  };
  
  return (
    <DevModeContext.Provider value={value}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (context === undefined) {
    throw new Error("useDevMode must be used within a DevModeProvider");
  }
  return context;
}
