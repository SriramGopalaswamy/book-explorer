/**
 * GBC-16: Audit logging is now performed server-side by AFTER INSERT/UPDATE/DELETE
 * triggers (`zzz_audit_<table>`) on every business table. The browser is no longer
 * trusted to write to `audit_logs` — RLS denies all client writes.
 *
 * This hook is intentionally a no-op so existing call sites compile while we
 * remove them gradually. Do NOT re-introduce a real client-side insert here.
 */
export function useWriteAuditLog() {
  return async (..._args: unknown[]): Promise<void> => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        "[audit] useWriteAuditLog is deprecated — audit rows are written server-side by DB triggers.",
      );
    }
  };
}

export default useWriteAuditLog;
