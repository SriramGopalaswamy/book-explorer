/**
 * Lightweight client-side tracer for auth & subscription flow.
 *
 * Goals:
 *  - Diagnose unexpected bounces to /subscription/activate.
 *  - Diagnose MS365 callback hangs / hard-refresh requirements.
 *
 * Records last N events in memory + window.__authTrace for live inspection
 * from DevTools, AND mirrors to console with a stable prefix so they can be
 * grepped in production logs (e.g. shipped via Sentry breadcrumbs later).
 */

export type AuthTraceEvent = {
  ts: number;            // epoch ms
  rel: number;           // ms since first event in this session
  scope: "ms365" | "subscription" | "session" | "roles-ready-gate" | "auth";
  type: string;          // short event name
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 200;
const buffer: AuthTraceEvent[] = [];
let t0: number | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __authTrace: AuthTraceEvent[] | undefined;
}

if (typeof window !== "undefined") {
  // Expose for live debugging: `copy(__authTrace)` in DevTools console.
  window.__authTrace = buffer;
}

export function authTrace(
  scope: AuthTraceEvent["scope"],
  type: string,
  data?: Record<string, unknown>,
): void {
  const ts = Date.now();
  if (t0 === null) t0 = ts;
  const evt: AuthTraceEvent = { ts, rel: ts - t0, scope, type, data };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) buffer.shift();
  // eslint-disable-next-line no-console
  console.info(
    `[auth-trace] ${scope}:${type} +${evt.rel}ms`,
    data ?? "",
  );
}

/** Reset baseline — call at the start of a new MS365 sign-in attempt. */
export function authTraceReset() {
  t0 = null;
  buffer.length = 0;
}

/** For tests / diagnostics panels. */
export function getAuthTrace(): readonly AuthTraceEvent[] {
  return buffer;
}
