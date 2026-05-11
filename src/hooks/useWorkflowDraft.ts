/**
 * GBC-52: workflow draft persistence — both localStorage (instant save,
 * single-device) and server-side (workflow_drafts table, survives device
 * switches).
 *
 * Usage in the Automation builder:
 *
 *   const { definition, setDefinition, isLoading, lastSavedAt, discard } =
 *     useWorkflowDraft("monthly-invoice-follow-up");
 *
 *   // The hook auto-saves on every setDefinition (with a debounce).
 *   // On mount it merges localStorage + server, preferring the newer.
 *
 * The localStorage key is namespaced per (orgId, userId, draftName) so
 * different orgs / users on the same browser don't collide.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";

type Definition = Record<string, unknown> | unknown[] | null;

interface WorkflowDraft {
  definition: Definition;
  lastSavedAt: string;
}

const LOCAL_PREFIX = "wf-draft:";
const DEBOUNCE_MS = 1500;

function localKey(orgId: string | null | undefined, userId: string | null | undefined, name: string) {
  return `${LOCAL_PREFIX}${orgId ?? "no-org"}:${userId ?? "no-user"}:${name}`;
}

function readLocal(key: string): WorkflowDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkflowDraft;
    if (typeof parsed?.lastSavedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(key: string, draft: WorkflowDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable / full — never throw from auto-save
  }
}

export function useWorkflowDraft(name: string) {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const userId = user?.id;

  const [definition, setDefinitionState] = useState<Definition>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Initial load: merge localStorage + server, prefer the newer.
  useEffect(() => {
    if (!orgId || !userId || !name) return;
    setIsLoading(true);
    const key = localKey(orgId, userId, name);
    const local = readLocal(key);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("workflow_drafts" as any)
          .select("definition, last_saved_at")
          .eq("organization_id", orgId)
          .eq("user_id", userId)
          .eq("name", name)
          .maybeSingle();

        if (error) {
          // Server unavailable — fall back to localStorage if present.
          if (local && mountedRef.current) {
            setDefinitionState(local.definition);
            setLastSavedAt(local.lastSavedAt);
          }
          return;
        }

        const server = data
          ? ({
              definition: (data as any).definition as Definition,
              lastSavedAt: (data as any).last_saved_at as string,
            } satisfies WorkflowDraft)
          : null;

        const winner =
          local && server
            ? new Date(local.lastSavedAt) > new Date(server.lastSavedAt)
              ? local
              : server
            : local ?? server;

        if (winner && mountedRef.current) {
          setDefinitionState(winner.definition);
          setLastSavedAt(winner.lastSavedAt);
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();
  }, [orgId, userId, name]);

  const persistNow = useCallback(
    async (def: Definition) => {
      if (!orgId || !userId || !name) return;
      const ts = new Date().toISOString();
      const key = localKey(orgId, userId, name);
      // 1. localStorage always — synchronous, never fails the UX.
      writeLocal(key, { definition: def, lastSavedAt: ts });
      // 2. server upsert via RPC — fire-and-forget; errors logged not thrown.
      const { error } = await (supabase as any).rpc("save_workflow_draft", {
        p_name: name,
        p_definition: def,
      });
      if (error) {
        console.warn("[useWorkflowDraft] server save failed; localStorage still up to date:", error.message);
      }
      if (mountedRef.current) setLastSavedAt(ts);
    },
    [orgId, userId, name],
  );

  const setDefinition = useCallback(
    (next: Definition) => {
      setDefinitionState(next);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void persistNow(next);
      }, DEBOUNCE_MS);
    },
    [persistNow],
  );

  const discard = useCallback(async () => {
    if (!orgId || !userId || !name) return;
    const key = localKey(orgId, userId, name);
    try { localStorage.removeItem(key); } catch {}
    await supabase
      .from("workflow_drafts" as any)
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .eq("name", name);
    if (mountedRef.current) {
      setDefinitionState(null);
      setLastSavedAt(null);
    }
  }, [orgId, userId, name]);

  return { definition, setDefinition, isLoading, lastSavedAt, discard, persistNow };
}
