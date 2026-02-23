import { useAuth } from "@/contexts/AuthContext";
import { useCurrentRole } from "@/hooks/useRoles";
import { AIChatAssistant } from "./AIChatAssistant";
import { AI_CHAT_ENABLED } from "@/config/systemFlags";

/**
 * Only renders the AI Chat Assistant for authenticated admin/finance users.
 * Gated behind AI_CHAT_ENABLED feature flag (Phase 1 soft decommission).
 */
export function AIChatAssistantGuarded() {
  // Phase 1: Feature flag kill switch — no API calls, no UI render
  if (!AI_CHAT_ENABLED) return null;

  const { user } = useAuth();
  const { data: currentRole, isLoading } = useCurrentRole();

  if (!user || isLoading) return null;
  if (currentRole !== "admin" && currentRole !== "finance") return null;

  return <AIChatAssistant />;
}
