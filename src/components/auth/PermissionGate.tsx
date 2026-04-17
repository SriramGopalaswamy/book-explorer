import { useRolePermissions } from "@/hooks/useRolePermissions";
import { ResourceKey, ActionKey, ACTIONS } from "@/lib/permissions";

interface PermissionGateProps {
  resource: ResourceKey;
  action?: ActionKey;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// Inline gate: renders children only when the current user has the required permission.
// Use for buttons, tabs, columns, and other UI elements within a page.
export function PermissionGate({
  resource,
  action = ACTIONS.VIEW,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { hasPermission } = useRolePermissions();
  return hasPermission(resource, action) ? <>{children}</> : <>{fallback}</>;
}
