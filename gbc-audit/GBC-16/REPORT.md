# GBC-16: Client-side audit log writes (`useWriteAuditLog`)

**Severity:** Low · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** outdated

## Root cause
Issue says `useWriteAuditLog.ts` lets the browser write directly to `audit_logs`. **Hook does not exist** in the current `src/hooks/`:
```
$ ls src/hooks/useWriteAuditLog*  →  not found
```

If a browser-writable audit log existed, that would indeed be tamperable — DevTools could fabricate or delete entries, breaking forensic value. The fix the issue prescribes (DB triggers writing to `audit_logs` automatically, removing the client write path) is the right shape.

## Council verdict (compressed)
- *Contrarian:* Issue is outdated; nothing to do.
- *First-Principles:* Audit logs are a database concern. Client-driven audit writes should never have existed; if any caller still inserts into `audit_logs` directly, fix that.
- *Expansionist:* `grep -rn 'audit_logs' src/` for any direct INSERTs from frontend code.
- *Executor:* Spot-check; if any direct insert exists, ticket separately.

## Status
outdated — close as resolved unless a `grep` surfaces a remaining direct insert.

## What didn't change (needs-input — verify)
Run `grep -rn "from(['\"]audit_logs['\"])" src/ --include='*.ts' --include='*.tsx'`. If hits exist:
- Move logging to a database trigger (`AFTER INSERT/UPDATE/DELETE` on the source table) writing to `audit_logs`.
- Remove the frontend insert path.

## Risks
1. None if the hook truly doesn't exist; verify with the grep above.
2. Lint/build/test could not run in this sandbox.
