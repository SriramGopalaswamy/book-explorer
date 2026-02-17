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
 * - Fetches all roles and permissions directly from Supabase
 * - Determines highest authority role as default
 * - Client-side role simulation (no backend dependency)
 * - Updates via Supabase RPC functions
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { DEV_MODE, ALLOW_PERMISSION_EDITING } from "@/config/systemFlags";
import { supabase } from "@/integrations/supabase/client";
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
   * Fetch all dev mode data from Supabase
   */
  const fetchDevData = useCallback(async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 DEV MODE BOOT SEQUENCE TRACE (SUPABASE)');
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
      
      console.log('\nSTEP 2: Fetching dev mode data from Supabase');
      console.log('  - Query 1: SELECT * FROM roles');
      console.log('  - Query 2: SELECT * FROM permissions');
      console.log('  - Query 3: SELECT * FROM role_permissions with joins');
      
      // Fetch roles, permissions, and role_permissions in parallel
      const [rolesResult, permissionsResult, rolePermissionsResult] = await Promise.all([
        supabase
          .from('roles')
          .select('*')
          .eq('is_active', true)
          .order('priority', { ascending: false }),
        supabase
          .from('permissions')
          .select('*')
          .eq('is_active', true)
          .order('module', { ascending: true }),
        supabase
          .from('role_permissions')
          .select(`
            id,
            role_id,
            permission_id,
            roles!inner(name, priority),
            permissions!inner(permission_string)
          `)
      ]);
      
      if (rolesResult.error) throw rolesResult.error;
      if (permissionsResult.error) throw permissionsResult.error;
      if (rolePermissionsResult.error) throw rolePermissionsResult.error;
      
      console.log('✓ STEP 2 PASSED: All Supabase queries succeeded');
      
      console.log('\nSTEP 3: Validating fetched data');
      console.log('  - Roles received:', rolesResult.data?.length || 0);
      console.log('  - Permissions received:', permissionsResult.data?.length || 0);
      console.log('  - Role-Permission mappings:', rolePermissionsResult.data?.length || 0);
      
      if (!rolesResult.data || rolesResult.data.length === 0) {
        console.error('❌ STEP 3 FAILED: No roles received from Supabase');
        console.error('   This indicates DB seeding issue');
        toast.error('No roles available - database may need seeding');
        setAvailableRoles([]);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }
      
      console.log('✓ STEP 3 PASSED: Data validation OK');
      
      // Transform Supabase data to expected format
      const roles: Role[] = rolesResult.data.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description || '',
        priority: role.priority,
        isSystemRole: role.is_system_role,
        permissions: [] // Will be populated from rolePermissionsResult
      }));
      
      const permissions: Permission[] = permissionsResult.data.map(perm => ({
        id: perm.id,
        module: perm.module,
        resource: perm.resource,
        action: perm.action,
        permissionString: perm.permission_string,
        description: perm.description || undefined
      }));
      
      // Build permission matrix
      const matrix: PermissionMatrix = {};
      roles.forEach(role => {
        const rolePerms = rolePermissionsResult.data
          .filter((rp: any) => rp.roles.name === role.name)
          .map((rp: any) => rp.permissions.permission_string);
        
        matrix[role.name] = {
          permissions: rolePerms,
          priority: role.priority,
          hasWildcard: rolePerms.includes('*')
        };
        
        // Also update the role's permissions array
        role.permissions = rolePerms;
      });
      
      console.log('  - Available roles:', roles.map(r => `${r.name}(${r.priority})`).join(', '));
      
      setAvailableRoles(roles);
      setPermissions(permissions);
      setPermissionMatrix(matrix);
      toast.success(`Loaded ${roles.length} roles for dev mode`);
      
      // Determine highest authority role (by priority)
      console.log('\nSTEP 4: Determining highest priority role');
      if (roles.length > 0) {
        // Find highest priority role explicitly (in case query ordering changes)
        const highestPriorityRole = roles.reduce((highest, role) => {
          return role.priority > highest.priority ? role : highest;
        }, roles[0]);
        
        console.log('  - Highest priority role:', highestPriorityRole.name);
        console.log('  - Priority value:', highestPriorityRole.priority);
        console.log('  - Current activeRole state:', activeRole);
        
        // Set as default active role if not already set
        if (!activeRole && highestPriorityRole) {
          console.log('\nSTEP 5: Setting default active role');
          console.log('  - Setting activeRole to:', highestPriorityRole.name);
          
          setActiveRoleState(highestPriorityRole.name);
          setIsImpersonating(true);
          
          console.log('✓ STEP 5 PASSED: Active role set (client-side only)');
        } else {
          console.log('\nSTEP 5: Skipped (activeRole already set to:', activeRole, ')');
        }
        
        // Build current role info (client-side)
        console.log('\nSTEP 6: Building current role info (client-side)');
        const effectiveRoleName = activeRole || highestPriorityRole.name;
        const effectiveRoleData = matrix[effectiveRoleName];
        
        const roleInfo: CurrentRoleInfo = {
          user: {
            id: user?.id,
            email: user?.email,
            actualRole: user?.email ? 'user' : undefined
          },
          effectiveRole: effectiveRoleName,
          isImpersonating: !!activeRole,
          permissions: effectiveRoleData?.permissions || [],
          hasWildcard: effectiveRoleData?.hasWildcard || false
        };
        
        console.log('  - Effective role:', roleInfo.effectiveRole);
        console.log('  - Is impersonating:', roleInfo.isImpersonating);
        console.log('  - Permissions count:', roleInfo.permissions.length);
        
        setCurrentRoleInfo(roleInfo);
        
        console.log('✓ STEP 6 PASSED: Current role info built');
      } else {
        console.error('❌ STEP 4 FAILED: No roles to process');
      }
      
      console.log('\n✅ DEV MODE INITIALIZATION COMPLETE (SUPABASE)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ DEV MODE INITIALIZATION FAILED (SUPABASE)');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('DEV INIT ERROR:', error);
      console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
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
      setIsLoading(false);
    } else if (!DEV_MODE) {
      setIsLoading(false);
    }
  }, [user, authLoading, isDeveloperAuthenticated, appMode, fetchDevData]);
  
  /**
   * Set active role (client-side only, no backend header)
   */
  const setActiveRole = useCallback((role: string) => {
    setActiveRoleState(role);
    setIsImpersonating(true);
    
    // Update current role info (client-side)
    const roleData = permissionMatrix[role];
    if (roleData) {
      const roleInfo: CurrentRoleInfo = {
        user: {
          id: user?.id,
          email: user?.email,
          actualRole: user?.email ? 'user' : undefined
        },
        effectiveRole: role,
        isImpersonating: true,
        permissions: roleData.permissions,
        hasWildcard: roleData.hasWildcard
      };
      setCurrentRoleInfo(roleInfo);
    }
    
    console.log(`🔄 Role switched to: ${role} (client-side only)`);
    toast.success(`Role switched to: ${role}`);
  }, [user, permissionMatrix]);
  
  /**
   * Update role permissions via Supabase RPC (SuperAdmin only)
   */
  const updateRolePermissions = useCallback(async (roleName: string, newPermissions: string[]) => {
    if (!ALLOW_PERMISSION_EDITING) {
      toast.error('Permission editing is disabled');
      return;
    }
    
    try {
      // Call Supabase RPC function
      const { data, error } = await supabase.rpc('update_role_permissions', {
        role_name: roleName,
        permission_strings: newPermissions
      });
      
      if (error) throw error;
      
      toast.success(`Permissions for ${roleName} updated successfully`);
      toast.warning('Changes are persisted in Supabase', { duration: 5000 });
      
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
