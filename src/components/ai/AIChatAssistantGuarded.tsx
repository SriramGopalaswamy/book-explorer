import { useAuth } from "@/contexts/AuthContext";
import { useCurrentRole } from "@/hooks/useRoles";
import { AIChatAssistant } from "./AIChatAssistant";

/**
 * Only renders the AI Chat Assistant for authenticated admin/finance users.
 */
export function AIChatAssistantGuarded() {
  const { user } = useAuth();
  const { data: currentRole, isLoading } = useCurrentRole();

  if (!user || isLoading) return null;
  if (currentRole !== "admin" && currentRole !== "finance") return null;

  return <AIChatAssistant />;
}
