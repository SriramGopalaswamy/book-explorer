import { useEffect, useState, useRef } from "react";
import { Bug, X, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionContext, readCachedSessionContext } from "@/hooks/useSessionContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface AuthEvt {
  ts: number;
  event: string;
  uid: string | null;
}

/**
 * Floating diagnostics panel that surfaces:
 *   - current userId, orgId, roles, super-admin flag, degraded flag
 *   - the cached sessionStorage bootstrap (so you can see whether the cache
 *     is being cleared on TOKEN_REFRESHED — it should NOT be)
 *   - a rolling log of the last 20 Supabase auth events
 *
 * Toggle with Ctrl+Shift+D (Cmd+Shift+D on macOS), or via the small bug icon
 * pinned to the bottom-right of the screen. Renders nothing visible until
 * opened — safe to mount unconditionally.
 */
export function SessionDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuthEvt[]>([]);
  const { user } = useAuth();
  const { data, isFetching, isLoading, refetch } = useSessionContext();
  const subRef = useRef<{ unsubscribe(): void } | null>(null);

  // Global toggle shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auth-event listener — independent from AuthContext so we still see events
  // even if the main listener changes its behavior.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      const entry: AuthEvt = { ts: Date.now(), event, uid };
      // eslint-disable-next-line no-console
      console.log("[auth-evt]", event, { uid });
      setEvents((prev) => [entry, ...prev].slice(0, 20));
    });
    subRef.current = sub.subscription;
    return () => subRef.current?.unsubscribe();
  }, []);

  const uid = user?.id ?? null;
  const cached = uid ? readCachedSessionContext(uid) : null;
  const ctx = data ?? cached;
  const orgId = ctx?.organizationId ?? null;
  const roles = ctx?.roles ?? [];
  const isSuperAdmin = !!ctx?.isSuperAdmin;
  const isDegraded =
    !!user && !isSuperAdmin && (!orgId || roles.length === 0);

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-3 right-3 z-[9999] h-8 w-8 rounded-full bg-background/90 border border-border shadow-md hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
        title="Session diagnostics (Ctrl+Shift+D)"
        aria-label="Session diagnostics"
      >
        <Bug className="h-4 w-4" />
      </button>

      {open && (
        <div
          data-testid="session-diagnostics-panel"
          className="fixed bottom-14 right-3 z-[9999] w-[360px] max-h-[70vh] overflow-auto rounded-lg border border-border bg-background shadow-xl text-xs"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <div className="font-semibold flex items-center gap-1.5">
              <Bug className="h-3.5 w-3.5" /> Session Diagnostics
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Refetch session context"
                onClick={() => refetch()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Clear event log"
                onClick={() => setEvents([])}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="p-3 space-y-3">
            <section className="space-y-1">
              <div className="text-muted-foreground uppercase tracking-wide text-[10px]">Context</div>
              <Row label="userId" value={uid ?? "—"} />
              <Row label="orgId" value={orgId ?? "—"} />
              <Row label="roles" value={roles.length ? roles.join(", ") : "—"} />
              <Row label="superAdmin" value={String(isSuperAdmin)} />
              <Row
                label="degraded"
                value={String(isDegraded)}
                emphasis={isDegraded ? "danger" : "ok"}
              />
              <Row label="loading" value={String(isLoading)} />
              <Row label="cached" value={cached ? "yes" : "no"} />
            </section>
            <section className="space-y-1">
              <div className="text-muted-foreground uppercase tracking-wide text-[10px]">
                Auth events ({events.length})
              </div>
              {events.length === 0 ? (
                <div className="text-muted-foreground italic">No events yet.</div>
              ) : (
                <ul className="space-y-0.5">
                  {events.map((e, i) => (
                    <li
                      key={i}
                      className="font-mono text-[11px] flex justify-between gap-2"
                    >
                      <span>
                        <span className="text-muted-foreground">
                          {new Date(e.ts).toLocaleTimeString()}
                        </span>{" "}
                        {e.event}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {e.uid?.slice(0, 8) ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "ok" | "danger";
}) {
  const tone =
    emphasis === "danger"
      ? "text-destructive"
      : emphasis === "ok"
        ? "text-green-500"
        : "";
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono truncate max-w-[220px] ${tone}`} title={value}>
        {value}
      </span>
    </div>
  );
}
