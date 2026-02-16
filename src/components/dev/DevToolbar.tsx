/**
 * DevToolbar Component
 * 
 * Right-side developer toolbar for RBAC introspection and governance
 * 
 * Features:
 * - Role switcher dropdown
 * - Permission matrix debug panel
 * - Live role-permission governance
 * - SuperAdmin-only permission editing
 * - Collapsible/expandable
 * - Only renders when DEV_MODE=true
 */

import { useState } from "react";
import { useDevMode } from "@/contexts/DevModeContext";
import { useAppMode } from "@/contexts/AppModeContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Shield, 
  UserCog, 
  Eye, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ChevronRight
} from "lucide-react";

export function DevToolbar() {
  const {
    isDevMode,
    isLoading,
    availableRoles,
    activeRole,
    setActiveRole,
    isImpersonating,
    permissions,
    permissionMatrix,
    currentRoleInfo,
    allowPermissionEditing,
  } = useDevMode();
  
  const { canShowDevTools } = useAppMode();
  
  const [isOpen, setIsOpen] = useState(false);
  
  // Don't render if not in dev mode OR if in production mode
  if (!isDevMode || !canShowDevTools) {
    return null;
  }
  
  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-l-lg rounded-r-none h-16 w-8 bg-purple-600 hover:bg-purple-700 text-white border-purple-700"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        
        <SheetContent side="right" className="w-[500px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Developer Tools
            </SheetTitle>
            <SheetDescription>
              RBAC Introspection & Governance Layer
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-6">
            {/* Role Impersonation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCog className="h-4 w-4" />
                  🔴 ROLE SWITCHER ACTIVE 🔴
                </CardTitle>
                <CardDescription>
                  Switch roles at runtime without database changes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Active Role</label>
                  <Select
                    value={activeRole || ''}
                    onValueChange={setActiveRole}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map(role => (
                        <SelectItem key={role.name} value={role.name}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{role.name}</span>
                            <Badge variant="outline" className="text-xs">
                              Priority: {role.priority}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Current Role Status */}
                {currentRoleInfo && (
                  <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Actual Role:</span>
                      <Badge variant="secondary">{currentRoleInfo.user.actualRole}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Effective Role:</span>
                      <Badge variant={isImpersonating ? "default" : "secondary"}>
                        {currentRoleInfo.effectiveRole}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Impersonating:</span>
                      {isImpersonating ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Tabs for different views */}
            <Tabs defaultValue="matrix" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
                <TabsTrigger value="current">Current Role</TabsTrigger>
              </TabsList>
              
              {/* Permission Matrix Tab */}
              <TabsContent value="matrix" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Permission Matrix
                    </CardTitle>
                    <CardDescription>
                      Complete role-permission mappings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {Object.entries(permissionMatrix).map(([role, data]) => (
                          <div key={role} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold flex items-center gap-2">
                                {role}
                                {data.hasWildcard && (
                                  <Badge variant="destructive" className="text-xs">
                                    Wildcard (*)
                                  </Badge>
                                )}
                              </h4>
                              <Badge variant="outline">{data.permissions.length} perms</Badge>
                            </div>
                            <div className="pl-4 space-y-1">
                              {data.permissions.slice(0, 5).map((perm, idx) => (
                                <div key={idx} className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                                  <ChevronRight className="h-3 w-3" />
                                  {perm}
                                </div>
                              ))}
                              {data.permissions.length > 5 && (
                                <div className="text-xs text-muted-foreground italic">
                                  +{data.permissions.length - 5} more...
                                </div>
                              )}
                            </div>
                            <Separator />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Current Role Tab */}
              <TabsContent value="current" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Current Role Permissions
                    </CardTitle>
                    <CardDescription>
                      Permissions for {currentRoleInfo?.effectiveRole || activeRole}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      {currentRoleInfo && (
                        <div className="space-y-2">
                          {currentRoleInfo.hasWildcard ? (
                            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                              <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
                                <Lock className="h-4 w-4" />
                                Full Access (Wildcard)
                              </div>
                              <p className="text-sm text-muted-foreground">
                                This role has unrestricted access to all permissions
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {currentRoleInfo.permissions.map((perm, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 bg-muted rounded text-xs font-mono flex items-center gap-2"
                                >
                                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  <span>{perm}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            
            {/* Permission Editing Warning */}
            {allowPermissionEditing && (
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2 text-yellow-700">
                    <AlertTriangle className="h-4 w-4" />
                    Permission Editing Enabled
                  </CardTitle>
                  <CardDescription className="text-xs">
                    SuperAdmin can modify runtime permissions. Changes are volatile and logged.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
            
            {/* System Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">System Info</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Roles Loaded:</span>
                  <span className="font-mono">{availableRoles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Permissions Loaded:</span>
                  <span className="font-mono">{permissions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>User:</span>
                  <span className="font-mono truncate max-w-[200px]">
                    {currentRoleInfo?.user.email || 'N/A'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
