/**
 * Structured error logger for Edge Functions.
 *
 * Usage:
 *   import { logError } from "../_shared/logger.ts";
 *   ...
 *   } catch (err) {
 *     logError("my-function", err, { user_id, extra_context });
 *     return json({ error: (err as Error).message }, 500);
 *   }
 *
 * Output is NDJSON written to stderr so it is captured by Supabase's
 * Edge Function log stream and can be queried in the dashboard or via
 * `supabase functions logs`.
 */

export interface LogContext {
  [key: string]: unknown;
}

export function logError(
  functionName: string,
  err: unknown,
  context: LogContext = {}
): void {
  const entry = {
    level: "error",
    function: functionName,
    message: err instanceof Error ? err.message : String(err),
    stack:   err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    ...context,
  };
  // Supabase Edge Functions route stderr to the structured log stream
  console.error(JSON.stringify(entry));
}

export function logWarn(
  functionName: string,
  message: string,
  context: LogContext = {}
): void {
  const entry = {
    level: "warn",
    function: functionName,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  console.warn(JSON.stringify(entry));
}

export function logInfo(
  functionName: string,
  message: string,
  context: LogContext = {}
): void {
  const entry = {
    level: "info",
    function: functionName,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  console.log(JSON.stringify(entry));
}
