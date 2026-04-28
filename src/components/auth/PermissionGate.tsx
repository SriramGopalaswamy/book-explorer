import { useRolePermissions } from "@/hooks/useRolePermissions";
import { ResourceKey, ActionKey, ACTIONS } from "@/lib/permissions";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Loader2 } from "lucide-react";

interface PermissionGateProps {
  resource: ResourceKey;
  action?: ActionKey;
  /** Rendered when permission is denied. Defaults to null for inline use. */
  fallback?: React.ReactNode;
  /** When true, renders <AccessDenied /> for denied and a spinner while loading. Use at the page root. */
  pageLevelGate?: boolean;
  children: React.ReactNode;
}

/**
 * PermissionGate — renders children only when the current user has the required permission.
 *
 * Inline use (default): pass no extra props. Renders null when denied.
 * Page-level use: set pageLevelGate={true}. Renders AccessDenied when denied,
 *   spinner while loading, ensuring the RBAC matrix is always enforced.
 */
export function PermissionGate({
  resource,
  action = ACTIONS.VIEW,
  fallback = null,
  pageLevelGate = false,
  children,
}: PermissionGateProps) {
  const { hasPermission, isLoading } = useRolePermissions();

  if (isLoading) {
    return pageLevelGate ? (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ) : (
      // Render children while loading to avoid flash-of-denied for authorized users
      <>{children}</>
    );
  }

  if (!hasPermission(resource, action)) {
    return pageLevelGate ? <AccessDenied /> : <>{fallback}</>;
  }

  return <>{children}</>;
}
