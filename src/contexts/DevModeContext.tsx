/**
 * DevModeContext
 * 
 * Simplified dev mode context that reads roles from the user_roles table
 * and allows admins to preview the app as different roles (client-side only).
 * 
 * Uses DEV_MODE flag + authenticated user only (no legacy developer mode).
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { DEV_MODE } from "@/config/systemFlags";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

// The app_role enum values from the database
const APP_ROLES = ["admin", "hr", "finance", "manager", "employee"] as const;
type AppRole = typeof APP_ROLES[number];

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
  isDevMode: boolean;
  isLoading: boolean;
  allowPermissionEditing: boolean;
  availableRoles: Role[];
  activeRole: string | null;
  setActiveRole: (role: string) => void;
  isImpersonating: boolean;
  permissions: Permission[];
  permissionMatrix: PermissionMatrix;
  currentRoleInfo: CurrentRoleInfo | null;
  refreshData: () => Promise<void>;
  updateRolePermissions: (roleName: string, permissions: string[]) => Promise<void>;
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined);

// Priority mapping for roles
const ROLE_PRIORITY: Record<AppRole, number> = {
  admin: 100,
  hr: 80,
  finance: 70,
  manager: 60,
  employee: 20,
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Full system access",
  hr: "HR management and employee records",
  finance: "Financial suite, payroll and org chart access",
  manager: "Team and department management",
  employee: "Basic employee access",
};

// Simple permission sets per role for the matrix view
const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ["*"],
  hr: ["profiles:read", "profiles:write", "attendance:read", "attendance:write", "leaves:read", "leaves:write", "payroll:read", "payroll:write", "memos:manage"],
  finance: ["financial:read", "financial:write", "invoicing:read", "invoicing:write", "banking:read", "cashflow:read", "analytics:read", "payroll:read", "orgchart:read"],
  manager: ["profiles:read", "attendance:read", "leaves:read", "leaves:approve", "goals:read", "goals:write", "payroll:read"],
  employee: ["profiles:own:read", "profiles:own:write", "attendance:own:read", "leaves:own:read", "leaves:own:write", "goals:own:read", "goals:own:write"],
};

export function DevModeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [activeRole, setActiveRoleState] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>({});
  const [currentRoleInfo, setCurrentRoleInfo] = useState<CurrentRoleInfo | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [userActualRole, setUserActualRole] = useState<string | null>(null);

  /**
   * Fetch user's actual role from user_roles table and build role data.
   * Only runs when DEV_MODE is enabled AND user is authenticated.
   */
  const fetchDevData = useCallback(async () => {
    if (!user || !DEV_MODE) {
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Fetch the current user's role(s) from user_roles table
      let actualRole: string = "employee";
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      
      if (error) {
        console.warn('Could not fetch user roles:', error.message);
      } else if (userRoles && userRoles.length > 0) {
        // Pick highest priority role
        const sorted = userRoles.sort((a, b) => 
          (ROLE_PRIORITY[b.role as AppRole] || 0) - (ROLE_PRIORITY[a.role as AppRole] || 0)
        );
        actualRole = sorted[0].role;
      }
      
      setUserActualRole(actualRole);
      
      // Build roles from the enum
      const roles: Role[] = APP_ROLES.map(role => ({
        name: role,
        description: ROLE_DESCRIPTIONS[role],
        priority: ROLE_PRIORITY[role],
        isSystemRole: true,
        permissions: ROLE_PERMISSIONS[role],
      }));
      
      // Build permission matrix
      const matrix: PermissionMatrix = {};
      roles.forEach(role => {
        matrix[role.name] = {
          permissions: ROLE_PERMISSIONS[role.name as AppRole] || [],
          priority: role.priority,
          hasWildcard: ROLE_PERMISSIONS[role.name as AppRole]?.includes('*') || false,
        };
      });
      
      setAvailableRoles(roles);
      setPermissionMatrix(matrix);
      
      // Set default active role to the user's actual role
      if (!activeRole) {
        setActiveRoleState(actualRole);
        setIsImpersonating(false);
      }
      
      // Build current role info
      const effectiveRoleName = activeRole || actualRole;
      const effectiveRoleData = matrix[effectiveRoleName];
      
      setCurrentRoleInfo({
        user: {
          id: user.id,
          email: user.email,
          actualRole,
        },
        effectiveRole: effectiveRoleName,
        isImpersonating: effectiveRoleName !== actualRole,
        permissions: effectiveRoleData?.permissions || [],
        hasWildcard: effectiveRoleData?.hasWildcard || false,
      });
      
      toast.success(`Dev tools loaded – ${roles.length} roles available`);
    } catch (error) {
      console.error('Dev mode init error:', error);
      toast.error('Failed to initialize dev mode');
    } finally {
      setIsLoading(false);
    }
  }, [user, activeRole]);

  useEffect(() => {
    if (!authLoading && user && DEV_MODE) {
      fetchDevData();
    } else if (!authLoading && !user) {
      setAvailableRoles([]);
      setActiveRoleState(null);
      setPermissions([]);
      setPermissionMatrix({});
      setCurrentRoleInfo(null);
      setIsImpersonating(false);
      setIsLoading(false);
    } else if (!DEV_MODE) {
      setIsLoading(false);
    }
  }, [user, authLoading, fetchDevData]);

  const setActiveRole = useCallback((role: string) => {
    setActiveRoleState(role);
    setIsImpersonating(role !== userActualRole);
    
    const roleData = permissionMatrix[role];
    if (roleData) {
      setCurrentRoleInfo({
        user: {
          id: user?.id,
          email: user?.email,
          actualRole: userActualRole || 'employee',
        },
        effectiveRole: role,
        isImpersonating: role !== userActualRole,
        permissions: roleData.permissions,
        hasWildcard: roleData.hasWildcard,
      });
    }
    
    toast.success(`Role switched to: ${role}`);
  }, [user, permissionMatrix, userActualRole]);

  const updateRolePermissions = useCallback(async (_roleName: string, _newPermissions: string[]) => {
    toast.info('Permission editing is not supported in this mode');
  }, []);

  const value: DevModeContextType = {
    isDevMode: DEV_MODE,
    isLoading,
    allowPermissionEditing: false,
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
