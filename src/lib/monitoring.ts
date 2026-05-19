/**
 * Lightweight monitoring wrapper. In production this would forward to Sentry
 * or a similar service. Hooks should use captureError() instead of
 * console.warn/error so failures are visible in the monitoring dashboard.
 */

type ErrorContext = Record<string, unknown>;

export function captureError(err: unknown, context?: ErrorContext): void {
  // Forward to Sentry when the DSN is configured
  if (typeof window !== "undefined" && (window as any).__SENTRY__) {
    try {
      (window as any).__SENTRY__.captureException(err, { extra: context });
      return;
    } catch {
      // fall through to console
    }
  }
  console.error("[captureError]", err, context);
}

export function identifyUser(id: string, traits?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && (window as any).__SENTRY__) {
    try {
      (window as any).__SENTRY__.setUser({ id, ...traits });
    } catch {
      // no-op
    }
  }
}

export function trackMutation<TArgs, TResult>(
  label: string,
  fn: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs) => {
    try {
      return await fn(args);
    } catch (err) {
      captureError(err, { context: label });
      throw err;
    }
  };
}
