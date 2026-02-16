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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 DEV MODE BOOT SEQUENCE TRACE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Only fetch in developer mode OR if user exists (for backward compatibility)
    const shouldFetch = (appMode === 'developer' && isDeveloperAuthenticated) || (user && DEV_MODE);
    
    console.log('STEP 1: Pre-flight checks');
    console.log('  - appMode:', appMode);
    console.log('  - isDeveloperAuthenticated:', isDeveloperAuthenticated);
    console.log('  - user:', user ? `${user.email} (${user.id})` : 'null');
    console.log('  - DEV_MODE:', DEV_MODE);
    console.log('  - shouldFetch:', shouldFetch);
    
    if (!shouldFetch) {
      console.log('❌ STEP 1 FAILED: shouldFetch = false, aborting initialization');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      setIsLoading(false);
      return;
    }
    console.log('✓ STEP 1 PASSED: Pre-flight checks OK');
    
    try {
      setIsLoading(true);
      
      console.log('\nSTEP 2: Fetching dev mode data from backend');
      console.log('  - Endpoint 1: GET /api/dev/roles');
      console.log('  - Endpoint 2: GET /api/dev/permissions');
      console.log('  - Endpoint 3: GET /api/dev/role-permissions');
      
      // Fetch roles, permissions, and matrix in parallel
      const [rolesRes, permissionsRes, matrixRes] = await Promise.all([
        api.get<{ roles: Role[] }>('/dev/roles'),
        api.get<{ permissions: Permission[] }>('/dev/permissions'),
        api.get<{ matrix: PermissionMatrix }>('/dev/role-permissions'),
      ]);
      
      console.log('✓ STEP 2 PASSED: All API calls succeeded');
      
      console.log('\nSTEP 3: Validating fetched data');
      console.log('  - Roles received:', rolesRes.roles?.length || 0);
      console.log('  - Permissions received:', permissionsRes.permissions?.length || 0);
      console.log('  - Matrix keys:', Object.keys(matrixRes.matrix || {}).length);
      
      if (!rolesRes.roles || rolesRes.roles.length === 0) {
        console.error('❌ STEP 3 FAILED: No roles received from API');
        console.error('   This indicates DB seeding issue or API error');
        toast.error('No roles available - check server configuration');
        setAvailableRoles([]);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }
      
      console.log('✓ STEP 3 PASSED: Data validation OK');
      console.log('  - Available roles:', rolesRes.roles.map(r => `${r.name}(${r.priority})`).join(', '));
      
      setAvailableRoles(rolesRes.roles);
      setPermissions(permissionsRes.permissions);
      setPermissionMatrix(matrixRes.matrix);
      toast.success(`Loaded ${rolesRes.roles.length} roles for dev mode`);
      
      // Determine highest authority role (by priority)
      console.log('\nSTEP 4: Determining highest priority role');
      if (rolesRes.roles.length > 0) {
        const highestPriorityRole = rolesRes.roles.reduce((highest, role) => {
          return role.priority > highest.priority ? role : highest;
        }, rolesRes.roles[0]);
        
        console.log('  - Highest priority role:', highestPriorityRole.name);
        console.log('  - Priority value:', highestPriorityRole.priority);
        console.log('  - Current activeRole state:', activeRole);
        
        // Set as default active role if not already set
        if (!activeRole && highestPriorityRole) {
          console.log('\nSTEP 5: Setting default active role');
          console.log('  - Setting activeRole to:', highestPriorityRole.name);
          
          setActiveRoleState(highestPriorityRole.name);
          setCustomHeader('x-dev-role', highestPriorityRole.name);
          setIsImpersonating(true);
          
          console.log('✓ STEP 5 PASSED: Active role set and header injected');
        } else {
          console.log('\nSTEP 5: Skipped (activeRole already set to:', activeRole, ')');
        }
        
        // Fetch current role info
        console.log('\nSTEP 6: Fetching current role info');
        const roleInfo = await api.get<CurrentRoleInfo>('/dev/current-role-info');
        
        console.log('  - Actual role:', roleInfo.user.actualRole);
        console.log('  - Effective role:', roleInfo.effectiveRole);
        console.log('  - Is impersonating:', roleInfo.isImpersonating);
        console.log('  - Permissions count:', roleInfo.permissions.length);
        
        setCurrentRoleInfo(roleInfo);
        setIsImpersonating(roleInfo.isImpersonating);
        
        console.log('✓ STEP 6 PASSED: Current role info fetched');
      } else {
        console.error('❌ STEP 4 FAILED: No roles to process');
      }
      
      console.log('\n✅ DEV MODE INITIALIZATION COMPLETE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ DEV MODE INITIALIZATION FAILED');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('DEV INIT ERROR:', error);
      console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      if (error instanceof Error && error.message.includes('401')) {
        console.error('❌ AUTHENTICATION FAILURE: API returned 401 Unauthorized');
        console.error('   → Developer bypass not working');
        console.error('   → Check x-dev-bypass header is being sent');
      } else if (error instanceof Error && error.message.includes('403')) {
        console.error('❌ PERMISSION FAILURE: API returned 403 Forbidden');
        console.error('   → Permission middleware blocking dev endpoints');
        console.error('   → Check requireAuth middleware configuration');
      } else if (error instanceof Error && error.message.includes('404')) {
        console.error('❌ ENDPOINT NOT FOUND: API returned 404');
        console.error('   → Check dev routes are registered in server.js');
      } else if (error instanceof Error && error.message.includes('500')) {
        console.error('❌ SERVER ERROR: API returned 500');
        console.error('   → Backend crashing during request');
        console.error('   → Check backend logs for error details');
      } else if (error instanceof Error && error.message.includes('CORS')) {
        console.error('❌ CORS ERROR: Cross-origin request blocked');
        console.error('   → API base URL incorrect');
        console.error('   → Check VITE_API_URL environment variable');
      } else if (error instanceof Error && error.message.includes('NetworkError')) {
        console.error('❌ NETWORK ERROR: Cannot connect to backend');
        console.error('   → Backend server not running');
        console.error('   → Check backend is listening on correct port');
      }
      
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      toast.error('Failed to initialize dev mode - see console for details');
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
